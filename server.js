require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs').promises; // 使用fs.promises
const { Worker } = require('worker_threads');
const path = require('path');
const AuthManager = require('./middleware/auth');

class MCPServer {
  constructor(options = {}) {
    this.port = options.port;
    this.wsPort = options.wsPort;
    this.toolsDir = options.toolsDir;
    this.tools = new Map();
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ port: this.wsPort });
    this.sseConnections = [];
    
    // 初始化鉴权管理器
    this.auth = new AuthManager({
      enabled: options.authEnabled,
      secretKey: options.secretKey,
      tokenExpiry: options.tokenExpiry,
      rateLimiting: options.rateLimitingEnabled
    });
    
    this.setupMiddleware();
    // 异步加载工具，注意构造函数中不能直接await，所以用.then()
    this.loadToolsAsync(this.toolsDir).catch(err => console.error("Failed to initialize tools:", err));
    this.setupRoutes();
    this.setupWebSocket();
  }

  setupMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS支持
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
      res.header('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // 应用鉴权中间件
    this.app.use(this.auth.middleware());
  }

  async loadToolsAsync(toolsDir) {
    const toolsPath = path.resolve(toolsDir);
    
    try {
      await fs.access(toolsPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`Tools directory not found, creating: ${toolsPath}`);
        await fs.mkdir(toolsPath, { recursive: true });
        return;
      }
      throw error; // 抛出其他错误
    }

    const toolFiles = (await fs.readdir(toolsPath)).filter(file => file.endsWith('.js'));
    
    const loadPromises = toolFiles.map(async (file) => {
      try {
        const fullPath = path.join(toolsPath, file);
        // For CJS compatibility with dynamic import, ensure paths are file URLs
        const modulePath = 'file:///' + fullPath.replace(/\\/g, '/');
        
        // 使用动态 import() 来异步加载模块
        // 添加时间戳来绕过缓存，实现热重载
        const toolModule = await import(`${modulePath}?t=${Date.now()}`);
        const tool = toolModule.default || toolModule;

        if (tool && typeof tool.execute === 'function' && tool.name) {
          this.tools.set(tool.name, tool);
          console.log(`Loaded tool: ${tool.name}`);
        } else {
          console.warn(`Invalid tool format in ${file}`);
        }
      } catch (error) {
        console.error(`Error loading tool ${file}:`, error.message);
      }
    });

    await Promise.all(loadPromises);
    console.log(`Loaded ${this.tools.size} tools`);
  }

  // 重新加载工具
  async reloadTools() {
    this.tools.clear();
    console.log('Reloading tools...');
    await this.loadToolsAsync(this.toolsDir);
    console.log('Tools reloaded.');
  }

  setupRoutes() {
    // Middleware to check for admin privileges
    const adminOnly = (req, res, next) => {
      if (req.auth && req.auth.isAdmin) {
        return next();
      }
      return res.status(403).json({
        jsonrpc: '2.0',
        error: { code: -32003, message: 'Insufficient permissions: Admin access required' }
      });
    };

    // 健康检查
    this.app.get('/health', async (req, res) => {
      try {
        const authStats = await this.auth.getStats();
        res.json({
          status: 'ok',
          timestamp: new Date().toISOString(),
          tools: Array.from(this.tools.keys()),
          auth: authStats
        });
      } catch (error) {
        console.error('Failed to get health stats:', error);
        res.status(500).json({
          status: 'error',
          message: 'Failed to retrieve health statistics.'
        });
      }
    });

    // 获取工具列表
    this.app.get('/tools', (req, res) => {
      const toolList = this.getToolsForUser(req.auth);
      
      res.json({
        jsonrpc: '2.0',
        result: {
          tools: toolList.map(tool => ({
            name: tool.name,
            description: tool.description || '',
            inputSchema: {
              type: 'object',
              properties: tool.parameters || {},
              required: tool.required || []
            }
          }))
        }
      });
    });

    // 主要的JSON-RPC端点
    this.app.post('/jsonrpc', async (req, res) => {
      await this.handleJsonRpc(req.body, res);
    });

    // 兼容MCP协议的端点
    this.app.post('/mcp', async (req, res) => {
      await this.handleJsonRpc(req.body, res);
    });

    // --- SSE Routes ---

    // SSE connection endpoint
    this.app.get('/sse', (req, res) => {
      console.log('New MCP SSE client connected');

      // Set SSE response headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      // Per MCP spec, send the endpoint for messages
      res.write('event: endpoint\n');
      res.write('data: /messages\n\n');

      // Keep connection alive
      const keepAlive = setInterval(() => {
        res.write(': heartbeat\n\n');
      }, 30000);

      this.sseConnections.push(res);

      // Clean up on disconnect
      req.on('close', () => {
        console.log('MCP SSE client disconnected');
        clearInterval(keepAlive);
        const index = this.sseConnections.indexOf(res);
        if (index > -1) {
          this.sseConnections.splice(index, 1);
        }
      });
    });

    // SSE message receiving endpoint
    this.app.post('/messages', async (req, res) => {
      // Authenticate the request if auth is enabled
      const authResult = req.auth;

      const response = await this.processJsonRpc(req.body, authResult);
      
      console.log('Broadcasting MCP response via SSE for method:', req.body.method);

      // Broadcast the response to all connected SSE clients
      this.broadcastToSseClients(response);

      // Per MCP spec, return HTTP 202 Accepted
      res.sendStatus(202);
    });

    // 重载工具端点
    // 重载工具端点
    this.app.post('/reload', adminOnly, async (req, res) => {
      await this.reloadTools();
      const accessibleTools = this.getToolsForUser(req.auth).map(t => t.name);
      res.json({
        jsonrpc: '2.0',
        result: {
          message: 'Tools reloaded successfully',
          tools: accessibleTools
        }
      });
    });

    // --- Admin User Management Routes ---


    // Get all users
    this.app.get('/admin/users', adminOnly, (req, res) => {
      const users = this.auth.getAllUsers();
      res.json({
        jsonrpc: '2.0',
        result: users.map(u => ({ id: u.id, name: u.name, token: u.token, permissions: u.permissions, createdAt: u.createdAt, rateLimits: u.rateLimits, expiresAt: u.expiresAt }))
      });
    });

    // Add a new user
    this.app.post('/admin/users', adminOnly, async (req, res) => {
      const { id, name, permissions, rateLimits, expiresAt } = req.body;
      if (!id) {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32602, message: 'Invalid params: missing user id' }
        });
      }
      try {
        const newUser = await this.auth.addUser({ id, name, permissions, rateLimits, expiresAt });
        res.status(201).json({ jsonrpc: '2.0', result: newUser });
      } catch (error) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: error.message }
        });
      }
    });

    // Delete a user
    this.app.delete('/admin/users/:id', adminOnly, (req, res) => {
      const { id } = req.params;
      const success = this.auth.removeUser(id);
      if (success) {
        res.json({ jsonrpc: '2.0', result: { message: `User ${id} removed successfully` } });
      } else {
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: `User not found: ${id}` }
        });
      }
    });

    // Update a user
    this.app.patch('/admin/users/:id', adminOnly, async (req, res) => {
      const { id } = req.params;
      const updates = req.body;

      try {
        const updatedUser = await this.auth.updateUser(id, updates);
        res.json({ jsonrpc: '2.0', result: updatedUser });
      } catch (error) {
        const statusCode = error.message.includes('not found') ? 404 : 400;
        res.status(statusCode).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: error.message }
        });
      }
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, request) => {
      console.log('WebSocket connection attempt');
      
      // 从查询参数或头部提取token
      const url = new URL(request.url, 'ws://localhost');
      const token = url.searchParams.get('token') || 
                   request.headers.authorization?.replace('Bearer ', '') ||
                   request.headers['x-api-key'];

      // 鉴权检查
      const authResult = this.auth.authenticateWebSocket(token);
      if (!authResult.authenticated) {
        console.log('WebSocket authentication failed:', authResult.error);
        ws.close(1008, authResult.error);
        return;
      }

      console.log('WebSocket client authenticated');
      ws.auth = authResult.tokenInfo;
      
      ws.on('message', async (data) => {
        try {
          const request = JSON.parse(data.toString());
          
          // 检查权限（如果需要）
          if (request.method === 'tools/call') {
            const toolName = request.params?.name;
            if (toolName && ws.auth && !this.auth.hasPermission(ws.auth, `tool:${toolName}`) && !this.auth.hasPermission(ws.auth, '*')) {
              const errorResponse = this.createErrorResponse(request.id, -32003, 'Insufficient permissions for this tool');
              ws.send(JSON.stringify(errorResponse));
              return;
            }
          }

          const response = await this.processJsonRpc(request);
          ws.send(JSON.stringify(response));
        } catch (error) {
          const errorResponse = this.createErrorResponse(null, -32700, 'Parse error');
          ws.send(JSON.stringify(errorResponse));
        }
      });

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
      });

      // 发送初始化信息
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'server/initialized',
        params: {
          capabilities: {
            tools: Array.from(this.tools.keys()),
            authentication: this.auth.enabled
          },
          userInfo: ws.auth ? {
            userId: ws.auth.userId || ws.auth.id,
            permissions: ws.auth.permissions
          } : null
        }
      }));
    });
  }

  async handleJsonRpc(body, res) {
    let response;
    
    if (Array.isArray(body)) {
      // 批量请求
      response = await Promise.all(body.map(req => this.processJsonRpc(req, res.req.auth)));
    } else {
      // 单个请求
      response = await this.processJsonRpc(body, res.req.auth);
    }
    
    res.json(response);
  }

  async processJsonRpc(request, auth = null) {
    // 验证JSON-RPC 2.0格式
    if (!request || request.jsonrpc !== '2.0') {
      return this.createErrorResponse(request?.id, -32600, 'Invalid Request');
    }

    const { method, params, id } = request;

    try {
      switch (method) {
        case 'initialize':
          return this.handleInitialize(id, params);
        
        case 'tools/list':
          return this.handleToolsList(id, auth);
        
        case 'tools/call':
          return await this.handleToolCall(id, params, auth);
        
        case 'server/ping':
          return this.createSuccessResponse(id, { pong: true, timestamp: Date.now() });
        
        default:
          return this.createErrorResponse(id, -32601, 'Method not found');
      }
    } catch (error) {
      console.error('Error processing request:', error);
      return this.createErrorResponse(id, -32603, 'Internal error', error.message);
    }
  }

  handleInitialize(id, params) {
    return this.createSuccessResponse(id, {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      },
      serverInfo: {
        name: 'Custom MCP Server',
        version: '1.0.0'
      }
    });
  }

  handleToolsList(id, auth = null) {
    const tools = this.getToolsForUser(auth).map(tool => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: {
        type: 'object',
        properties: tool.parameters || {},
        required: tool.required || []
      }
    }));

    return this.createSuccessResponse(id, { tools });
  }

  async handleToolCall(id, params, auth = null) {
    if (!params || !params.name) {
      return this.createErrorResponse(id, -32602, 'Invalid params: missing tool name');
    }

    const tool = this.tools.get(params.name);
    if (!tool) {
      return this.createErrorResponse(id, -32602, `Tool not found: ${params.name}`);
    }

    // 检查工具权限
    if (auth && !this.auth.hasPermission(auth, `tool:${params.name}`) && !this.auth.hasPermission(auth, '*')) {
      return this.createErrorResponse(id, -32003, `Insufficient permissions for tool: ${params.name}`);
    }

    try {
      const toolArgs = params.arguments || {};
      const operation = toolArgs.operation; // 从 arguments 中获取 operation

      let result;
      // 检查是否是CPU密集型任务
      if (operation && tool.cpu && typeof tool.cpu[operation] === 'function') {
        console.log(`Executing CPU-intensive operation '${operation}' for tool '${params.name}' in a worker.`);
        const func = tool.cpu[operation];
        result = await this.runCpuIntensiveTask(func, toolArgs);
      } else {
        // 否则，执行标准的execute方法
        if (typeof tool.execute !== 'function') {
          throw new Error(`Tool '${params.name}' does not have an execute method or a matching CPU operation for '${operation}'.`);
        }
        result = await tool.execute(toolArgs);
      }
      
      return this.createSuccessResponse(id, {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          }
        ]
      });
    } catch (error) {
      console.error(`Error executing tool ${params.name}:`, error);
      return this.createErrorResponse(id, -32603, `Tool execution error: ${error.message}`);
    }
  }

  runCpuIntensiveTask(func, args) {
    return new Promise((resolve, reject) => {
      const workerPath = path.resolve(__dirname, './worker/generic-worker.js');
      const worker = new Worker(workerPath);

      worker.on('message', (message) => {
        if (message.status === 'success') {
          resolve(message.result);
        } else {
          // Reconstruct error object
          const err = new Error(message.error.message);
          err.stack = message.error.stack;
          reject(err);
        }
        worker.terminate();
      });

      worker.on('error', (error) => {
        reject(error);
        worker.terminate();
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          // This might be redundant if error event is already handled
          // reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });

      // Send the function's source code and arguments to the worker
      worker.postMessage({
        funcString: func.toString(),
        args: args
      });
    });
  }

  broadcastToSseClients(response) {
    if (this.sseConnections.length === 0) {
      return;
    }
    
    const ssePayload = `event: message\ndata: ${JSON.stringify(response)}\n\n`;

    this.sseConnections.forEach((conn, index) => {
      try {
        conn.write(ssePayload);
      } catch (error) {
        console.error(`Failed to send to SSE client ${index}:`, error);
        // Optional: remove broken connection
        conn.end();
      }
    });
  }

  createSuccessResponse(id, result) {
    return {
      jsonrpc: '2.0',
      id,
      result
    };
  }

  createErrorResponse(id, code, message, data = null) {
    const response = {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message
      }
    };

    if (data) {
      response.error.data = data;
    }

    return response;
  }

  start() {
    this.server.listen(this.port, () => {
      console.log(`MCP Server running on:`);
      console.log(`  HTTP: http://localhost:${this.port}`);
      console.log(`  WebSocket: ws://localhost:${this.wsPort}`);
      console.log(`  SSE: http://localhost:${this.port}/sse`);
      console.log(`  Health check: http://localhost:${this.port}/health`);
      console.log(`  Tools list: http://localhost:${this.port}/tools`);
      console.log('\nAvailable endpoints:');
      console.log('  POST /jsonrpc - Main JSON-RPC endpoint');
      console.log('  POST /mcp - MCP compatible endpoint');
      console.log('  POST /reload - Reload tools');
      console.log(`\nLoaded ${this.tools.size} tools:`, Array.from(this.tools.keys()));
    });
  }

  stop() {
    // Close all active SSE connections
    this.sseConnections.forEach(res => res.end());
    this.sseConnections = [];
    console.log('Closed all SSE connections');

    this.server.close();
    this.wss.close();
    console.log('Server stopped');
  }

  getToolsForUser(auth) {
    const allTools = Array.from(this.tools.values());

    if (!this.auth.enabled || (auth && auth.isAdmin)) {
      return allTools;
    }

    if (!auth) {
      return [];
    }

    return allTools.filter(tool =>
      this.auth.hasPermission(auth, `tool:${tool.name}`) || this.auth.hasPermission(auth, '*')
    );
  }
}

// 如果直接运行此文件
if (require.main === module) {
  // 使用异步IIFE来处理顶层的await
  (async () => {
    // 从环境变量加载配置
    const config = {
      port: parseInt(process.env.PORT, 10) || 3000,
      wsPort: parseInt(process.env.WS_PORT, 10) || 3001,
      toolsDir: process.env.TOOLS_DIR || './tools',
      authEnabled: process.env.AUTH_ENABLED !== 'false',
      secretKey: process.env.JWT_SECRET,
      rateLimitingEnabled: process.env.RATE_LIMITING_ENABLED !== 'false'
    };

    // 创建服务器实例
    const server = new MCPServer(config);
    
    // 由于构造函数中的加载是异步的，我们在这里可以等待它完成（如果需要）
    // 但由于我们用了.then()，服务器会启动，工具会在后台加载。
    // 为了确保启动信息打印时工具已加载，我们可以在start之前等待
    // 不过当前设计是并行启动，所以直接start()。

    server.start();

    console.log('MCP Server starting with configuration:');
    console.log(`  HTTP Port: ${config.port}`);
    console.log(`  WebSocket Port: ${config.wsPort}`);
    console.log(`  Tools Directory: ${path.resolve(config.toolsDir)}`);
    console.log(`  Authentication: ${config.authEnabled ? 'Enabled' : 'Disabled'}`);
    console.log(`  Rate Limiting: ${config.rateLimitingEnabled ? 'Enabled' : 'Disabled'}`);
    console.log('');


  // 优雅关闭处理
  const gracefulShutdown = (signal) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    server.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // 未捕获的异常处理
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    server.stop();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
})(); //立即执行异步函数
}

module.exports = MCPServer;