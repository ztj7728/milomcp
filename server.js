require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path =require('path');

// Import services
const authServicePromise = require('./services/auth');
const userServicePromise = require('./services/user');
const workspaceService = require('./services/workspace'); // This one is not a promise
const environmentServicePromise = require('./services/environment');
const dbPromise = require('./db/database');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});


// IIFE to start the server
(async () => {
  try {
    const authService = await authServicePromise;
    const userService = await userServicePromise;
    const environmentService = await environmentServicePromise;
    const db = await dbPromise;

    // --- Admin Bootstrap ---
    const setupInitialAdmin = async () => {
      const adminUser = process.env.INITIAL_ADMIN_USER;
      const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
      if (!adminUser || !adminPassword) {
        console.log('Initial admin user not set in .env, skipping bootstrap.');
        return;
      }
      const existingAdmin = await db.get("SELECT * FROM users WHERE isAdmin = true");
      if (!existingAdmin) {
        console.log('No admin found, creating initial admin user...');
        const newAdmin = await userService.createUser({
          username: adminUser,
          password: adminPassword,
          name: 'Administrator'
        });
        // Set the user as admin using their correct UUID
        await db.run("UPDATE users SET isAdmin = true WHERE id = ?", newAdmin.id);
        console.log(`Admin user '${adminUser}' created.`);
      }
    };
    await setupInitialAdmin();


    // --- API Routes ---
    const apiRouter = express.Router();
    
    // Public routes
    apiRouter.post('/sign-up', async (req, res) => {
        const { username, password, name } = req.body;
        if (!username || !password || !name) {
            return res.status(400).json({ status: 'error', error: { code: 'INVALID_INPUT', message: 'Username, password, and name are required.' } });
        }
        try {
            const newUser = await userService.createUser({ username, password, name });
            res.status(201).json({ status: 'success', data: newUser });
        } catch (error) {
            res.status(500).json({ status: 'error', error: { code: 'USER_CREATION_FAILED', message: error.message } });
        }
    });

    apiRouter.post('/login', async (req, res) => {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ status: 'error', error: { code: 'INVALID_INPUT', message: 'Username and password are required.' } });
        }
        try {
            const result = await authService.login(username, password);
            res.json({ status: 'success', data: result });
        } catch (error) {
            res.status(401).json({ status: 'error', error: { code: 'AUTHENTICATION_FAILED', message: error.message } });
        }
    });

    // Protected routes middleware
    const protect = authService.verifyAccessToken();

    // Middleware to protect routes and check for admin privileges
    const adminOnly = (req, res, next) => {
        if (!req.user || !req.user.isAdmin) {
            return res.status(403).json({ status: 'error', error: { code: 'FORBIDDEN', message: 'Administrator access required.' } });
        }
        next();
    };
    
    // User & Token Management
    apiRouter.get('/me', protect, async (req, res) => {
        try {
            const user = await userService.findUserById(req.user.userId);
            if (!user) {
                return res.status(404).json({ status: 'error', error: { code: 'NOT_FOUND', message: 'User not found.' } });
            }
            res.json({ status: 'success', data: user });
        } catch (error) {
            res.status(500).json({ status: 'error', error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve user information.' } });
        }
    });

    apiRouter.get('/tokens', protect, async (req, res) => {
        const tokens = await userService.listTokens(req.user.userId);
        res.json({ status: 'success', data: tokens });
    });

    apiRouter.post('/tokens', protect, async (req, res) => {
        const { name, permissions } = req.body;

        // Elegantly validate the permissions format
        if (permissions) { // It's an optional field, but if present, it must be correct.
            if (!Array.isArray(permissions) || permissions.length === 0 || !permissions.every(p => typeof p === 'string')) {
                return res.status(400).json({
                    status: 'error',
                    error: {
                        code: 'INVALID_INPUT',
                        message: 'The "permissions" field must be a non-empty array of strings (e.g., ["calculator", "weather"] or ["*"]).'
                    }
                });
            }
        }

        const token = await userService.createToken(req.user.userId, { name, permissions });
        res.status(201).json({ status: 'success', data: token });
    });

    apiRouter.delete('/tokens/:token', protect, async (req, res) => {
        const { token } = req.params;
        const success = await userService.revokeToken(token, req.user.userId);
        if (success) {
            res.json({ status: 'success', data: { message: 'Token revoked.' } });
        } else {
            res.status(404).json({ status: 'error', error: { code: 'NOT_FOUND', message: 'Token not found or you do not have permission to revoke it.' } });
        }
    });

    // User's Tool Management
    apiRouter.get('/tools', protect, async (req, res) => {
        try {
            const tools = await workspaceService.listTools(req.user.userId);
            res.json({ status: 'success', data: tools });
        } catch (error) {
            res.status(500).json({ status: 'error', error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve tool list.' } });
        }
    });

    // Admin User Management
    apiRouter.get('/users', protect, adminOnly, async (req, res) => {
        try {
            const users = await userService.listAllUsers();
            res.json({ status: 'success', data: users });
        } catch (error) {
            res.status(500).json({ status: 'error', error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve user list.' } });
        }
    });

    apiRouter.post('/users', protect, adminOnly, async (req, res) => {
        const { username, password, name } = req.body;
        if (!username || !password || !name) {
            return res.status(400).json({ status: 'error', error: { code: 'INVALID_INPUT', message: 'Username, password, and name are required.' } });
        }
        try {
            const newUser = await userService.createUser({ username, password, name });
            res.status(201).json({ status: 'success', data: newUser });
        } catch (error) {
            res.status(500).json({ status: 'error', error: { code: 'USER_CREATION_FAILED', message: error.message } });
        }
    });

    apiRouter.delete('/users/:id', protect, adminOnly, async (req, res) => {
        try {
            const userIdToDelete = req.params.id;
            const currentUserId = req.user.userId;
            await userService.deleteUser(userIdToDelete, currentUserId);
            res.json({ status: 'success', data: { message: 'User deleted successfully.' } });
        } catch (error) {
            // Check for specific error messages to provide better status codes
            if (error.message.includes('cannot delete their own account')) {
                return res.status(400).json({ status: 'error', error: { code: 'BAD_REQUEST', message: error.message } });
            }
            if (error.message.includes('User not found')) {
                return res.status(404).json({ status: 'error', error: { code: 'NOT_FOUND', message: error.message } });
            }
            res.status(500).json({ status: 'error', error: { code: 'INTERNAL_ERROR', message: error.message } });
        }
    });

    // Environment Management
    apiRouter.get('/environment', protect, async (req, res) => {
        const env = await environmentService.getEnvironment(req.user.userId);
        res.json({ status: 'success', data: env });
    });

    apiRouter.post('/environment', protect, async (req, res) => {
        const { key, value } = req.body;
        if (!key || value === undefined) {
            return res.status(400).json({ status: 'error', error: { code: 'INVALID_INPUT', message: 'Key and value are required.' } });
        }
        await environmentService.setVariable(req.user.userId, key, value);
        res.status(201).json({ status: 'success', data: { [key]: value } });
    });

    apiRouter.delete('/environment/:key', protect, async (req, res) => {
        const { key } = req.params;
        const success = await environmentService.deleteVariable(req.user.userId, key);
        if (success) {
            res.json({ status: 'success', data: { message: `Variable ${key} deleted.` } });
        } else {
            res.status(404).json({ status: 'error', error: { code: 'NOT_FOUND', message: `Variable ${key} not found.` } });
        }
    });

    // Workspace File Management
    const workspaceRouter = express.Router();
    workspaceRouter.use(protect); // All workspace routes are protected

    // List all tool files
    workspaceRouter.get('/files', async (req, res) => {
        try {
            const files = await workspaceService.listFiles(req.user.userId);
            res.json({ status: 'success', data: files });
        } catch (error) {
            res.status(500).json({ status: 'error', error: { code: 'INTERNAL_ERROR', message: 'Could not list workspace files.' } });
        }
    });

    // Get a single tool file's content
    workspaceRouter.get('/files/:filename', async (req, res) => {
        try {
            const { filename } = req.params;
            const content = await workspaceService.readFile(req.user.userId, filename);
            res.setHeader('Content-Type', 'text/plain');
            res.send(content);
        } catch (error) {
            if (error.message.includes('Invalid filename')) {
                return res.status(400).json({ status: 'error', error: { code: 'INVALID_INPUT', message: error.message } });
            }
            if (error.message.includes('File not found')) {
                return res.status(404).json({ status: 'error', error: { code: 'NOT_FOUND', message: error.message } });
            }
            res.status(500).json({ status: 'error', error: { code: 'INTERNAL_ERROR', message: 'Could not read file.' } });
        }
    });

    // Create or update a tool file
    workspaceRouter.put('/files/:filename', express.text({ type: '*/*' }), async (req, res) => {
        try {
            const { filename } = req.params;
            const content = req.body;
            if (typeof content !== 'string' || content.length === 0) {
                return res.status(400).json({ status: 'error', error: { code: 'INVALID_INPUT', message: 'Request body must contain the non-empty file content.' } });
            }
            await workspaceService.writeFile(req.user.userId, filename, content);
            res.status(200).json({ status: 'success', data: { message: `File '${filename}' saved successfully.` } });
        } catch (error) {
            if (error.message.includes('Invalid filename')) {
                return res.status(400).json({ status: 'error', error: { code: 'INVALID_INPUT', message: error.message } });
            }
            res.status(500).json({ status: 'error', error: { code: 'INTERNAL_ERROR', message: 'Could not save file.' } });
        }
    });

    // Delete a tool file
    workspaceRouter.delete('/files/:filename', async (req, res) => {
        try {
            const { filename } = req.params;
            await workspaceService.deleteFile(req.user.userId, filename);
            res.json({ status: 'success', data: { message: `File '${filename}' deleted successfully.` } });
        } catch (error) {
            if (error.message.includes('Invalid filename')) {
                return res.status(400).json({ status: 'error', error: { code: 'INVALID_INPUT', message: error.message } });
            }
            if (error.message.includes('File not found')) {
                return res.status(404).json({ status: 'error', error: { code: 'NOT_FOUND', message: error.message } });
            }
            res.status(500).json({ status: 'error', error: { code: 'INTERNAL_ERROR', message: 'Could not delete file.' } });
        }
    });

    apiRouter.use('/workspace', workspaceRouter);

    app.use('/api', apiRouter);


    // --- JSON-RPC Endpoint --- 
    const handleJsonRpc = async (body, req) => { 
        const { method, params, id } = body; 

        // Helper to get API token from either params or Authorization header 
        const getApiToken = () => { 
            if (params && params.api_token) { 
                return params.api_token; 
            } 
            const authHeader = req.headers.authorization; 
            if (authHeader && authHeader.startsWith('Bearer ')) { 
                return authHeader.split(' ')[1]; 
            } 
            return null; 
        }; 

        if (method === 'initialize') { 
            return { 
                jsonrpc: '2.0', 
                id, 
                result: { 
                    protocolVersion: '2025-06-18', 
                    serverInfo: { name: 'MiloMCP Server', version: '2.0.0' }, 
                    capabilities: {} 
                } 
            }; 
        } 

        if (method === 'tools/call') { 
            const { name, arguments: args } = params || {}; 
            const apiToken = getApiToken(); 

            if (!apiToken) { 
                return { jsonrpc: '2.0', id, error: { code: -32000, message: 'API token is required.' } }; 
            } 

            const authResult = await authService.verifyApiToken(apiToken); 
            if (!authResult) { 
                return { jsonrpc: '2.0', id, error: { code: -32001, message: 'Invalid API token.' } }; 
            } 

            const { userId, permissions } = authResult; 
            
            // Check permissions: Deny if permissions are restricted and don't include the tool or a wildcard.
            if (permissions && permissions.length > 0 && !permissions.includes('*') && !permissions.includes(name)) { 
                 return { jsonrpc: '2.0', id, error: { code: -32003, message: `Insufficient permissions for tool: ${name}` } }; 
            } 

            const tool = await workspaceService.loadTool(userId, name); 
            if (!tool) { 
                return { jsonrpc: '2.0', id, error: { code: -32601, message: `Tool not found: ${name}` } }; 
            } 

            try { 
                // Get user and system environment 
                const userEnv = await environmentService.getEnvironment(userId); 
                const mergedEnv = { ...process.env, ...userEnv }; 

                const result = await tool.execute(args, mergedEnv); 
                const responsePayload = {
                    content: [
                        {
                            type: 'text',
                            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
                        }
                    ]
                };
                return { jsonrpc: '2.0', id, result: responsePayload }; 
            } catch (error) { 
                return { jsonrpc: '2.0', id, error: { code: -32603, message: `Tool execution error: ${error.message}` } }; 
            } 
        } else if (method === 'tools/list' || method === 'mcp:list-tools') { 
            const apiToken = getApiToken(); 

            if (!apiToken) { 
                return { jsonrpc: '2.0', id, error: { code: -32000, message: 'API token is required.' } }; 
            } 

            const authResult = await authService.verifyApiToken(apiToken); 
            if (!authResult) { 
                return { jsonrpc: '2.0', id, error: { code: -32001, message: 'Invalid API token.' } }; 
            } 

            const { userId, permissions } = authResult; 
            const allTools = await workspaceService.listTools(userId); 
            
            // Elegantly filter tools based on the token's permissions
            const permittedTools = (permissions && permissions.length > 0 && !permissions.includes('*'))
                ? allTools.filter(tool => permissions.includes(tool.name))
                : allTools;

            // Format for the client 
            const formattedTools = permittedTools.map(tool => ({ 
                name: tool.name, 
                description: tool.description, 
                inputSchema: { 
                    type: 'object', 
                    properties: tool.parameters || {},
                    required: tool.required || [],
                } 
            })); 

            return { jsonrpc: '2.0', id, result: { tools: formattedTools } }; 
        } 

        // Handle other MCP methods gracefully 
        if (['notifications/initialized', 'prompts/list', 'resources/list', 'ping'].includes(method)) { 
             return { jsonrpc: '2.0', id, result: {} }; // Return empty success for now 
        } 

        return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } }; 
    }; 

    app.post('/jsonrpc', async (req, res) => { 
        const response = await handleJsonRpc(req.body, req); 
        res.json(response); 
    }); 

    // MCP compatible endpoint 
    app.post('/mcp', async (req, res) => { 
        const response = await handleJsonRpc(req.body, req); 
        res.json(response); 
    }); 

    // --- SSE Connections --- 
    let sseConnections = []; 

    function broadcastToSseClients(response) { 
        if (sseConnections.length === 0) { 
            return; 
        } 
        const ssePayload = `event: message\ndata: ${JSON.stringify(response)}\n\n`; 
        sseConnections.forEach((conn, index) => { 
            try { 
                conn.write(ssePayload); 
            } catch (error) { 
                console.error(`Failed to send to SSE client ${index}:`, error); 
                conn.end(); 
            } 
        }); 
    } 

    app.get('/sse', (req, res) => { 
        console.log('New MCP SSE client connected'); 
        res.writeHead(200, { 
            'Content-Type': 'text/event-stream', 
            'Cache-Control': 'no-cache', 
            'Connection': 'keep-alive' 
        }); 
        res.write('event: endpoint\ndata: /messages\n\n'); 

        const keepAlive = setInterval(() => { 
            res.write(': heartbeat\n\n'); 
        }, 30000); 

        sseConnections.push(res); 

        req.on('close', () => { 
            console.log('MCP SSE client disconnected'); 
            clearInterval(keepAlive); 
            const index = sseConnections.indexOf(res); 
            if (index > -1) { 
                sseConnections.splice(index, 1); 
            } 
        }); 
    }); 

    app.post('/messages', async (req, res) => { 
        const response = await handleJsonRpc(req.body, req); 
        console.log('Broadcasting MCP response via SSE for method:', req.body.method); 
        broadcastToSseClients(response); 
        res.sendStatus(202); 
    });


    // --- Server Start ---
    server.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();
