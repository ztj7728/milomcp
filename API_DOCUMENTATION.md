# MiloMCP API Documentation

## Overview

MiloMCP is a multi-user Model Context Protocol (MCP) server framework that provides JSON-RPC 2.0 communication over HTTP and WebSockets. It offers comprehensive user management, tool execution, and workspace management capabilities.

**Base URL:** `http://localhost:3000` (configurable via PORT environment variable)

## Authentication

### Two-Token System

1. **Access Tokens (JWT)** - Short-lived tokens (15 minutes) for REST API access
2. **Refresh Tokens** - Long-lived tokens (30 days) for refreshing access tokens
3. **API Tokens** - Long-lived tokens for JSON-RPC tool execution with configurable permissions

### Headers

- **Authorization:** `Bearer <token>` (for protected REST API endpoints)
- **Content-Type:** `application/json`

### Token Workflow

**Initial Authentication:**
1. User logs in with credentials via `POST /api/login`
2. Server returns both `accessToken` (15 min) and `refreshToken` (30 days)
3. Client stores both tokens securely

**Using Access Tokens:**
1. Include access token in Authorization header for API calls
2. When access token expires (401 response), use refresh token

**Refreshing Access Tokens:**
1. Send refresh token to `POST /api/refresh`
2. Server returns new access token and new refresh token
3. Old refresh token is automatically revoked
4. Client updates stored tokens

**Logout:**
1. Send refresh token to `POST /api/logout` to revoke it
2. Omit refresh token to revoke all user's refresh tokens

---

## REST API Endpoints

### Authentication

#### Sign Up
```
POST /api/sign-up
```

**Request Body:**
```json
{
  "username": "string",
  "password": "string", 
  "name": "string"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "username": "string",
    "name": "string",
    "isAdmin": false,
    "createdAt": "timestamp"
  }
}
```

**Error Responses:**
- `400` - Invalid input (missing required fields)
- `500` - User creation failed

#### Login
```
POST /api/login
```

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "accessToken": "jwt_token",
    "refreshToken": "refresh_token_string",
    "user": {
      "id": "uuid",
      "username": "string",
      "name": "string",
      "isAdmin": boolean
    }
  }
}
```

**Error Responses:**
- `400` - Invalid input
- `401` - Authentication failed

#### Refresh Access Token
```
POST /api/refresh
```

**Request Body:**
```json
{
  "refreshToken": "refresh_token_string"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "accessToken": "new_jwt_token",
    "refreshToken": "new_refresh_token_string",
    "user": {
      "id": "uuid",
      "username": "string",
      "name": "string",
      "isAdmin": boolean
    }
  }
}
```

**Error Responses:**
- `400` - Invalid input (missing refresh token)
- `401` - Invalid or expired refresh token

#### Logout
```
POST /api/logout
```
**Headers:** `Authorization: Bearer <access_token>`

**Request Body (Optional):**
```json
{
  "refreshToken": "refresh_token_string"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "message": "Logged out successfully."
  }
}
```

**Behavior:**
- If `refreshToken` is provided: Revokes only that specific refresh token
- If `refreshToken` is omitted: Revokes all refresh tokens for the user

### User Management

#### Get Current User
```
GET /api/me
```
**Headers:** `Authorization: Bearer <access_token>`

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "username": "string",
    "name": "string",
    "isAdmin": boolean,
    "createdAt": "timestamp"
  }
}
```

#### List All Users (Admin Only)
```
GET /api/users
```
**Headers:** `Authorization: Bearer <access_token>`

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "username": "string",
      "name": "string",
      "isAdmin": boolean,
      "createdAt": "timestamp"
    }
  ]
}
```

#### Create User (Admin Only)
```
POST /api/users
```
**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**
```json
{
  "username": "string",
  "password": "string",
  "name": "string"
}
```

#### Delete User (Admin Only)
```
DELETE /api/users/{id}
```
**Headers:** `Authorization: Bearer <access_token>`

**Response:**
```json
{
  "status": "success",
  "data": {
    "message": "User deleted successfully."
  }
}
```

### Token Management

#### List API Tokens
```
GET /api/tokens
```
**Headers:** `Authorization: Bearer <access_token>`

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "permissions": ["tool1", "tool2"] | ["*"],
      "createdAt": "timestamp",
      "lastUsedAt": "timestamp"
    }
  ]
}
```

#### Create API Token
```
POST /api/tokens
```
**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**
```json
{
  "name": "string",
  "permissions": ["tool1", "tool2"] // Optional, ["*"] for all tools
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "name": "string",
    "token": "api_token_string",
    "permissions": ["tool1", "tool2"],
    "createdAt": "timestamp"
  }
}
```

#### Revoke API Token
```
DELETE /api/tokens/{token}
```
**Headers:** `Authorization: Bearer <access_token>`

### Environment Variables

#### Get User Environment Variables
```
GET /api/environment
```
**Headers:** `Authorization: Bearer <access_token>`

**Response:**
```json
{
  "status": "success",
  "data": {
    "VARIABLE_NAME": "value",
    "API_KEY": "secret_key"
  }
}
```

#### Set Environment Variable
```
POST /api/environment
```
**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**
```json
{
  "key": "VARIABLE_NAME",
  "value": "variable_value"
}
```

#### Delete Environment Variable
```
DELETE /api/environment/{key}
```
**Headers:** `Authorization: Bearer <access_token>`

### Tool Management

#### List Available Tools
```
GET /api/tools
```
**Headers:** `Authorization: Bearer <access_token>`

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "name": "calculator",
      "description": "执行基本的数学计算",
      "parameters": {
        "expression": {
          "type": "string",
          "description": "要计算的数学表达式"
        }
      },
      "required": ["expression"]
    }
  ]
}
```

### Workspace File Management

#### List Workspace Files
```
GET /api/workspace/files
```
**Headers:** `Authorization: Bearer <access_token>`

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "name": "calculator.js",
      "path": "/tools/{userId}/calculator.js",
      "size": 1847,
      "lastModified": "2024-01-15T10:30:45.123Z",
      "type": "file",
      "extension": ".js",
      "isReadonly": false,
      "encoding": "utf-8",
      "permissions": {
        "read": true,
        "write": true,
        "delete": true
      },
      "metadata": {
        "toolName": "calculator",
        "toolDescription": "执行基本的数学计算",
        "isValid": true,
        "lastValidated": "2024-01-15T10:30:45.123Z",
        "validationErrors": null
      },
      "contentPreview": {
        "lineCount": 42,
        "hasExports": true,
        "exportedFunctions": ["execute"],
        "lastEditedBy": "user123"
      }
    }
  ]
}
```

#### Get File Content
```
GET /api/workspace/files/{filename}
```
**Headers:** `Authorization: Bearer <access_token>`

**Response:** Raw file content (Content-Type: text/plain)

#### Create/Update File
```
PUT /api/workspace/files/{filename}
```
**Headers:** `Authorization: Bearer <access_token>`, `Content-Type: text/plain`
**Body:** Raw file content

#### Delete File
```
DELETE /api/workspace/files/{filename}
```
**Headers:** `Authorization: Bearer <access_token>`

#### Upload Files
```
POST /api/workspace/files/upload
```
**Headers:** `Authorization: Bearer <access_token>`, `Content-Type: multipart/form-data`

**Form Data:**
- Field name: `files` (supports multiple files)
- File type: JavaScript (.js) files only
- File size limit: 10MB per file
- File count limit: Maximum 10 files per request

**Response (Success - All files uploaded):**
```json
{
  "status": "success",
  "data": {
    "uploaded": [
      {
        "filename": "my-tool.js",
        "size": 1024,
        "status": "uploaded",
        "path": "/api/workspace/files/my-tool.js"
      }
    ],
    "failed": [],
    "summary": {
      "total": 1,
      "successful": 1,
      "failed": 0
    }
  }
}
```

**Response (Partial Success - Some files failed):**
```json
{
  "status": "success",
  "data": {
    "uploaded": [
      {
        "filename": "valid-tool.js",
        "size": 1024,
        "status": "uploaded",
        "path": "/api/workspace/files/valid-tool.js"
      }
    ],
    "failed": [
      {
        "filename": "invalid-tool.js",
        "error": "File does not appear to be a valid JavaScript module (missing module.exports or exports)."
      }
    ],
    "summary": {
      "total": 2,
      "successful": 1,
      "failed": 1
    }
  }
}
```

**Error Responses:**
- `400` - No files uploaded (`NO_FILES`)
- `400` - File too large (`FILE_TOO_LARGE`)
- `400` - Too many files (`TOO_MANY_FILES`)
- `400` - Invalid file type (`INVALID_FILE_TYPE`)
- `400` - All uploads failed (`ALL_UPLOADS_FAILED`)
- `401` - Unauthorized
- `500` - Upload processing error (`UPLOAD_FAILED`)

**Status Codes:**
- `201` - All files uploaded successfully
- `207` - Partial success (some files failed)
- `400` - All files failed or validation error

**File Validation:**
- Only JavaScript (.js) files are accepted
- Filenames must contain only alphanumeric characters, hyphens, and underscores
- Files must not be empty
- Files should contain `module.exports` or `exports` for tool validation

---

## JSON-RPC 2.0 API

### Base Endpoints
- `POST /jsonrpc` - Primary JSON-RPC endpoint
- `POST /mcp` - MCP compatible alias

### Authentication
API Token can be provided via:
1. Request parameter: `"api_token": "your_token"`
2. Authorization header: `Authorization: Bearer your_token`

### Methods

#### Initialize
```json
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-06-18",
    "serverInfo": {
      "name": "MiloMCP Server",
      "version": "2.0.0"
    },
    "capabilities": {}
  }
}
```

#### List Tools
```json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "params": {
    "api_token": "your_api_token"
  },
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "calculator",
        "description": "执行基本的数学计算",
        "inputSchema": {
          "type": "object",
          "properties": {
            "expression": {
              "type": "string",
              "description": "要计算的数学表达式"
            }
          },
          "required": ["expression"]
        }
      }
    ]
  }
}
```

#### Call Tool
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "api_token": "your_api_token",
    "name": "calculator",
    "arguments": {
      "expression": "2 + 2"
    }
  },
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"expression\": \"2 + 2\", \"result\": 4, \"formatted\": \"2 + 2 = 4\"}"
      }
    ]
  }
}
```

### Error Codes
- `-32000` - API token is required
- `-32001` - Invalid API token  
- `-32003` - Insufficient permissions for tool
- `-32601` - Method/Tool not found
- `-32603` - Tool execution error

---

## WebSocket & SSE Endpoints

### Server-Sent Events (SSE)
```
GET /sse
```

Establishes an SSE connection for real-time MCP communication.

**Events:**
- `endpoint` - Initial connection event
- `message` - JSON-RPC responses

### Messages Endpoint
```
POST /messages
```

Accepts JSON-RPC messages and broadcasts responses via SSE.

---

## Tool Structure

Custom tools must follow this structure:

```javascript
module.exports = {
  name: 'tool-name',
  description: 'Tool description',
  parameters: {
    param1: {
      type: 'string',
      description: 'Parameter description'
    }
  },
  required: ['param1'],
  async execute(args, env) {
    // Tool implementation
    // args - tool arguments
    // env - merged environment (system + user variables)
    return result;
  }
};
```

### Built-in Tools

#### Calculator
- **Name:** `calculator`
- **Description:** 执行基本的数学计算
- **Parameters:** `expression` (string) - Math expression to evaluate
- **Example:** `"2 + 2"`, `"sqrt(16) + pow(2, 3)"`

#### Weather
- **Name:** `weather` 
- **Description:** 获取指定城市的实时天气信息
- **Parameters:** `city` (string) - City name or adcode
- **Requires:** `WEATHER_API_KEY` environment variable
- **Example:** `"北京"`, `"330100"`

---

## Error Response Format

All API endpoints return errors in the following format:

```json
{
  "status": "error",
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message"
  }
}
```

### Common Error Codes
- `INVALID_INPUT` - Missing or invalid request parameters
- `AUTHENTICATION_FAILED` - Invalid credentials
- `REFRESH_FAILED` - Invalid or expired refresh token
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `INTERNAL_ERROR` - Server error
- `USER_CREATION_FAILED` - User creation error

### File Upload Error Codes
- `NO_FILES` - No files were uploaded
- `FILE_TOO_LARGE` - File size exceeds the 10MB limit
- `TOO_MANY_FILES` - Maximum of 10 files allowed per upload
- `INVALID_FILE_TYPE` - Only JavaScript (.js) files are allowed
- `UNEXPECTED_FIELD` - Unexpected file field (use "files" as field name)
- `ALL_UPLOADS_FAILED` - All file uploads failed
- `UPLOAD_FAILED` - Failed to process file uploads
- `UPLOAD_ERROR` - General upload error

---

## CORS Configuration

The server supports CORS with the following headers:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

---

## Environment Setup

Required environment variables:
- `PORT` - Server port (default: 3000)
- `INITIAL_ADMIN_USER` - Initial admin username
- `INITIAL_ADMIN_PASSWORD` - Initial admin password
- `WEATHER_API_KEY` - API key for weather service (optional)

---

## Database Schema

### Users Table
- `id` - UUID primary key
- `username` - Unique username
- `password` - Hashed password
- `name` - Display name
- `isAdmin` - Admin flag
- `createdAt` - Creation timestamp

### Tokens Table  
- `token` - Hashed API token (primary key)
- `userId` - Foreign key to users
- `name` - Token name
- `permissions` - JSON array of permitted tools
- `createdAt` - Creation timestamp
- `lastUsedAt` - Last usage timestamp

### Refresh Tokens Table
- `id` - UUID primary key
- `token` - Hashed refresh token
- `userId` - Foreign key to users
- `expiresAt` - Expiration timestamp
- `createdAt` - Creation timestamp
- `lastUsedAt` - Last usage timestamp
- `isRevoked` - Boolean flag for revoked tokens

### User Environment Variables Table
- `id` - Auto-increment primary key
- `userId` - Foreign key to users
- `key` - Variable name
- `value` - Variable value
- `createdAt` - Creation timestamp