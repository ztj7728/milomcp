const bcrypt = require('bcrypt');
const crypto = require('crypto');
const dbPromise = require('../db/database');
const workspaceService = require('./workspace');

class UserService {
  constructor(db, workspaceService) {
    this.db = db;
    this.workspaceService = workspaceService;
  }

  async findUserById(id) {
    return (await this.db).get('SELECT id, name, createdAt, isAdmin FROM users WHERE id = ?', id);
  }

  async createUser({ username, password, name }) {
    const db = await this.db;
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = {
      id: username,
      name,
      passwordHash,
      createdAt: new Date().toISOString(),
      isAdmin: 0 // Default to not admin
    };

    // Transaction-like operation
    try {
      // 1. Create user in DB
      await db.run(
        'INSERT INTO users (id, name, passwordHash, createdAt, isAdmin) VALUES (?, ?, ?, ?, ?)',
        [newUser.id, newUser.name, newUser.passwordHash, newUser.createdAt, newUser.isAdmin]
      );

      // 2. Create user workspace
      await this.workspaceService.createWorkspace(newUser.id);
      await this.workspaceService.initializeWorkspace(newUser.id);

      return await this.findUserById(newUser.id);
    } catch (error) {
      // Rollback: If anything fails, delete the user and their workspace
      console.error('User creation failed, rolling back.', error);
      await db.run('DELETE FROM users WHERE id = ?', newUser.id);
      // Attempt to clean up filesystem artifacts
      await this.workspaceService.deleteWorkspace(newUser.id).catch(err => {
        console.error(`Failed to cleanup workspace for user ${newUser.id}`, err);
      });
      throw new Error('Failed to create user due to an internal error.');
    }
  }

  async createToken(userId, { name, permissions }) {
    const db = await this.db;
    const token = `mcp_${crypto.randomBytes(24).toString('hex')}`;
    const createdAt = new Date().toISOString();

    await db.run(
      'INSERT INTO tokens (token, userId, name, permissions, createdAt) VALUES (?, ?, ?, ?, ?)',
      [token, userId, name, JSON.stringify(permissions || []), createdAt]
    );
    return { token, userId, name, permissions, createdAt };
  }

  async listTokens(userId) {
    const db = await this.db;
    return db.all('SELECT token, name, permissions, createdAt FROM tokens WHERE userId = ?', userId);
  }

  async revokeToken(token, userId) {
    const db = await this.db;
    // Ensure a user can only revoke their own tokens unless they are an admin
    const result = await db.run('DELETE FROM tokens WHERE token = ? AND userId = ?', [token, userId]);
    return result.changes > 0;
  }
  
  async revokeTokenAdmin(token) {
    const db = await this.db;
    const result = await db.run('DELETE FROM tokens WHERE token = ?', [token]);
    return result.changes > 0;
  }
}

const userServicePromise = dbPromise.then(db => {
  return new UserService(db, workspaceService);
});


module.exports = userServicePromise;
