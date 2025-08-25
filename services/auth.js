const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
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

    // Issue JWT with the user's immutable UUID
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

// Initialize with the database and user service promises
const authServicePromise = Promise.all([dbPromise, userServicePromise]).then(([db, userService]) => new AuthService(db, userService));

module.exports = authServicePromise;
