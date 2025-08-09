# MiloMCP - A Flexible MCP Development Framework

[English](./README.md) | [简体中文](./README_zh-CN.md)

![GitHub License](https://img.shields.io/badge/license-MIT-blue.svg)![npm version](https://img.shields.io/npm/v/milomcp.svg?style=flat)![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)![Docker Pulls](https://img.shields.io/docker/pulls/zhoutijie/milomcp.svg)

**MiloMCP** is a powerful and flexible development framework for the Model Context Protocol (MCP). It provides a robust foundation for AI applications, enabling seamless communication and tool integration via JSON-RPC 2.0 over HTTP and WebSockets.

---

## 🌟 Overview

MiloMCP simplifies the process of building AI-powered services by providing a standardized way to expose tools and capabilities to language models. It's built with Node.js and Express, offering high performance and a plug-and-play architecture for adding custom tools.

### ✨ Key Features

*   **🔌 Pluggable Tool Architecture**: Easily add or remove tools by dropping JavaScript files into a directory.
*   **📡 Multi-Protocol Support**: Communicate via JSON-RPC 2.0 over **HTTP**, **WebSockets**, and **Server-Sent Events (SSE)**.
*   **🔐 Built-in Authentication**: Secure your endpoints with JWT-based authentication and permission management.
*   **⚡ Rate Limiting**: Protect your server from abuse with configurable rate limiting.
*   **🐳 Dockerized**: Get up and running in seconds with Docker and Docker Compose.
*   **🔥 Hot Reloading**: Reload tools on the fly without restarting the server.
*   **⚙️ Easy Configuration**: Manage all settings through a simple `.env` file.

## 📚 Table of Contents

- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
- [Usage](#usage)
  - [Running Locally](#running-locally)
  - [Running with Docker](#running-with-docker)
- [API Endpoints](#api-endpoints)
- [Creating Tools](#creating-tools)
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
    git clone https://github.com/your-username/MiloMcp.git
    cd MiloMcp
    ```

2.  **Install dependencies:**
    ```sh
    npm install
    ```

### Configuration

1.  **Create an environment file:**
    Copy the example configuration to a new `.env` file.
    ```sh
    cp .env.example .env
    ```

2.  **Edit the `.env` file:**
    Open `.env` and customize the settings.

    | Variable              | Description                                                 | Default     |
    | --------------------- | ----------------------------------------------------------- | ----------- |
    | `PORT`                | The port for the HTTP server.                               | `3000`      |
    | `WS_PORT`             | The port for the WebSocket server.                          | `3001`      |
    | `TOOLS_DIR`           | The directory where your tool files are located.            | `./tools`   |
    | `AUTH_ENABLED`        | Set to `false` to disable authentication.                   | `true`      |
    | `JWT_SECRET`          | A long, random secret key for signing JWTs.                 | `your-secr` |
    | `ADMIN_TOKEN`         | A master token for admin access. Keep this secure.          | `your-admi` |
    | `RATE_LIMITING_ENABLED`| Set to `false` to disable rate limiting.                   | `true`      |
    | `WEATHER_API_KEY`     | API key for the Amap Weather API used by the `weather` tool. | `""`        |


## 🏃 Usage

### Running Locally

Start the server with the following command:

```sh
npm start
```

You should see output indicating that the server is running and tools have been loaded:

```
MCP Server starting with configuration:
  HTTP Port: 3000
  WebSocket Port: 3001
  Tools Directory: /path/to/your/project/tools
  Authentication: Enabled
  Rate Limiting: Enabled

MCP Server running on:
  HTTP: http://localhost:3000
  WebSocket: ws://localhost:3001
  SSE: http://localhost:3000/sse
  Health check: http://localhost:3000/health
  Tools list: http://localhost:3000/tools
```

### Running with Docker

For a more isolated and reproducible environment, use Docker Compose. The official image is available on Docker Hub and is the recommended method for `amd64` architectures.

1.  **Ensure your `.env` file is configured.**
2.  **Run the container:**
    This command will automatically pull the `zhoutijie/milomcp:latest` image from Docker Hub and start the service.
    ```sh
    docker-compose up -d
    ```
    If you are on a different architecture or need to build the image from source, run `docker-compose up --build -d` instead.

The server will be available at `http://localhost:3000`. The `tools` directory is mounted as a volume, so you can still modify tools on your host machine and use the `/reload` endpoint.

## 📡 API Endpoints

The server exposes several endpoints for interaction and management.

| Method | Endpoint        | Description                               | Auth Required |
| ------ | --------------- | ----------------------------------------- | ------------- |
| `GET`  | `/health`       | Checks the server's health and status.    | No            |
| `GET`  | `/tools`        | Lists all available tools and their schemas. | Yes           |
| `POST` | `/jsonrpc`      | The main endpoint for JSON-RPC calls.     | Yes           |
| `POST` | `/mcp`          | An alias for `/jsonrpc` for MCP compatibility. | Yes           |
| `POST` | `/reload`       | Hot-reloads all tools from the tools directory. | Yes           |
| `GET`  | `/sse`          | Establishes a Server-Sent Events (SSE) connection. | Yes           |
| `POST` | `/messages`     | Receives MCP requests and broadcasts responses via SSE. | Yes           |
| `GET`  | `/admin/users`  | Lists all registered users.               | Admin         |
| `POST` | `/admin/users`  | Adds a new user.                          | Admin         |

**Example: Calling a tool with `curl`**

```sh
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

## 🛠️ Creating Tools

Creating a new tool is simple. Just create a new `.js` file in your `tools` directory (`./tools` by default).

Each tool file must export an object with the following properties:

*   `name` (string): The unique name of the tool (e.g., `weather.get_current_weather`).
*   `description` (string): A clear description of what the tool does.
*   `parameters` (object): An object defining the input parameters for the tool.
*   `execute` (async function): The function that contains the tool's logic.

**Example: `tools/calculator.js`**

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
  async execute({ expression }) {
    try {
      // Note: Using eval is risky in production. This is just an example.
      // A safer implementation would use a math parsing library.
      const result = eval(expression);
      return `The result of "${expression}" is ${result}.`;
    } catch (error) {
      return `Error evaluating expression: ${error.message}`;
    }
  }
};
```

After adding the file, either restart the server or call the `/reload` endpoint to load the new tool.

> **Hint**: The included `weather` tool is a more advanced example that calls an external **Amap Weather API**. To use it, you must configure your `WEATHER_API_KEY` in the `.env` file.

## 🔐 Authentication

When authentication is enabled (`AUTH_ENABLED=true`), all endpoints (except `/health`) are protected.

*   **Admin Token**: The `ADMIN_TOKEN` from your `.env` file grants full access, including to the `/admin/*` routes for user management.
*   **User Tokens**: You can create new users and API tokens using the admin endpoints. These tokens can have specific permissions and rate limits.

To authenticate, provide the token in the `Authorization` header:

`Authorization: Bearer YOUR_TOKEN_HERE`

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---
*This README was generated with the help of an AI assistant.*