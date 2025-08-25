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
      const existingAdmin = await db.get("SELECT * FROM users WHERE isAdmin = 1");
      if (!existingAdmin) {
        console.log('No admin found, creating initial admin user...');
        await userService.createUser({
          username: adminUser,
          password: adminPassword,
          name: 'Administrator'
        });
        // Set the user as admin
        await db.run("UPDATE users SET isAdmin = 1 WHERE id = ?", adminUser);
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
    
    // User & Token Management
    apiRouter.get('/tokens', protect, async (req, res) => {
        const tokens = await userService.listTokens(req.user.userId);
        res.json({ status: 'success', data: tokens });
    });

    apiRouter.post('/tokens', protect, async (req, res) => {
        const { name, permissions } = req.body;
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

    app.use('/api', apiRouter);


    // --- JSON-RPC Endpoint ---
    const handleJsonRpc = async (body) => {
        const { method, params, id } = body;

        if (method === 'tools/call') {
            const { name, arguments: args } = params;
            const apiToken = params.api_token; // Assuming token is passed in params

            if (!apiToken) {
                return { jsonrpc: '2.0', id, error: { code: -32000, message: 'API token is required.' } };
            }

            const authResult = await authService.verifyApiToken(apiToken);
            if (!authResult) {
                return { jsonrpc: '2.0', id, error: { code: -32001, message: 'Invalid API token.' } };
            }

            const { userId, permissions } = authResult;
            
            // Check permissions
            if (permissions && permissions.length > 0 && !permissions.includes(name)) {
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
                return { jsonrpc: '2.0', id, result };
            } catch (error) {
                return { jsonrpc: '2.0', id, error: { code: -32603, message: `Tool execution error: ${error.message}` } };
            }
        }

        return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } };
    };

    app.post('/jsonrpc', async (req, res) => {
        const response = await handleJsonRpc(req.body);
        res.json(response);
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
