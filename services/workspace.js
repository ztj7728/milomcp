const fs = require('fs').promises;
const path = require('path');

const TOOLS_BASE_DIR = path.join(__dirname, '..', 'tools');

// Security: A simple regex to validate tool filenames.
// Allows alphanumeric characters, hyphens, and underscores. Must end in .js.
const SAFE_FILENAME_REGEX = /^[\w-]+\.js$/;

class WorkspaceService {
  constructor() {
    // Ensure the base tools directory exists
    fs.mkdir(TOOLS_BASE_DIR, { recursive: true }).catch(err => {
      console.error('Failed to create base tools directory:', err);
    });
  }

  _getUserWorkspacePath(userId) {
    if (!userId) {
      throw new Error('User ID is required to get workspace path.');
    }
    return path.join(TOOLS_BASE_DIR, userId.toString());
  }

  async _ensureUserWorkspace(userId) {
    const userWorkspacePath = this._getUserWorkspacePath(userId);
    await fs.mkdir(userWorkspacePath, { recursive: true });
    return userWorkspacePath;
  }

  // --- File Management Methods ---

  async listFiles(userId) {
    const userWorkspacePath = await this._ensureUserWorkspace(userId);
    try {
      const files = await fs.readdir(userWorkspacePath);
      const jsFiles = files.filter(file => file.endsWith('.js'));
      
      // Get detailed information for each file
      const filePromises = jsFiles.map(async (filename) => {
        const filePath = path.join(userWorkspacePath, filename);
        try {
          const stats = await fs.stat(filePath);
          const fileInfo = {
            name: filename,
            path: `/tools/${userId}/${filename}`,
            size: stats.size,
            lastModified: stats.mtime.toISOString(),
            type: 'file',
            extension: '.js',
            isReadonly: false,
            encoding: 'utf-8',
            permissions: {
              read: true,
              write: true,
              delete: true
            }
          };

          // Try to extract tool metadata
          try {
            delete require.cache[require.resolve(filePath)];
            const tool = require(filePath);
            const content = await fs.readFile(filePath, 'utf-8');
            const lineCount = content.split('\n').length;
            
            fileInfo.metadata = {
              toolName: tool.name || null,
              toolDescription: tool.description || null,
              isValid: !!(tool.name && tool.execute && typeof tool.execute === 'function'),
              lastValidated: new Date().toISOString(),
              validationErrors: null
            };

            fileInfo.contentPreview = {
              lineCount,
              hasExports: content.includes('module.exports'),
              exportedFunctions: this._extractExportedFunctions(content),
              lastEditedBy: userId
            };
          } catch (toolError) {
            fileInfo.metadata = {
              toolName: null,
              toolDescription: null,
              isValid: false,
              lastValidated: new Date().toISOString(),
              validationErrors: toolError.message
            };
            
            try {
              const content = await fs.readFile(filePath, 'utf-8');
              fileInfo.contentPreview = {
                lineCount: content.split('\n').length,
                hasExports: content.includes('module.exports'),
                exportedFunctions: [],
                lastEditedBy: userId
              };
            } catch {
              fileInfo.contentPreview = {
                lineCount: 0,
                hasExports: false,
                exportedFunctions: [],
                lastEditedBy: userId
              };
            }
          }

          return fileInfo;
        } catch (statError) {
          console.error(`Failed to get file stats for ${filename}:`, statError);
          return null;
        }
      });

      const fileDetails = await Promise.all(filePromises);
      return fileDetails.filter(Boolean); // Filter out nulls from failed stats
    } catch (error) {
      // If the directory doesn't exist, it's not an error, just return empty.
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  _extractExportedFunctions(content) {
    const functions = [];
    try {
      // Simple regex to find exported functions
      const exportMatches = content.match(/(?:module\.exports\s*=\s*{[^}]*|exports\.\w+\s*=)/g);
      if (exportMatches) {
        // Look for common function exports
        if (content.includes('execute') && (content.includes('async execute') || content.includes('execute(') || content.includes('execute:'))) {
          functions.push('execute');
        }
        // Add other common patterns as needed
      }
    } catch (error) {
      // If parsing fails, just return empty array
    }
    return functions;
  }

  async readFile(userId, filename) {
    if (!SAFE_FILENAME_REGEX.test(filename)) {
      throw new Error('Invalid filename.');
    }
    const userWorkspacePath = this._getUserWorkspacePath(userId);
    const filePath = path.join(userWorkspacePath, filename);
    
    // Security check to prevent path traversal
    if (path.dirname(filePath) !== userWorkspacePath) {
        throw new Error('Access denied.');
    }

    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('File not found.');
      }
      throw error;
    }
  }

  async writeFile(userId, filename, content) {
    if (!SAFE_FILENAME_REGEX.test(filename)) {
      throw new Error('Invalid filename. Only alphanumeric names ending in .js are allowed.');
    }
    const userWorkspacePath = await this._ensureUserWorkspace(userId);
    const filePath = path.join(userWorkspacePath, filename);

    // Security check
    if (path.dirname(filePath) !== userWorkspacePath) {
        throw new Error('Access denied.');
    }

    await fs.writeFile(filePath, content, 'utf-8');
    // After writing, we might want to reload the tool definition in a more advanced setup
    // For now, the next call to `loadTool` will get the new version.
    return { success: true, filename };
  }

  async deleteFile(userId, filename) {
    if (!SAFE_FILENAME_REGEX.test(filename)) {
      throw new Error('Invalid filename.');
    }
    const userWorkspacePath = this._getUserWorkspacePath(userId);
    const filePath = path.join(userWorkspacePath, filename);

    // Security check
    if (path.dirname(filePath) !== userWorkspacePath) {
        throw new Error('Access denied.');
    }
    
    try {
      await fs.unlink(filePath);
      return { success: true, filename };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('File not found.');
      }
      throw error;
    }
  }

  // --- Tool Loading & Management ---

  async createWorkspace(userId) {
    const userWorkspacePath = this._getUserWorkspacePath(userId);
    await fs.mkdir(userWorkspacePath, { recursive: true });

    // Copy template tools to the new workspace
    const templateDir = path.join(TOOLS_BASE_DIR, 'template');
    try {
      const templateFiles = await fs.readdir(templateDir);
      for (const file of templateFiles) {
        const sourcePath = path.join(templateDir, file);
        const destPath = path.join(userWorkspacePath, file);
        await fs.copyFile(sourcePath, destPath);
      }
    } catch (error) {
      console.error(`Could not copy template files for user ${userId}:`, error);
      // This might not be a fatal error, so we don't re-throw
    }
  }

  async deleteWorkspace(userId) {
    const userWorkspacePath = this._getUserWorkspacePath(userId);
    try {
      await fs.rm(userWorkspacePath, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to delete workspace for user ${userId}:`, error);
      // Don't re-throw, as the user record deletion is more critical
    }
  }

  async listTools(userId) {
    const userWorkspacePath = this._getUserWorkspacePath(userId);
    try {
      const files = await fs.readdir(userWorkspacePath);
      const toolPromises = files
        .filter(file => file.endsWith('.js'))
        .map(async file => {
          const filePath = path.join(userWorkspacePath, file);
          try {
            // Bust the cache to get the latest version
            delete require.cache[require.resolve(filePath)];
            const tool = require(filePath);
            return {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
              required: tool.required || [], // Ensure required is always an array
            };
          } catch (error) {
            console.error(`Failed to load tool: ${file}`, error);
            return null;
          }
        });
      const tools = await Promise.all(toolPromises);
      return tools.filter(Boolean); // Filter out nulls from failed loads
    } catch (error) {
      if (error.code === 'ENOENT') {
        // If the user's directory doesn't exist, they have no tools.
        return [];
      }
      throw error;
    }
  }

  async loadTool(userId, toolName) {
    const userWorkspacePath = this._getUserWorkspacePath(userId);
    const toolPath = path.join(userWorkspacePath, `${toolName}.js`);
    try {
      // Check if the file exists before trying to require it
      await fs.access(toolPath);
      // Bust the cache to get the latest version
      delete require.cache[require.resolve(toolPath)];
      return require(toolPath);
    } catch (error) {
      // If file doesn't exist or other error, return null
      return null;
    }
  }
}

module.exports = new WorkspaceService();
