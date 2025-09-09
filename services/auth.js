const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const dbPromise = require('../db/database');
const userServicePromise = require('./user'); // Import UserService

const JWT_SECRET = process.env.JWT_SECRET;

class AuthService {
  constructor(db, userService) {
    this.db = db;
    this.userService = userService;
  }

  async login(username, password) {
    // Find user by their login name
    const user = await this.userService.findUserByUsername(username);
    if (!user) {
      throw new Error('User not found');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new Error('Invalid password');
    }

    // Issue shorter-lived JWT (15 minutes)
    const accessToken = jwt.sign({ userId: user.id, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '15m' });
    
    // Create refresh token (30 days)
    const refreshToken = await this.createRefreshToken(user.id);
    
    return { 
      accessToken, 
      refreshToken: refreshToken.token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        isAdmin: user.isAdmin
      }
    };
  }

  verifyAccessToken() {
    return (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ status: 'error', error: { code: 'UNAUTHORIZED', message: 'Access token is missing or malformed.' } });
      }

      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Attach user payload to request
        next();
      } catch (error) {
        return res.status(401).json({ status: 'error', error: { code: 'INVALID_TOKEN', message: 'Access token is invalid or expired.' } });
      }
    };
  }

  async verifyApiToken(token) {
    // Logic to verify the persistent API token from the 'tokens' table
    const tokenRecord = await (await this.db).get('SELECT * FROM tokens WHERE token = ?', token);
    if (!tokenRecord) {
      return null; // Or throw an error, depending on desired handling
    }
    
    // Update last used timestamp
    await (await this.db).run('UPDATE tokens SET lastUsedAt = ? WHERE token = ?', 
      new Date().toISOString(), token);
    
    // In the future, we might check token permissions here
    return { userId: tokenRecord.userId, permissions: JSON.parse(tokenRecord.permissions || '[]') };
  }

  // Refresh token management methods
  async createRefreshToken(userId) {
    const db = await this.db;
    const tokenId = uuidv4();
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(token, 12);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now
    
    await db.run(`
      INSERT INTO refresh_tokens (id, token, userId, expiresAt, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `, [tokenId, hashedToken, userId, expiresAt.toISOString(), new Date().toISOString()]);
    
    return { id: tokenId, token, expiresAt };
  }

  async verifyRefreshToken(token) {
    const db = await this.db;
    const refreshTokens = await db.all('SELECT * FROM refresh_tokens WHERE isRevoked = false');
    
    // Find the matching token by comparing hashes
    for (const tokenRecord of refreshTokens) {
      const isValidToken = await bcrypt.compare(token, tokenRecord.token);
      if (isValidToken) {
        // Check if token is expired
        if (new Date() > new Date(tokenRecord.expiresAt)) {
          throw new Error('Refresh token expired');
        }
        
        // Update last used timestamp
        await db.run('UPDATE refresh_tokens SET lastUsedAt = ? WHERE id = ?', 
          new Date().toISOString(), tokenRecord.id);
        
        return { userId: tokenRecord.userId, tokenId: tokenRecord.id };
      }
    }
    
    return null;
  }

  async refreshAccessToken(refreshToken) {
    const tokenData = await this.verifyRefreshToken(refreshToken);
    if (!tokenData) {
      throw new Error('Invalid refresh token');
    }

    // Get user data to include in new access token
    const user = await this.userService.findUserById(tokenData.userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Issue new access token (15 minutes)
    const accessToken = jwt.sign(
      { userId: user.id, isAdmin: user.isAdmin }, 
      JWT_SECRET, 
      { expiresIn: '15m' }
    );

    // Optionally rotate refresh token (create new one and revoke old one)
    const newRefreshToken = await this.createRefreshToken(user.id);
    await this.revokeRefreshToken(tokenData.tokenId);

    return {
      accessToken,
      refreshToken: newRefreshToken.token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        isAdmin: user.isAdmin
      }
    };
  }

  async revokeRefreshToken(tokenId) {
    const db = await this.db;
    await db.run('UPDATE refresh_tokens SET isRevoked = true WHERE id = ?', tokenId);
  }

  async revokeAllRefreshTokens(userId) {
    const db = await this.db;
    await db.run('UPDATE refresh_tokens SET isRevoked = true WHERE userId = ?', userId);
  }

  async cleanupExpiredRefreshTokens() {
    const db = await this.db;
    await db.run('DELETE FROM refresh_tokens WHERE expiresAt < ? OR isRevoked = true', 
      new Date().toISOString());
  }
}

// Initialize with the database and user service promises
const authServicePromise = Promise.all([dbPromise, userServicePromise]).then(([db, userService]) => new AuthService(db, userService));

module.exports = authServicePromise;
