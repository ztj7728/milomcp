const crypto = require('crypto');
const dbPromise = require('../db/database');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  throw new Error('ENCRYPTION_KEY must be a 32-character string.');
}
const key = Buffer.from(ENCRYPTION_KEY, 'utf8');

class EnvironmentService {
  constructor(db) {
    this.db = db;
  }

  encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('hex');
  }

  decrypt(encryptedHex) {
    try {
        const encryptedBuffer = Buffer.from(encryptedHex, 'hex');
        const iv = encryptedBuffer.slice(0, IV_LENGTH);
        const authTag = encryptedBuffer.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
        const encrypted = encryptedBuffer.slice(IV_LENGTH + AUTH_TAG_LENGTH);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8');
    } catch (error) {
        console.error("Decryption failed:", error);
        // Return null or an empty string if decryption fails
        return null;
    }
  }

  async getEnvironment(userId) {
    const db = await this.db;
    const rows = await db.all('SELECT key, value FROM user_environment_variables WHERE userId = ?', userId);
    const environment = {};
    for (const row of rows) {
      environment[row.key] = this.decrypt(row.value);
    }
    return environment;
  }

  async setVariable(userId, key, value) {
    const db = await this.db;
    const encryptedValue = this.encrypt(value);
    await db.run(
      'INSERT OR REPLACE INTO user_environment_variables (userId, key, value) VALUES (?, ?, ?)',
      [userId, key, encryptedValue]
    );
  }

  async deleteVariable(userId, key) {
    const db = await this.db;
    const result = await db.run('DELETE FROM user_environment_variables WHERE userId = ? AND key = ?', [userId, key]);
    return result.changes > 0;
  }
}

const environmentServicePromise = dbPromise.then(db => new EnvironmentService(db));

module.exports = environmentServicePromise;
