# MiloMCP - A Flexible MCP Development Framework

[English](./README.md) | [简体中文](./README_zh-CN.md)

![GitHub License](https://img.shields.io/badge/license-MIT-blue.svg)![npm version](https://img.shields.io/npm/v/milomcp.svg?style=flat)![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)![Docker Pulls](https://img.shields.io/docker/pulls/zhoutijie/milomcp.svg)

**MiloMCP** is a powerful, multi-user development framework for the Model Context Protocol (MCP). It provides a robust foundation for AI applications, enabling seamless communication and tool integration via JSON-RPC 2.0 over HTTP and WebSockets. Each user has their own secure workspace to manage tools and environment variables.

---

## 🌟 Overview

MiloMCP simplifies building AI-powered services by providing a standardized, user-centric way to expose tools and capabilities to language models. Built with Node.js, Express, and SQLite, it offers high performance, data persistence, and a secure architecture for managing user-specific tools.

### ✨ Key Features

*   **👤 Multi-User Architecture**: Secure, isolated workspaces for each user to manage their own tools and environment variables.
*   **🔐 Robust Authentication**: A complete authentication system with user sign-up, login (JWT-based), and API token management.
*   **🛠️ Dynamic Tool Management**: Users can create, read, update, and delete their own tools through a RESTful API.
*   **📡 Multi-Protocol Support**: Communicate via JSON-RPC 2.0 over **HTTP** and **WebSockets**.
*   **⚙️ Persistent Storage**: User data, tools, and environment variables are stored in a persistent SQLite database.
*   **🐳 Dockerized**: Get up and running in seconds with a unified configuration for both local and Docker deployments.
*   **🌐 RESTful API**: A comprehensive API for managing users, authentication, tools, and environment variables.

## 📚 Table of Contents

- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
- [Usage](#usage)
  - [Running Locally](#running-locally)
  - [Running with Docker](#running-with-docker)
- [API Endpoints](#api-endpoints)
- [Creating and Using Tools](#creating-and-using-tools)
- [Authentication](#authentication)
- [Contributing](#contributing)
- [License](#license)

## 🚀 Getting Started

Follow these instructions to get a local copy up and running.

### Prerequisites

*   **Node.js**: Version 14.0.0 or higher.
*   **npm**: Included with Node.js.
*   **Docker** (Optional): For containerized deployment.

### Installation

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/ztj7728/milomcp.git
    cd milomcp
    ```

2.  **Install dependencies:**
    ```sh
    npm install
    ```

### Configuration

1.  **Create the environment file:**
    Copy the example configuration to a new `.env` file. This file is central to all your settings.
    ```sh
    cp .env.example .env
    ```

2.  **Edit the `.env` file:**
    Open `.env` and customize the settings. **These configurations apply to both local runs (`npm start`) and Docker deployments.**

    | Variable                 | Description                                                              | Default     |
    | ------------------------ | ------------------------------------------------------------------------ | ----------- |
    | `PORT`                   | The port for the HTTP and WebSocket server.                              | `3000`      |
    | `JWT_SECRET`             | A long, random secret key for signing JWT access tokens.                 | `your-jwt-secret` |
    | `INITIAL_ADMIN_USER`     | The username for the initial administrator account.                      | `admin`     |
    | `INITIAL_ADMIN_PASSWORD` | The password for the initial administrator account.                      | `adminpass` |

    **Important**: The first time the server starts, it will create an admin user with the credentials above. If these variables are not set, the admin user will not be created.

## 🏃 Usage

### Running Locally

Start the server with the following command. The server will read its configuration from the `.env` file.

```sh
npm start
```

You should see output indicating that the server is running:
```
Server is running on http://localhost:3000
```

### Running with Docker

For a more isolated and reproducible environment, use Docker Compose.

1.  **Configure the `.env` file:**
    Ensure your `.env` file is configured as needed. `docker-compose` will automatically read this file.

2.  **Run the container:**
    The project includes a convenient deployment script to pull the latest image and start the container.

    First, make the script executable (only needs to be done once):
    ```sh
    chmod +x deploy.sh
    ```

    Then, run the script to deploy the service:
    ```sh
    ./deploy.sh
    ```
    This script will pull the latest `zhoutijie/milomcp` image from Docker Hub and start the service using the configuration from your `.env` file. The `db` and `tools` directories will be persisted as volumes.

## 📡 API Endpoints

The server exposes a RESTful API for management and a JSON-RPC endpoint for tool interaction.

### REST API

All REST endpoints are prefixed with `/api`.

| Method   | Endpoint                      | Description                                       | Auth Required | Admin Only |
| -------- | ----------------------------- | ------------------------------------------------- | ------------- | ---------- |
| `POST`   | `/sign-up`                    | Creates a new user account.                       | No            | No         |
| `POST`   | `/login`                      | Logs in a user and returns a JWT access token.    | No            | No         |
| `GET`    | `/me`                         | Retrieves the current user's profile.             | Yes           | No         |
| `GET`    | `/tokens`                     | Lists all API tokens for the current user.        | Yes           | No         |
| `POST`   | `/tokens`                     | Creates a new API token for the current user.     | Yes           | No         |
| `DELETE` | `/tokens/:token`              | Revokes an API token.                             | Yes           | No         |
| `GET`    | `/workspace/files`            | Lists all tool files in the user's workspace.     | Yes           | No         |
| `GET`    | `/workspace/files/:filename`  | Reads the content of a specific tool file.        | Yes           | No         |
| `PUT`    | `/workspace/files/:filename`  | Creates or updates a tool file.                   | Yes           | No         |
| `DELETE` | `/workspace/files/:filename`  | Deletes a tool file from the workspace.           | Yes           | No         |
| `GET`    | `/environment`                | Gets all environment variables for the user.      | Yes           | No         |
| `POST`   | `/environment`                | Sets an environment variable for the user.        | Yes           | No         |
| `DELETE` | `/environment/:key`           | Deletes an environment variable.                  | Yes           | No         |
| `GET`    | `/users`                      | Lists all users in the system.                    | Yes           | Yes        |
| `POST`   | `/users`                      | Creates a new user (admin only).                  | Yes           | Yes        |
| `DELETE` | `/users/:id`                  | Deletes a user (admin only).                      | Yes           | Yes        |

### JSON-RPC API

The main endpoint for JSON-RPC calls is `/jsonrpc` (or its alias `/mcp`).

**Example: Calling a tool with `curl`**

To call a tool, you need a valid API token. You can create one via the `/api/tokens` endpoint after logging in.

```sh
# First, log in to get an access token
curl -X POST http://localhost:3000/api/login \
     -H "Content-Type: application/json" \
     -d '{ "username": "youruser", "password": "yourpassword" }'

# Next, create an API token using your access token
curl -X POST http://localhost:3000/api/tokens \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     -d '{ "name": "my-first-token", "permissions": ["*"] }'

# Finally, call the tool using the new API token
curl -X POST http://localhost:3000/jsonrpc \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -d '{
           "jsonrpc": "2.0",
           "method": "tools/call",
           "params": {
             "name": "calculator",
             "arguments": { "expression": "2 + 2" }
           },
           "id": 1
         }'
```

## 🛠️ Creating and Using Tools

Each user manages their own set of tools in their personal workspace.

1.  **Log In**: Authenticate via the `/api/login` endpoint to get a JWT access token.
2.  **Create a Tool**: Use the `PUT /api/workspace/files/:filename` endpoint to upload your tool's code. The filename will be used as the tool's name (e.g., `calculator.js`).
3.  **Create an API Token**: Use the `/api/tokens` endpoint to generate an API token. You can grant it permissions to specific tools (e.g., `["calculator"]`) or all tools (`["*"]`).
4.  **Call the Tool**: Use the JSON-RPC endpoint with your API token to execute the tool.

**Example: `calculator.js`**

Each tool file must export an object with `name`, `description`, `parameters`, and an `execute` function.

```javascript
module.exports = {
  name: 'calculator',
  description: 'Evaluates a mathematical expression.',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'The mathematical expression to evaluate (e.g., "2 * (3 + 4)")'
      }
    },
    required: ['expression']
  },
  async execute(args, env) {
    // `args` contains the arguments passed from the tool call.
    // `env` contains the user's merged environment variables.
    try {
      // Note: Using eval is risky. A safer implementation would use a math parsing library.
      const result = eval(args.expression);
      return `The result is ${result}.`;
    } catch (error) {
      return `Error evaluating expression: ${error.message}`;
    }
  }
};
```

## 🔐 Authentication

Authentication is managed via two types of tokens:

1.  **Access Tokens (JWT)**: Short-lived tokens obtained via `/api/login`. They are used to access the REST API for managing your account, tools, and API tokens. Provide them in the `Authorization: Bearer <token>` header.
2.  **API Tokens**: Long-lived tokens you create for external services or models to call your tools. They can be restricted to specific permissions. Provide them in the `Authorization: Bearer <token>` header for JSON-RPC calls.

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
