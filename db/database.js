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

    await db.exec(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      token TEXT UNIQUE,
      permissions TEXT,
      createdAt TEXT,
      expiresAt TEXT,
      rateLimits TEXT,
      isAdmin BOOLEAN
    )`);

    return db;
  } catch (err) {
    console.error('Error opening database', err.message);
    // Exit the process if the database connection fails, as it's critical.
    process.exit(1);
  }
})();