const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const dbPromise = require('../db/database');
const workspaceService = require('./workspace');

class UserService {
  constructor(db, workspaceService) {
    this.db = db;
    this.workspaceService = workspaceService;
  }

  async findUserById(id) {
    const user = await (await this.db).get('SELECT id, username, name, createdAt, isAdmin FROM users WHERE id = ?', id);
    if (user) {
      // Elegantly ensure the API returns a true boolean
      user.isAdmin = !!user.isAdmin;
    }
    return user;
  }

  async listAllUsers() {
    const users = await (await this.db).all('SELECT id, username, name, createdAt, isAdmin FROM users');
    // Elegantly ensure the API returns a true boolean for all users
    return users.map(user => ({
      ...user,
      isAdmin: !!user.isAdmin
    }));
  }

  async findUserByUsername(username) {
    const user = await (await this.db).get('SELECT * FROM users WHERE username = ?', username);
    if (user) {
      // Elegantly ensure the API returns a true boolean
      user.isAdmin = !!user.isAdmin;
    }
    return user;
  }

  async createUser({ username, password, name }) {
    const db = await this.db;
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = {
      id: uuidv4(), // Generate a unique ID for the user
      username,
      name,
      passwordHash,
      createdAt: new Date().toISOString(),
      isAdmin: false // Default to not admin
    };

    // Transaction-like operation
    try {
      // 1. Create user in DB
      await db.run(
        'INSERT INTO users (id, username, name, passwordHash, createdAt, isAdmin) VALUES (?, ?, ?, ?, ?, ?)',
        [newUser.id, newUser.username, newUser.name, newUser.passwordHash, newUser.createdAt, newUser.isAdmin]
      );

      // 2. Create user workspace
      await this.workspaceService.createWorkspace(newUser.id);

      return await this.findUserById(newUser.id);
    } catch (error) {
      // Elegantly handle specific, known errors vs. unexpected ones.
      // Check the message content for the unique constraint failure.
      if (error && error.message && error.message.includes('UNIQUE constraint failed')) {
        // This is an expected error when a username is taken.
        throw new Error('Username is already taken.');
      } else {
        // This is for unexpected errors (like filesystem issues).
        console.error('An unexpected error occurred during user creation:', error);
        // Attempt to clean up filesystem artifacts if user was created but workspace failed
        await this.workspaceService.deleteWorkspace(newUser.id).catch(err => {
            console.error(`Failed to cleanup workspace for user ${newUser.id}`, err);
        });
        // Provide a generic but helpful error to the client.
        throw new Error('An unexpected server error occurred during user creation.');
      }
    }
  }

  async deleteUser(userIdToDelete, currentUserId) {
    if (userIdToDelete === currentUserId) {
      throw new Error('Administrators cannot delete their own account.');
    }

    const db = await this.db;
    try {
      await db.run('BEGIN TRANSACTION');

      // 1. Delete user's tokens
      await db.run('DELETE FROM tokens WHERE userId = ?', userIdToDelete);

      // 2. Delete user's environment variables
      await db.run('DELETE FROM user_environment_variables WHERE userId = ?', userIdToDelete);

      // 3. Delete the user record itself
      const result = await db.run('DELETE FROM users WHERE id = ?', userIdToDelete);
      if (result.changes === 0) {
        throw new Error('User not found.'); // Or handle as a non-error if preferred
      }

      // 4. Delete the user's workspace from the filesystem
      await this.workspaceService.deleteWorkspace(userIdToDelete);

      await db.run('COMMIT');
      return true;
    } catch (error) {
      await db.run('ROLLBACK');
      console.error(`Failed to delete user ${userIdToDelete}:`, error);
      // Re-throw a more generic error to the API layer
      throw new Error(`Failed to delete user: ${error.message}`);
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
