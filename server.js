require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
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
    
    // 初始化鉴权管理器
    this.auth = new AuthManager({
      enabled: options.authEnabled,
      secretKey: options.secretKey,
      tokenExpiry: options.tokenExpiry,
      rateLimiting: options.rateLimitingEnabled
    });
    
    this.setupMiddleware();
    this.loadTools(this.toolsDir);
    this.setupRoutes();
    this.setupWebSocket();
  }

  setupMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS支持
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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

  loadTools(toolsDir) {
    const toolsPath = path.resolve(toolsDir);
    
    if (!fs.existsSync(toolsPath)) {
      console.log(`Tools directory not found, creating: ${toolsPath}`);
      fs.mkdirSync(toolsPath, { recursive: true });
      return;
    }

    const toolFiles = fs.readdirSync(toolsPath).filter(file => file.endsWith('.js'));
    
    for (const file of toolFiles) {
      try {
        const fullPath = path.join(toolsPath, file);
        delete require.cache[require.resolve(fullPath)]; // 热重载支持
        const tool = require(fullPath);
        
        if (tool && typeof tool.execute === 'function' && tool.name) {
          this.tools.set(tool.name, tool);
          console.log(`Loaded tool: ${tool.name}`);
        } else {
          console.warn(`Invalid tool format in ${file}`);
        }
      } catch (error) {
        console.error(`Error loading tool ${file}:`, error.message);
      }
    }

    console.log(`Loaded ${this.tools.size} tools`);
  }

  // 重新加载工具
  reloadTools() {
    this.tools.clear();
    this.loadTools(this.toolsDir);
  }

  setupRoutes() {
    // 健康检查
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        tools: Array.from(this.tools.keys()),
        auth: this.auth.getStats()
      });
    });


    // 获取工具列表
    this.app.get('/tools', (req, res) => {
      const toolList = Array.from(this.tools.values()).map(tool => ({
        name: tool.name,
        description: tool.description || '',
        parameters: tool.parameters || {},
        examples: tool.examples || []
      }));
      
      res.json({
        jsonrpc: '2.0',
        result: toolList
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

    // 重载工具端点
    this.app.post('/reload', (req, res) => {
      this.reloadTools();
      res.json({ 
        jsonrpc: '2.0',
        result: { 
          message: 'Tools reloaded successfully',
          tools: Array.from(this.tools.keys())
        }
      });
    });

    // --- Admin User Management Routes ---

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

    // Get all users
    this.app.get('/admin/users', adminOnly, (req, res) => {
      const users = this.auth.getAllUsers();
      res.json({
        jsonrpc: '2.0',
        result: users.map(u => ({ id: u.id, name: u.name, permissions: u.permissions, createdAt: u.createdAt, rateLimits: u.rateLimits, expiresAt: u.expiresAt }))
      });
    });

    // Add a new user
    this.app.post('/admin/users', adminOnly, (req, res) => {
      const { id, name, permissions, rateLimits, expiresAt } = req.body;
      if (!id) {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32602, message: 'Invalid params: missing user id' }
        });
      }
      try {
        const newUser = this.auth.addUser({ id, name, permissions, rateLimits, expiresAt });
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
    this.app.patch('/admin/users/:id', adminOnly, (req, res) => {
      const { id } = req.params;
      const updates = req.body;

      try {
        const updatedUser = this.auth.updateUser(id, updates);
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
          return this.handleToolsList(id);
        
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

  handleToolsList(id) {
    const tools = Array.from(this.tools.values()).map(tool => ({
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
      const result = await tool.execute(params.arguments || {});
      
      return this.createSuccessResponse(id, {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          }
        ]
      });
    } catch (error) {
      return this.createErrorResponse(id, -32603, `Tool execution error: ${error.message}`);
    }
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
    this.server.close();
    this.wss.close();
    console.log('Server stopped');
  }
}

// 如果直接运行此文件
if (require.main === module) {
  // 从环境变量加载配置
  const config = {
    port: parseInt(process.env.PORT, 10) || 3000,
    wsPort: parseInt(process.env.WS_PORT, 10) || 3001,
    toolsDir: process.env.TOOLS_DIR || './tools',
    authEnabled: process.env.AUTH_ENABLED !== 'false',
    secretKey: process.env.JWT_SECRET,
    rateLimitingEnabled: process.env.RATE_LIMITING_ENABLED !== 'false'
  };

  // 创建并启动服务器
  const server = new MCPServer(config);
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
}

module.exports = MCPServer;