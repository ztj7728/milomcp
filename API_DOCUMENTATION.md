# MiloMCP API Documentation

This document provides a detailed guide to the MiloMCP server API. The API is divided into two main parts:
1.  A RESTful API for user and resource management (authentication, API tokens, environment variables).
2.  A JSON-RPC 2.0 endpoint for executing tools.

## 1. Authentication

The system uses two types of tokens for security:

-   **Access Token (JWT):** A short-lived (1-hour) JSON Web Token obtained after logging in with a username and password. This token is required to access the RESTful management API endpoints (e.g., creating API tokens, setting environment variables). It must be sent in the `Authorization` header as a Bearer token.
-   **API Token:** A long-lived, persistent token that users generate themselves. This token is used exclusively to authenticate with the JSON-RPC endpoint for executing tools.

---

## 2. RESTful Management API

All management endpoints are prefixed with `/api`.

### User Authentication

#### `POST /api/sign-up`

Registers a new user in the system. This is a public endpoint.

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
    "id": "testuser",
    "name": "Test User",
    "createdAt": "2025-08-25T04:27:52.626Z",
    "isAdmin": 0
  }
}
```

---

#### `POST /api/login`

Authenticates a user and returns a JWT Access Token. This is a public endpoint.

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

### API Token Management

*Authentication: Access Token required.*

#### `GET /api/tokens`

Retrieves a list of all API tokens for the authenticated user.

**Example Request:**

```bash
curl -H "Authorization: Bearer <Your_Access_Token>" \
  http://localhost:3000/api/tokens
```

**Example Success Response (`200 OK`):**

```json
{
  "status": "success",
  "data": [
    {
      "token": "mcp_f17443d1d574fa7a4e14f9900c2ab9db2b7723b32ea9ba82",
      "name": "testuser-token",
      "permissions": "[\"calculator\"]",
      "createdAt": "2025-08-25T04:30:43.996Z"
    }
  ]
}
```

---

#### `POST /api/tokens`

Creates a new API token for the authenticated user.

**Request Body:**

| Field         | Type     | Description                                                                                             |
| :------------ | :------- | :------------------------------------------------------------------------------------------------------ |
| `name`        | String   | A descriptive name for the token.                                                                       |
| `permissions` | String[] | An array of tool names this token is allowed to execute. An empty array `[]` allows access to all tools. |

**Example Request:**

```bash
curl -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer <Your_Access_Token>" \
  -d '{"name":"calculator-token","permissions":["calculator"]}' \
  http://localhost:3000/api/tokens
```

**Example Success Response (`201 Created`):**

```json
{
  "status": "success",
  "data": {
    "token": "mcp_f17443d1d574fa7a4e14f9900c2ab9db2b7723b32ea9ba82",
    "userId": "testuser",
    "name": "calculator-token",
    "permissions": ["calculator"],
    "createdAt": "2025-08-25T04:30:43.996Z"
  }
}
```

---

#### `DELETE /api/tokens/:token`

Revokes (deletes) an API token.

**URL Parameters:**

| Parameter | Description                  |
| :-------- | :--------------------------- |
| `token`   | The API token to be revoked. |

**Example Request:**

```bash
curl -X DELETE -H "Authorization: Bearer <Your_Access_Token>" \
  http://localhost:3000/api/tokens/mcp_f17443d1d574fa7a4e14f9900c2ab9db2b7723b32ea9ba82
```

**Example Success Response (`200 OK`):**

```json
{
  "status": "success",
  "data": {
    "message": "Token revoked."
  }
}
```

---

### Environment Variable Management

*Authentication: Access Token required.*

These endpoints allow users to securely store and manage sensitive data (like third-party API keys) that their tools can access at runtime.

#### `GET /api/environment`

Retrieves all environment variables for the authenticated user.

**Example Request:**

```bash
curl -H "Authorization: Bearer <Your_Access_Token>" \
  http://localhost:3000/api/environment
```

**Example Success Response (`200 OK`):**

```json
{
  "status": "success",
  "data": {
    "OPENAI_API_KEY": "sk-வுகளை",
    "STRIPE_SECRET_KEY": "rk_"
  }
}
```

---

#### `POST /api/environment`

Sets or updates an environment variable.

**Request Body:**

| Field   | Type   | Description                               | Required |
| :------ | :----- | :---------------------------------------- | :------- |
| `key`   | String | The name of the environment variable.     | Yes      |
| `value` | String | The value to be stored (will be encrypted). | Yes      |

**Example Request:**

```bash
curl -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer <Your_Access_Token>" \
  -d '{"key":"WEATHER_API_KEY","value":"your-secret-weather-key"}' \
  http://localhost:3000/api/environment
```

**Example Success Response (`201 Created`):**

```json
{
  "status": "success",
  "data": {
    "WEATHER_API_KEY": "your-secret-weather-key"
  }
}
```

---

#### `DELETE /api/environment/:key`

Deletes a specific environment variable.

**URL Parameters:**

| Parameter | Description                             |
| :-------- | :-------------------------------------- |
| `key`     | The key of the variable to be deleted. |

**Example Request:**

```bash
curl -X DELETE -H "Authorization: Bearer <Your_Access_Token>" \
  http://localhost:3000/api/environment/WEATHER_API_KEY
```

**Example Success Response (`200 OK`):**

```json
{
  "status": "success",
  "data": {
    "message": "Variable WEATHER_API_KEY deleted."
  }
}
```

---

## 3. JSON-RPC Tool Execution

The `/jsonrpc` endpoint is used to execute tools. It follows the JSON-RPC 2.0 specification.

### `tools/call`

This is the primary method for running a tool from a user's workspace.

**Request `params`:**

| Field       | Type   | Description                                                              |
| :---------- | :----- | :----------------------------------------------------------------------- |
| `name`      | String | The name of the tool to execute (e.g., `calculator`).                    |
| `arguments` | Object | An object containing the parameters required by the tool's `execute` function. |
| `api_token` | String | The user's persistent API Token.                                         |

**Example Request:**

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "tools/call",
  "params": {
    "name": "calculator",
    "arguments": {
      "expression": "5*5"
    },
    "api_token": "mcp_f17443d1d574fa7a4e14f9900c2ab9db2b7723b32ea9ba82"
  }
}
```

**Example `curl`:**

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"calculator","arguments":{"expression":"5*5"},"api_token":"mcp_f17443d1d574fa7a4e14f9900c2ab9db2b7723b32ea9ba82"}}' \
  http://localhost:3000/jsonrpc
```

**Example Success Response:**

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "expression": "5*5",
    "result": 25,
    "formatted": "5*5 = 25"
  }
}
```

**Example Error Response (Invalid Token):**

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "error": {
    "code": -32001,
    "message": "Invalid API token."
  }
}
```
