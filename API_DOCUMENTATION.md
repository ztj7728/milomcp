# MiloMCP API Documentation

This document provides a detailed guide to the MiloMCP server API. The API is divided into two main parts:
1.  A RESTful API for user and resource management.
2.  A JSON-RPC 2.0 endpoint for tool discovery and execution.

## 1. Authentication

The system uses two types of tokens for security:

-   **Access Token (JWT):** A short-lived (1-hour) JSON Web Token obtained after logging in. This token is required to access the RESTful management API endpoints. It must be sent in the `Authorization` header as a Bearer token.
-   **API Token:** A long-lived, persistent token that users generate themselves. This token is used exclusively to authenticate with the JSON-RPC endpoint for executing tools.

---

## 2. RESTful Management API

All management endpoints are prefixed with `/api`.

### Public Endpoints

These endpoints do not require authentication.

#### `POST /api/sign-up`

Registers a new user in the system.

**Request Body:**

| Field      | Type   | Description                  | Required |
| :--------- | :----- | :--------------------------- | :------- |
| `username` | String | The desired username.        | Yes      |
| `password` | String | The user's password.         | Yes      |
| `name`     | String | The user's display name.     | Yes      |

**Example Request:**
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123","name":"Test User"}' \
  http://localhost:3000/api/sign-up
```

**Example Success Response (`201 Created`):**
```json
{
  "status": "success",
  "data": {
    "id": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
    "username": "testuser",
    "name": "Test User",
    "createdAt": "2025-08-25T16:00:00.000Z",
    "isAdmin": false
  }
}
```

---

#### `POST /api/login`

Authenticates a user and returns a JWT Access Token.

**Request Body:**

| Field      | Type   | Description          | Required |
| :--------- | :----- | :------------------- | :------- |
| `username` | String | The user's username. | Yes      |
| `password` | String | The user's password. | Yes      |

**Example Request:**
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}' \
  http://localhost:3000/api/login
```

**Example Success Response (`200 OK`):**
```json
{
  "status": "success",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### User Endpoints

*Authentication: Access Token required.*

#### `GET /api/me`

Retrieves the details of the currently authenticated user.

**Example Request:**
```bash
curl -H "Authorization: Bearer <Your_Access_Token>" http://localhost:3000/api/me
```

**Example Success Response (`200 OK`):**
```json
{
  "status": "success",
  "data": {
    "id": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
    "username": "testuser",
    "name": "Test User",
    "createdAt": "2025-08-25T16:00:00.000Z",
    "isAdmin": false
  }
}
```

---

#### `GET /api/tokens`

Retrieves a list of all API tokens for the authenticated user.

**Example Request:**
```bash
curl -H "Authorization: Bearer <Your_Access_Token>" http://localhost:3000/api/tokens
```

---

#### `POST /api/tokens`

Creates a new API token.

**Request Body:**

| Field         | Type     | Description                                                                                                                               | Required |
| :------------ | :------- | :---------------------------------------------------------------------------------------------------------------------------------------- | :------- |
| `name`        | String   | A descriptive name for the token.                                                                                                         | Yes      |
| `permissions` | String[] | **Optional.** An array of tool names this token can execute. For unlimited access, use `["*"]. If omitted, the token has no permissions. | No       |

**Example Request (Specific Permissions):**
```bash
curl -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer <Your_Access_Token>" \
  -d '{"name":"calc-weather-token","permissions":["calculator", "weather"]}' \
  http://localhost:3000/api/tokens
```

---

#### `DELETE /api/tokens/:token`

Revokes (deletes) an API token.

**Example Request:**
```bash
curl -X DELETE -H "Authorization: Bearer <Your_Access_Token>" \
  http://localhost:3000/api/tokens/mcp_abc123...
```

---

#### `GET /api/tools`

Retrieves a list of all tools available in the user's workspace, regardless of API token permissions.

**Example Request:**
```bash
curl -H "Authorization: Bearer <Your_Access_Token>" http://localhost:3000/api/tools
```

---

### Environment Variable Endpoints

*Authentication: Access Token required.*

#### `GET /api/environment`

Retrieves all environment variables for the authenticated user.

**Example Request:**
```bash
curl -H "Authorization: Bearer <Your_Access_Token>" http://localhost:3000/api/environment
```

---

#### `POST /api/environment`

Sets or updates an environment variable.

**Request Body:**

| Field   | Type   | Description                               | Required |
| :------ | :----- | :---------------------------------------- | :------- |
| `key`   | String | The name of the environment variable.     | Yes      |
| `value` | String | The value to be stored (will be encrypted). | Yes      |

---

#### `DELETE /api/environment/:key`

Deletes a specific environment variable.

**Example Request:**
```bash
curl -X DELETE -H "Authorization: Bearer <Your_Access_Token>" \
  http://localhost:3000/api/environment/WEATHER_API_KEY
```

--- 

### Workspace File Management Endpoints

*Authentication: Access Token required.*

These endpoints provide a secure, RESTful interface for managing the tool script files within a user's workspace, laying the foundation for an in-browser IDE experience.

#### `GET /api/workspace/files`

Retrieves a list of all tool script filenames in the user's workspace.

**Example Request:**
```bash
curl -H "Authorization: Bearer <Your_Access_Token>" \
  http://localhost:3000/api/workspace/files
```

**Example Success Response (`200 OK`):**
```json
{
  "status": "success",
  "data": [
    "calculator.js",
    "weather.js"
  ]
}
```

---

#### `GET /api/workspace/files/:filename`

Retrieves the raw source code of a specific tool script.

**URL Parameters:**

| Parameter  | Description                                               |
| :--------- | :-------------------------------------------------------- |
| `filename` | The name of the file to retrieve (e.g., `calculator.js`). |

**Example Request:**
```bash
curl -H "Authorization: Bearer <Your_Access_Token>" \
  http://localhost:3000/api/workspace/files/calculator.js
```

**Example Success Response (`200 OK`):**
```javascript
// Content-Type: text/plain
module.exports = {
  name: 'calculator',
  description: 'Calculates a mathematical expression.',
  // ... rest of the tool code
};
```

---

#### `PUT /api/workspace/files/:filename`

Creates a new tool script or completely overwrites an existing one. The request body should be the raw source code of the tool.

**URL Parameters:**

| Parameter  | Description                                                              |
| :--------- | :----------------------------------------------------------------------- |
| `filename` | The name of the file to create or update (e.g., `new-tool.js`). Must be a valid filename ending in `.js`. |

**Request Body:** The raw JavaScript code for the tool, sent with a `Content-Type` of `text/plain` or `application/javascript`.

**Example Request:**
```bash
curl -X PUT -H "Authorization: Bearer <Your_Access_Token>" \
  -H "Content-Type: text/plain" \
  --data 'module.exports = { name: "new-tool", description: "A brand new tool.", execute: async () => "Hello, World!" };' \
  http://localhost:3000/api/workspace/files/new-tool.js
```

**Example Success Response (`200 OK`):**
```json
{
  "status": "success",
  "data": {
    "message": "File 'new-tool.js' saved successfully."
  }
}
```

---

#### `DELETE /api/workspace/files/:filename`

Deletes a tool script from the user's workspace.

**URL Parameters:**

| Parameter  | Description                                          |
| :--------- | :--------------------------------------------------- |
| `filename` | The name of the file to delete (e.g., `new-tool.js`). |

**Example Request:**
```bash
curl -X DELETE -H "Authorization: Bearer <Your_Access_Token>" \
  http://localhost:3000/api/workspace/files/new-tool.js
```

**Example Success Response (`200 OK`):**
```json
{
  "status": "success",
  "data": {
    "message": "File 'new-tool.js' deleted successfully."
  }
}
```

---

### Administrator Endpoints


*Authentication: Admin Access Token required.*

#### `GET /api/users`

Retrieves a list of all users in the system.

**Example Request:**
```bash
curl -H "Authorization: Bearer <Your_Admin_Access_Token>" http://localhost:3000/api/users
```

---

#### `POST /api/users`

Creates a new user.

**Request Body:**

| Field      | Type   | Description                  | Required |
| :--------- | :----- | :--------------------------- | :------- |
| `username` | String | The new user's username.     | Yes      |
| `password` | String | The new user's password.     | Yes      |
| `name`     | String | The new user's display name. | Yes      |

---

#### `DELETE /api/users/:id`

Deletes a user and all their associated data (tokens, workspace, etc.). An admin cannot delete their own account.

**URL Parameters:**

| Parameter | Description                  |
| :-------- | :--------------------------- |
| `id`      | The UUID of the user to delete. |

**Example Request:**
```bash
curl -X DELETE -H "Authorization: Bearer <Your_Admin_Access_Token>" \
  http://localhost:3000/api/users/a1b2c3d4-e5f6-7890-1234-567890abcdef
```

---

## 3. JSON-RPC Tool Execution

The server provides three endpoints for client interaction, adhering to the Model Context Protocol (MCP):

- **`/jsonrpc`**: The primary endpoint for standard request/response cycles.
- **`/mcp`**: An alias for `/jsonrpc`, provided for compatibility with MCP-specific clients.
- **`/sse`**: A Server-Sent Events endpoint. Clients can connect here to receive asynchronous responses and notifications from the server.
- **`/messages`**: An endpoint where MCP clients can POST their requests. The server will process them and broadcast the response to all connected `/sse` clients.

All interactions follow the JSON-RPC 2.0 specification.

**Authentication:** All methods require a valid **API Token** to be sent, either in the `Authorization: Bearer <Your_API_Token>` header or as an `api_token` parameter in the request body.

### `tools/list`

Returns a list of tools that the provided API Token is permitted to execute.

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "tools/list"
}
```

**Example Success Response:**
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "tools": [
      {
        "name": "uuid-generator",
        "description": "Generates one or more UUIDs.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "count": { "type": "number", "description": "The number of UUIDs to generate." }
          },
          "required": ["count"]
        }
      }
    ]
  }
}
```

---


### `tools/call`

Executes a tool. The server will reject the call if the API Token does not have permission for the requested tool.

**Request `params`:**

| Field       | Type   | Description                                                    |
| :---------- | :----- | :------------------------------------------------------------- |
| `name`      | String | The name of the tool to execute (e.g., `uuid-generator`).      |
| `arguments` | Object | An object containing the parameters required by the tool.      |

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "id": "2",
  "method": "tools/call",
  "params": {
    "name": "uuid-generator",
    "arguments": {
      "count": 3
    }
  }
}
```

**Example Success Response:**
```json
{
    "jsonrpc": "2.0",
    "id": "2",
    "result": {
        "content": [
            {
                "type": "text",
                "text": "[
  "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "f47ac10b-58cc-4372-a567-0e02b2c3d480",
  "f47ac10b-58cc-4372-a567-0e02b2c3d481"
]"
            }
        ]
    }
}
```