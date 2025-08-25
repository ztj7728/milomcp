const fs = require('fs/promises');
const path = require('path');

const TOOLS_DIR = process.env.TOOLS_DIR || './tools';

class WorkspaceService {
  constructor() {
    this.baseToolsPath = path.resolve(process.cwd(), TOOLS_DIR);
    this.templatePath = path.join(this.baseToolsPath, 'template');
  }

  getUserWorkspacePath(userId) {
    // Ensure userId is a safe directory name
    if (!/^[a-zA-Z0-9_-]+$/.test(userId)) {
      throw new Error('Invalid userId format.');
    }
    return path.join(this.baseToolsPath, userId);
  }

  async createWorkspace(userId) {
    const userWorkspacePath = this.getUserWorkspacePath(userId);
    await fs.mkdir(userWorkspacePath, { recursive: true });
  }

  async initializeWorkspace(userId) {
    const userWorkspacePath = this.getUserWorkspacePath(userId);
    try {
      const templateFiles = await fs.readdir(this.templatePath);
      for (const file of templateFiles) {
        const sourceFile = path.join(this.templatePath, file);
        const destFile = path.join(userWorkspacePath, file);
        await fs.copyFile(sourceFile, destFile);
      }
    } catch (error) {
      // If template doesn't exist or fails, we just log it.
      // The user will have an empty workspace.
      console.warn('Could not initialize workspace from template.', error.message);
    }
  }

  async loadTool(userId, toolName) {
    const userWorkspacePath = this.getUserWorkspacePath(userId);
    // Sanitize toolName to prevent directory traversal attacks
    const safeToolName = path.basename(toolName).replace(/\.js$/, '');
    const toolPath = path.join(userWorkspacePath, `${safeToolName}.js`);

    try {
      // Check if the file exists before trying to require it
      await fs.access(toolPath);
      // Using require() is okay here as we've constructed a safe path
      const tool = require(toolPath);
      return tool;
    } catch (error) {
      console.error(`Failed to load tool: ${toolName} for user: ${userId}`, error);
      return null;
    }
  }

  async deleteWorkspace(userId) {
    const userWorkspacePath = this.getUserWorkspacePath(userId);
    await fs.rm(userWorkspacePath, { recursive: true, force: true });
  }
}

// This service is stateless, so we can export a single instance.
module.exports = new WorkspaceService();
