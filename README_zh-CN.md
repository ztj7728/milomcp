# MiloMCP - 一个灵活的 MCP 开发框架

[English](./README.md) | [简体中文](./README_zh-CN.md)

![GitHub License](https://img.shields.io/badge/license-MIT-blue.svg)![npm version](https://img.shields.io/npm/v/milomcp.svg?style=flat)![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)![Docker Pulls](https://img.shields.io/docker/pulls/zhoutijie/milomcp.svg)

**MiloMCP** 是一个强大而灵活的**模型上下文协议 (MCP)** 开发框架。它为 AI 应用提供了坚实的后端基础，通过 HTTP 和 WebSocket 支持 JSON-RPC 2.0，实现了无缝的通信和工具集成。

---

## 🌟 概览

MiloMCP 通过提供标准化的方式向语言模型暴露工具和能力，从而简化了构建 AI 驱动服务的过程。它基于 Node.js 和 Express 构建，具有高性能和即插即用的工具架构。

### ✨ 核心特性

*   **🔌 可插拔工具架构**: 只需将 JavaScript 文件放入指定目录，即可轻松添加或移除工具。
*   **📡 多协议支持**: 同时支持通过 **HTTP**、**WebSocket** 和 **服务器发送事件 (SSE)** 进行 JSON-RPC 2.0 通信。
*   **🔐 内置身份验证**: 使用基于 JWT 的身份验证和权限管理来保护您的端点。
*   **⚡ 速率限制**: 通过可配置的速率限制保护您的服务器免受滥用。
*   **🐳 Docker 化**: 使用 Docker 和 Docker Compose 在几秒钟内启动并运行。
*   **🔥 热重载**: 无需重启服务器即可动态重载工具。
*   **⚙️ 简易配置**: 通过一个简单的 `.env` 文件管理所有设置。

## 📚 目录

- [快速开始](#快速开始)
  - [环境要求](#环境要求)
  - [安装](#安装)
  - [配置](#配置)
- [使用方法](#使用方法)
  - [本地运行](#本地运行)
  - [使用 Docker 运行](#使用-docker-运行)
- [API 端点](#api-端点)
- [创建工具](#创建工具)
- [身份验证](#身份验证)
- [贡献](#贡献)
- [许可证](#许可证)

## 🚀 快速开始

请按照以下说明在本地环境中部署和运行。

### 环境要求

*   **Node.js**: 14.0.0 或更高版本。
*   **npm**: 已包含在 Node.js 中。
*   **Docker** (可选): 用于容器化部署。

### 安装

1.  **克隆仓库:**
    ```sh
    git clone https://github.com/ztj7728/milomcp.git
    cd milomcp
    ```

2.  **安装依赖:**
    ```sh
    npm install
    ```

### 配置

1.  **创建环境文件:**
    将示例配置文件复制为新的 `.env` 文件。
    ```sh
    cp .env.example .env
    ```

2.  **编辑 `.env` 文件:**
    打开 `.env` 并自定义设置。

    | 变量                  | 描述                                       | 默认值      |
    | --------------------- | ------------------------------------------ | ----------- |
    | `PORT`                | HTTP 服务器的监听端口。                    | `3000`      |
    | `WS_PORT`             | WebSocket 服务器的监听端口。               | `3001`      |
    | `TOOLS_DIR`           | 工具文件所在的目录。                       | `./tools`   |
    | `AUTH_ENABLED`        | 设置为 `false` 可禁用身份验证。            | `true`      |
    | `JWT_SECRET`          | 用于签署 JWT 的长随机密钥。                | `your-secr` |
    | `ADMIN_TOKEN`         | 用于管理员访问的主令牌，请妥善保管。       | `your-admi` |
    | `RATE_LIMITING_ENABLED`| 设置为 `false` 可禁用速率限制。           | `true`      |
    | `WEATHER_API_KEY`     | 用于 `weather` 工具的高德地图天气API密钥。 | `""`        |


## 🏃 使用方法

### 本地运行

使用以下命令启动服务器：

```sh
npm start
```

您应该会看到服务器正在运行并且工具已加载的输出：

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

### 使用 Docker 运行

为了获得更隔离和可复现的环境，请使用 Docker Compose。官方镜像已发布在 Docker Hub，推荐 `amd64` 架构的用户使用此方法。

1.  **确保您的 `.env` 文件已配置。**
2.  **运行容器:**
    此命令将自动从 Docker Hub 拉取 `zhoutijie/milomcp:latest` 镜像并启动服务。
    ```sh
    docker-compose up -d
    ```
    如果您使用其他架构或需要从源代码构建镜像，请运行 `docker-compose up --build -d`。

服务器将在 `http://localhost:3000` 上可用。`tools` 目录已作为卷挂载，因此您仍然可以在主机上修改工具，并使用 `/reload` 端点进行热重载。

## 📡 API 端点

服务器提供了多个用于交互和管理的端点。

| 方法   | 端点            | 描述                                      | 需要认证 |
| ------ | --------------- | ----------------------------------------- | -------- |
| `GET`  | `/health`       | 检查服务器的健康状况和状态。              | 否       |
| `GET`  | `/tools`        | 列出所有可用工具及其定义。                | 是       |
| `POST` | `/jsonrpc`      | 用于 JSON-RPC 调用的主端点。              | 是       |
| `POST` | `/mcp`          | `/jsonrpc` 的别名，用于 MCP 兼容。        | 是       |
| `POST` | `/reload`       | 从工具目录热重载所有工具。                | 是       |
| `GET`  | `/sse`          | 建立一个服务器发送事件 (SSE) 连接。       | 是       |
| `POST` | `/messages`     | 接收 MCP 请求并通过 SSE 广播响应。        | 是       |
| `GET`  | `/admin/users`  | 列出所有已注册的用户。                    | 管理员   |
| `POST` | `/admin/users`  | 添加一个新用户。                          | 管理员   |

**示例: 使用 `curl` 调用工具**

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

## 🛠️ 创建工具

创建新工具非常简单。只需在您的工具目录（默认为 `./tools`）中创建一个新的 `.js` 文件。

每个工具文件必须导出一个具有以下属性的对象：

*   `name` (string): 工具的唯一名称 (例如, `weather.get_current_weather`)。
*   `description` (string): 对工具功能的清晰描述。
*   `parameters` (object): 定义工具输入参数的对象。
*   `execute` (async function): 包含工具逻辑的函数。

**示例: `tools/calculator.js`**

```javascript
module.exports = {
  name: 'calculator',
  description: '计算一个数学表达式。',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: '要计算的数学表达式 (例如, "2 * (3 + 4)")'
      }
    },
    required: ['expression']
  },
  async execute({ expression }) {
    try {
      // 注意: 在生产环境中使用 eval 存在风险。这只是一个示例。
      // 更安全的实现应使用数学解析库。
      const result = eval(expression);
      return `"${expression}" 的计算结果是 ${result}。`;
    } catch (error) {
      return `计算表达式时出错: ${error.message}`;
    }
  }
};
```

添加文件后，重启服务器或调用 `/reload` 端点以加载新工具。

> **提示**: 项目中包含的 `weather` 工具是一个更高级的示例，它调用了外部的**高德天气API**。要使用此工具，您需要在 `.env` 文件中配置 `WEATHER_API_KEY`。

## 🔐 身份验证

当启用身份验证 (`AUTH_ENABLED=true`) 时，除 `/health` 外的所有端点都将受到保护。

*   **管理员令牌**: `.env` 文件中的 `ADMIN_TOKEN` 授予完全访问权限，包括用于用户管理的 `/admin/*` 路由。
*   **用户令牌**: 您可以使用管理员端点创建新用户和 API 令牌。这些令牌可以具有特定的权限和速率限制。

要进行身份验证，请在 `Authorization` 请求头中提供令牌：

`Authorization: Bearer YOUR_TOKEN_HERE`

## 🤝 贡献

贡献是使开源社区成为一个学习、激励和创造的绝佳场所的原因。我们**非常感谢**您的任何贡献。

1.  Fork 本项目
2.  创建您的功能分支 (`git checkout -b feature/AmazingFeature`)
3.  提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4.  推送到分支 (`git push origin feature/AmazingFeature`)
5.  打开一个 Pull Request

## 📜 许可证

根据 MIT 许可证分发。有关更多信息，请参阅 `LICENSE` 文件。

---
*此 README 由 AI 助手协助生成。*