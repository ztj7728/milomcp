const sqlite3 = require('sqlite3').verbose();
const path =require('path');

const dbPath = path.resolve(__dirname, 'mcp.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      token TEXT UNIQUE,
      permissions TEXT,
      createdAt TEXT,
      expiresAt TEXT,
      rateLimits TEXT,
      isAdmin BOOLEAN
    )`, (err) => {
      if (err) {
        console.error('Error creating users table', err.message);
      }
    });
  }
});

module.exports = db;