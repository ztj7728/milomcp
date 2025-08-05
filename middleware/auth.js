const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_RATE_LIMIT = { requests: 1000, window: 3600000 }; // 1000 requests per hour

class AuthManager {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.adminToken = process.env.ADMIN_TOKEN;
    this.usersFile = path.join(__dirname, 'user.json');
    this.rateLimiting = options.rateLimiting;

    this.users = new Map(); // K: token, V: userInfo
    this.rateLimitMap = new Map();
    this.blacklist = new Set();

    this.loadUsers();
    this.setupCleanupInterval();
  }

  loadUsers() {
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

    // 2. Load regular users from user.json
    try {
      if (fs.existsSync(this.usersFile)) {
        const data = JSON.parse(fs.readFileSync(this.usersFile, 'utf8'));
        if (data && Array.isArray(data.users)) {
          data.users.forEach(user => {
            if (user.token) {
              this.users.set(user.token, user);
            }
          });
          console.log(`Loaded ${data.users.length} users from ${this.usersFile}`);
        }
      } else {
        this.saveUsers(); // Create the file if it doesn't exist
      }
    } catch (error) {
      console.error(`Error loading users from ${this.usersFile}:`, error.message);
    }
  }

  saveUsers() {
    try {
      const usersToSave = Array.from(this.users.values()).filter(u => !u.isAdmin);
      const data = { users: usersToSave };
      fs.writeFileSync(this.usersFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`Error saving users to ${this.usersFile}:`, error.message);
    }
  }

  addUser(userInfo) {
    if (!userInfo || !userInfo.id) {
      throw new Error('User ID is required.');
    }

    // Check for duplicate user ID
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
      isAdmin: false,
    };
    this.users.set(newUser.token, newUser);
    this.saveUsers();
    return newUser;
  }

  removeUser(userId) {
    let tokenToRemove = null;
    for (const [token, user] of this.users.entries()) {
      if (user.id === userId && !user.isAdmin) {
        tokenToRemove = token;
        break;
      }
    }
    if (tokenToRemove) {
      this.users.delete(tokenToRemove);
      this.saveUsers();
      return true;
    }
    return false;
  }

  updateUser(userId, updates) {
    let userToUpdate = null;
    
    for (const user of this.users.values()) {
      if (user.id === userId && !user.isAdmin) {
        userToUpdate = user;
        break;
      }
    }

    if (!userToUpdate) {
      throw new Error(`User not found: ${userId}`);
    }

    // Prevent modification of protected fields
    const protectedFields = ['id', 'token', 'createdAt', 'isAdmin'];
    for (const field of protectedFields) {
      if (updates.hasOwnProperty(field)) {
        delete updates[field];
      }
    }

    // Apply updates
    Object.assign(userToUpdate, updates);

    this.saveUsers();
    return userToUpdate;
  }
  
  getAllUsers() {
      return Array.from(this.users.values()).filter(u => !u.isAdmin);
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

  revokeToken(token) {
    this.blacklist.add(token);
    if (this.users.has(token) && !this.users.get(token).isAdmin) {
        this.users.delete(token);
        this.saveUsers();
    }
    console.log(`Token revoked: ${token.substring(0, 20)}...`);
  }

  setupCleanupInterval() {
    setInterval(() => {
      const now = Date.now();
      for (const [token, info] of this.users.entries()) {
        if (info.expiresAt && now > new Date(info.expiresAt).getTime()) {
          this.users.delete(token);
          if(!info.isAdmin) this.saveUsers();
        }
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

  getStats() {
    return {
      totalUsers: this.users.size,
      blacklistedTokens: this.blacklist.size,
      activeConnections: this.rateLimitMap.size,
      authEnabled: this.enabled
    };
  }
}

module.exports = AuthManager;