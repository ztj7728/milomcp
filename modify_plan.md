# Enhanced Authentication & Multi-Tenant Refactoring Plan

## 1. Core Objectives

This plan refactors the MiloMCP system to support a robust, multi-tenant architecture. The key goals are:
-   **User Self-Service:** Introduce username/password authentication, allowing users to sign up, log in, and manage their own API tokens and tool configurations.
-   **Isolate User Workspaces:** Each user will have a dedicated directory for their tools, ensuring isolation and customization.
-   **User-Managed Environment:** Allow users to securely store and manage their own sensitive information (like API keys), which their tools can access at runtime.
-   **Simplified Permissions:** Streamline the permission model. All users have full access to their own tools, but can create restricted API tokens for specific use cases.
-   **Secure Admin Bootstrapping:** Maintain a secure, one-time process for creating the initial administrator account.

## 2. Key Concepts

-   **Access Token (JWT):** A short-lived JSON Web Token (JWT) returned after a successful `/login`. It is used to authorize access to management APIs (like managing API tokens or environment variables). It will contain claims like `userId` and `isAdmin`.
-   **API Token:** A persistent, user-generated token stored in the database. This is the token used to authenticate with the core JSON-RPC endpoint for executing tools.
-   **Tool Workspace:** Each user will have a directory at `tools/{userId}`. They can only execute tools from within their own workspace.
-   **Environment Precedence:** When a tool is executed, it may require sensitive values. The system will provide them in the following order of priority:
    1.  Value from the user's personal, encrypted database store.
    2.  Fallback to the value from the server's `.env` file.

## 3. Phase 1: Database, Configuration, and Setup

### 3.1. Database Schema (`db/database.js`)

We will add a new table for user-specific environment variables and adjust the `users` table.

-   **`users` Table:** The `permissions` column is no longer needed and will be removed.
-   **`tokens` Table:** This table remains as-is from the original plan, storing user-generated API tokens.
-   **`user_environment_variables` Table (New):** This table will store user-specific sensitive data.

```sql
-- In db/database.js

-- Stores core user identity information.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,          -- The unique username
  name TEXT,
  passwordHash TEXT,            -- Securely hashed password
  createdAt TEXT,
  isAdmin BOOLEAN DEFAULT 0
);

-- Stores persistent, user-generated API tokens for tool execution.
CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  name TEXT,
  permissions TEXT,             -- e.g., '["calculator", "weather"]' (subset of tools in their workspace)
  createdAt TEXT,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

-- Stores user-specific environment variables.
CREATE TABLE IF NOT EXISTS user_environment_variables (
  userId TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT, -- This should be encrypted for security
  PRIMARY KEY (userId, key),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);
```

### 3.2. New Dependencies

We'll need libraries for password hashing, JWTs, and encryption.

-   **Action:** Run `npm install bcrypt jsonwebtoken crypto`.

### 3.3. Configuration (`.env.example`)

The admin bootstrap process is retained.

```dotenv
# .env.example

# Secret key for signing JWT Access Tokens
JWT_SECRET=replace_with_a_long_random_string

# Initial Admin Credentials (used only on first startup if no admin exists)
INITIAL_ADMIN_USER=admin
INITIAL_ADMIN_PASSWORD=replace_with_a_strong_secret_password

# A secret key for encrypting/decrypting user environment variables
ENCRYPTION_KEY=replace_with_a_32_character_long_secret_key
```

## 4. Phase 2: Elegant Architecture - Service-Oriented Design

To ensure the codebase is maintainable, testable, and elegant, we will adopt a service-oriented architecture. Business logic will be separated into dedicated service modules, and `server.js` will act as the composition layer that wires up routes to these services.

-   **`AuthService` (`services/auth.js`):** Handles all authentication and token verification.
    -   `login(username, password)`: Verifies credentials and issues JWTs.
    -   `verifyAccessToken(token)`: Middleware function to protect API routes.
    -   `verifyApiToken(token)`: Verifies the persistent API token for tool execution.

-   **`UserService` (`services/user.js`):** Manages the user lifecycle and their associated resources.
    -   `createUser(userInfo)`: Handles user creation, password hashing, and calls other services (like `WorkspaceService`).
    -   `findUserById(id)`: Retrieves user data.
    -   `createToken(userId, tokenDetails)`, `listTokens(userId)`, `revokeToken(token)`: Manages API tokens.

-   **`WorkspaceService` (`services/workspace.js`):** Manages file system operations for user tool workspaces.
    -   `createWorkspace(userId)`: Creates the `tools/{userId}` directory.
    -   `initializeWorkspace(userId)`: Copies tools from the `tools/template` directory.
    -   `loadTool(userId, toolName)`: Safely loads a specific tool for a user.

-   **`EnvironmentService` (`services/environment.js`):** Manages user-specific, encrypted environment variables.
    -   `getEnvironment(userId)`, `setVariable(userId, key, value)`, `deleteVariable(userId, key)`: Handles all CRUD operations and contains the encryption/decryption logic.

### 4.1. Data Integrity: Transactional User Creation

The user creation process involves multiple steps (DB write, directory creation, file copy). This process must be atomic to prevent inconsistent states.

-   **Action:** The `UserService.createUser` method will implement a `try...catch` block. If any step after the initial database insertion fails, the logic will roll back the changes by deleting the newly created user and any filesystem artifacts.

### 4.2. Tool Loading & Execution (`server.js`)

The core JSON-RPC handler will be updated to use the new services.

1.  Authenticate the request using `AuthService.verifyApiToken()` to identify the `userId`.
2.  Dynamically load the tool using `WorkspaceService.loadTool(userId, toolName)`.
3.  Fetch the user's environment variables using `EnvironmentService.getEnvironment(userId)`.
4.  Create a merged environment object (user's variables override system `process.env`).
5.  Pass this merged environment to the tool's `execute` function.

## 5. Phase 3: API Endpoint Implementation (`server.js`)

### 5.1. API Design: Standardized Responses and Status Codes

All API endpoints will adhere to a consistent JSON response format and use appropriate HTTP status codes to improve client-side handling.

-   **Successful Response (`200 OK`, `201 Created`):**
    ```json
    {
      "status": "success",
      "data": {
        // ... the actual response payload ...
      }
    }
    ```

-   **Error Response (`400`, `401`, `403`, `404`, `500`):**
    ```json
    {
      "status": "error",
      "error": {
        "code": "UNIQUE_CODE_FOR_ERROR",
        "message": "A descriptive error message."
      }
    }
    ```

### 5.2. API Routes

All `/api/*` routes (except `/api/login` and `/api/sign-up`) will be protected by the `AuthService.verifyAccessToken` middleware.

-   **`POST /api/sign-up` (Public):**
    -   Accepts `{ username, password, name }`.
    -   Calls `UserService.createUser()`.
-   **`POST /api/login` (Public):**
    -   Accepts `{ username, password }`.
    -   Calls `AuthService.login()` and returns the JWT Access Token.
-   **User & Token Management (Protected):**
    -   Endpoints like `GET /api/users/:userId/tokens` will be implemented.
    -   An admin (`isAdmin: true` in JWT) can manage any user. A regular user can only manage their own resources.
    -   These routes will call the relevant methods in `UserService`.
-   **`/api/environment` (Protected):**
    -   Provides CRUD operations for the logged-in user to manage their environment variables by calling `EnvironmentService`.
    -   `GET /api/environment`
    -   `POST /api/environment` (`{ key, value }`)
    -   `DELETE /api/environment/:key`
