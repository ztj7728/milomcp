const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const dbPromise = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET;

class AuthService {
  constructor(db) {
    this.db = db;
  }

  async login(username, password) {
    // Logic to find user and verify password
    const user = await (await this.db).get('SELECT * FROM users WHERE id = ?', username);
    if (!user) {
      throw new Error('User not found');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new Error('Invalid password');
    }

    // Issue JWT
    const accessToken = jwt.sign({ userId: user.id, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '1h' });
    return { accessToken };
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
    // In the future, we might check token permissions here
    return { userId: tokenRecord.userId, permissions: JSON.parse(tokenRecord.permissions || '[]') };
  }
}

// Initialize with the database promise
const authServicePromise = dbPromise.then(db => new AuthService(db));

module.exports = authServicePromise;
