const crypto = require('crypto');
const dbPromise = require('../db/database');

const DEFAULT_RATE_LIMIT = { requests: 1000, window: 3600000 }; // 1000 requests per hour

class AuthManager {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.adminToken = process.env.ADMIN_TOKEN;
    this.rateLimiting = options.rateLimiting;

    this.db = null;
    this.users = new Map(); // K: token, V: userInfo
    this.rateLimitMap = new Map();
    this.blacklist = new Set();

    this.initialize();
    this.setupCleanupInterval();
  }

  async initialize() {
    this.db = await dbPromise;
    await this.loadUsers();
  }

  async loadUsers() {
    // 1. Load Admin Token from environment
    if (this.adminToken) {
      this.users.set(this.adminToken, {
        id: 'admin',
        name: 'Administrator',
        permissions: ['*'],
        isAdmin: true,
      });
      console.log('Loaded admin token.');
    } else if (this.enabled) {
      console.warn('⚠️ WARNING: ADMIN_TOKEN is not set. Admin functionality will be disabled.');
    }

    // 2. Load regular users from database
    try {
      const rows = await this.db.all('SELECT * FROM users');
      rows.forEach(user => {
        this.users.set(user.token, {
          ...user,
          permissions: JSON.parse(user.permissions || '[]'),
          rateLimits: JSON.parse(user.rateLimits || '{}'),
        });
      });
      console.log(`Loaded ${rows.length} users from database.`);
    } catch (err) {
      console.error('Error loading users from database:', err.message);
    }
  }

  async addUser(userInfo) {
    if (!userInfo || !userInfo.id) {
      throw new Error('User ID is required.');
    }

    const existingUser = Array.from(this.users.values()).find(u => u.id === userInfo.id);
    if (existingUser) {
      throw new Error(`User with ID '${userInfo.id}' already exists.`);
    }

    const newUser = {
      id: userInfo.id,
      name: userInfo.name || userInfo.id,
      token: crypto.randomBytes(32).toString('hex'),
      permissions: userInfo.permissions || [],
      createdAt: new Date().toISOString(),
      expiresAt: userInfo.expiresAt || null,
      rateLimits: userInfo.rateLimits || DEFAULT_RATE_LIMIT,
    };

    try {
      await this.db.run(
        'INSERT INTO users (id, name, token, permissions, createdAt, expiresAt, rateLimits) VALUES (?, ?, ?, ?, ?, ?, ?)',
        newUser.id,
        newUser.name,
        newUser.token,
        JSON.stringify(newUser.permissions),
        newUser.createdAt,
        newUser.expiresAt,
        JSON.stringify(newUser.rateLimits)
      );
      this.users.set(newUser.token, newUser);
      return newUser;
    } catch (err) {
      console.error('Failed to add user to database:', err);
      throw new Error('Failed to add user to database.');
    }
  }

  async removeUser(userId) {
    let tokenToRemove = null;
    for (const [token, user] of this.users.entries()) {
      if (user.id === userId && !user.isAdmin) {
        tokenToRemove = token;
        break;
      }
    }
    if (tokenToRemove) {
      try {
        await this.db.run('DELETE FROM users WHERE id = ?', [userId]);
        this.users.delete(tokenToRemove);
        return true;
      } catch (err) {
        console.error(`Failed to remove user ${userId} from database.`);
        return false;
      }
    }
    return false;
  }

  async updateUser(userId, updates) {
    let userToUpdate = null;
    let token = null;
    for (const [t, user] of this.users.entries()) {
      if (user.id === userId && !user.isAdmin) {
        userToUpdate = user;
        token = t;
        break;
      }
    }

    if (!userToUpdate) {
      throw new Error(`User not found: ${userId}`);
    }

    const protectedFields = ['id', 'token', 'createdAt', 'isAdmin'];
    for (const field of protectedFields) {
      if (updates.hasOwnProperty(field)) {
        delete updates[field];
      }
    }

    Object.assign(userToUpdate, updates);

    try {
      await this.db.run(`UPDATE users SET
        name = ?,
        permissions = ?,
        expiresAt = ?,
        rateLimits = ?
        WHERE id = ?`,
        userToUpdate.name,
        JSON.stringify(userToUpdate.permissions),
        userToUpdate.expiresAt,
        JSON.stringify(userToUpdate.rateLimits),
        userId
      );
      this.users.set(token, userToUpdate);
      return userToUpdate;
    } catch (err) {
      console.error('Failed to update user in database:', err);
      throw new Error('Failed to update user in database.');
    }
  }
  
  getAllUsers() {
    return Array.from(this.users.values()).filter(u => !u.isAdmin).map(u => ({ ...u, token: u.token }));
  }

  verifyToken(token) {
    if (!token || this.blacklist.has(token)) {
      return { valid: false, error: 'Invalid or blacklisted token' };
    }

    const tokenInfo = this.users.get(token);
    if (!tokenInfo) {
      return { valid: false, error: 'Token not found' };
    }

    if (tokenInfo.expiresAt && Date.now() > new Date(tokenInfo.expiresAt).getTime()) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, tokenInfo };
  }

  hasPermission(tokenInfo, requiredPermission) {
    if (!tokenInfo || !tokenInfo.permissions) return false;
    if (tokenInfo.isAdmin || tokenInfo.permissions.includes('*')) return true;
    return tokenInfo.permissions.includes(requiredPermission);
  }

  checkRateLimit(tokenInfo, ip) {
    if (!this.rateLimiting) return { allowed: true };
    const key = tokenInfo.token || ip;
    const limits = tokenInfo.rateLimits || DEFAULT_RATE_LIMIT;
    const now = Date.now();
    const windowStart = now - limits.window;
    if (!this.rateLimitMap.has(key)) {
      this.rateLimitMap.set(key, []);
    }
    const requests = this.rateLimitMap.get(key).filter(time => time > windowStart);
    this.rateLimitMap.set(key, requests);
    if (requests.length >= limits.requests) {
      return {
        allowed: false,
        error: 'Rate limit exceeded',
        resetTime: Math.ceil((requests + limits.window) / 1000)
      };
    }
    requests.push(now);
    return {
      allowed: true,
      remaining: limits.requests - requests.length,
      resetTime: Math.ceil((now + limits.window) / 1000)
    };
  }

  async revokeToken(token) {
    this.blacklist.add(token);
    const user = this.users.get(token);
    if (user && !user.isAdmin) {
      try {
        await this.db.run('DELETE FROM users WHERE token = ?', [token]);
        this.users.delete(token);
        console.log(`Token revoked and user removed: ${token.substring(0, 20)}...`);
      } catch (err) {
        console.error(`Failed to remove user with token ${token} from database.`);
      }
    } else {
        console.log(`Token blacklisted: ${token.substring(0, 20)}...`);
    }
  }

  setupCleanupInterval() {
    setInterval(async () => {
      if (!this.db) return; // Don't run if db is not initialized
      const now = new Date().toISOString();
      try {
        const result = await this.db.run('DELETE FROM users WHERE expiresAt IS NOT NULL AND expiresAt < ?', [now]);
        if (result.changes > 0) {
            console.log('Cleaned up expired users. Reloading...');
            // Now, reload users from DB to reflect the changes in memory
            this.users.clear();
            await this.loadUsers();
        }
      } catch (err) {
        console.error('Error cleaning up expired users:', err.message);
      }
    }, 300000);
  }

  middleware() {
    return (req, res, next) => {
      if (!this.enabled || req.path === '/health') {
        return next();
      }
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token || req.headers['x-api-key']);
      if (!token) {
        // Allow access to /admin/users for setup if no users exist
        if (req.path === '/admin/users' && this.users.size === 0) {
            return next();
        }
        return res.status(401).json({ error: { code: -32001, message: 'Authentication required' } });
      }
      const verification = this.verifyToken(token);
      if (!verification.valid) {
        return res.status(401).json({ error: { code: -32001, message: 'Authentication failed', data: verification.error } });
      }
      const rateLimitCheck = this.checkRateLimit(verification.tokenInfo, req.ip);
      if (!rateLimitCheck.allowed) {
        res.set({
          'X-RateLimit-Limit': verification.tokenInfo.rateLimits?.requests || 100,
          'X-RateLimit-Remaining': 0,
          'X-RateLimit-Reset': rateLimitCheck.resetTime
        });
        return res.status(429).json({ error: { code: -32004, message: 'Rate limit exceeded' } });
      }
      res.set({
        'X-RateLimit-Limit': verification.tokenInfo.rateLimits?.requests || 100,
        'X-RateLimit-Remaining': rateLimitCheck.remaining,
        'X-RateLimit-Reset': rateLimitCheck.resetTime
      });
      req.auth = verification.tokenInfo;
      next();
    };
  }

  authenticateWebSocket(token) {
    if (!this.enabled) return { authenticated: true };
    if (!token) return { authenticated: false, error: 'Missing authentication token' };
    const verification = this.verifyToken(token);
    if (!verification.valid) return { authenticated: false, error: verification.error };
    return { authenticated: true, tokenInfo: verification.tokenInfo };
  }

  async getStats() {
    try {
      const result = await this.db.get('SELECT COUNT(*) as count FROM users');
      const userCount = result ? result.count : 0;
      return {
        totalUsers: userCount,
        blacklistedTokens: this.blacklist.size,
        activeConnections: this.rateLimitMap.size,
        authEnabled: this.enabled
      };
    } catch (error) {
      console.error('Failed to get user stats from database:', error);
      // Fallback to in-memory count on error
      return {
        totalUsers: Array.from(this.users.values()).filter(u => !u.isAdmin).length,
        blacklistedTokens: this.blacklist.size,
        activeConnections: this.rateLimitMap.size,
        authEnabled: this.enabled
      };
    }
  }
}

module.exports = AuthManager;