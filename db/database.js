const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

const dbPath = path.resolve(__dirname, 'mcp.db');

// This is an IIFE (Immediately Invoked Function Expression) that
// returns a promise which resolves with the database instance.
module.exports = (async () => {
  try {
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    console.log('Connected to the SQLite database.');

    // Stores core user identity information.
    await db.exec(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,          -- The unique username
      name TEXT,
      passwordHash TEXT,            -- Securely hashed password
      createdAt TEXT,
      isAdmin BOOLEAN DEFAULT 0
    )`);

    // Stores persistent, user-generated API tokens for tool execution.
    await db.exec(`CREATE TABLE IF NOT EXISTS tokens (
      token TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      name TEXT,
      permissions TEXT,             -- e.g., '["calculator", "weather"]' (subset of tools in their workspace)
      createdAt TEXT,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // Stores user-specific environment variables.
    await db.exec(`CREATE TABLE IF NOT EXISTS user_environment_variables (
      userId TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT, -- This should be encrypted for security
      PRIMARY KEY (userId, key),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )`);

    return db;
  } catch (err) {
    console.error('Error opening database', err.message);
    // Exit the process if the database connection fails, as it's critical.
    process.exit(1);
  }
})();