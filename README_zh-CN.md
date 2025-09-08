# MiloMCP - 一个灵活的 MCP 开发框架

[English](./README.md) | [简体中文](./README_zh-CN.md)

![GitHub License](https://img.shields.io/badge/license-MIT-blue.svg)![npm version](https://img.shields.io/npm/v/milomcp.svg?style=flat)![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)![Docker Pulls](https://img.shields.io/docker/pulls/zhoutijie/milomcp.svg)

**MiloMCP** 是一个强大的、多用户的**模型上下文协议 (MCP)** 开发框架。它为 AI 应用提供了坚实的后端基础，通过 HTTP 和 WebSocket 支持 JSON-RPC 2.0，实现了无缝的通信和工具集成。每个用户都拥有自己安全的工作区来管理工具和环境变量。

---

## 🌟 概览

MiloMCP 通过提供标准化的、以用户为中心的方式向语言模型暴露工具和能力，从而简化了构建 AI 驱动服务的过程。它基于 Node.js、Express 和 SQLite 构建，具有高性能、数据持久化和安全管理用户特定工具的架构。

### ✨ 核心特性

*   **👤 多用户架构**: 为每个用户提供安全、隔离的工作区，以管理自己的工具和环境变量。
*   **🔐 强大的身份验证**: 完整的身份验证系统，包括用户注册、登录 (基于 JWT) 和 API 令牌管理。
*   **🛠️ 动态工具管理**: 用户可以通过 RESTful API 创建、读取、更新和删除自己的工具。
*   **📡 多协议支持**: 同时支持通过 **HTTP** 和 **WebSocket** 进行 JSON-RPC 2.0 通信。
*   **⚙️ 持久化存储**: 用户数据、工具和环境变量存储在持久化的 SQLite 数据库中。
*   **🐳 Docker 化**: 通过统一的配置，无论是本地运行还是 Docker 部署，都能在几秒钟内启动并运行。
*   **🌐 RESTful API**: 用于管理用户、身份验证、工具和环境变量的综合 API。

## 📚 目录

- [快速开始](#快速开始)
  - [环境要求](#环境要求)
  - [安装](#安装)
  - [配置](#配置)
- [使用方法](#使用方法)
  - [本地运行](#本地运行)
  - [使用 Docker 运行](#使用-docker-运行)
- [API 端点](#api-端点)
- [创建和使用工具](#创建和使用工具)
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
    将示例配置文件复制为新的 `.env` 文件。此文件是所有配置的中心。
    ```sh
    cp .env.example .env
    ```

2.  **编辑 `.env` 文件:**
    打开 `.env` 并自定义设置。**此文件中的配置将同时对本地 `npm start` 和 Docker 部署生效**。

    | 变量                 | 描述                                       | 默认值      | 
    | ------------------------ | ------------------------------------------ | ----------- | 
    | `PORT`                   | HTTP 和 WebSocket 服务器的监听端口。       | `3000`      | 
    | `JWT_SECRET`             | 用于签署 JWT 访问令牌的长随机密钥。        | `your-jwt-secret` | 
    | `INITIAL_ADMIN_USER`     | 初始管理员账户的用户名。                   | `admin`     | 
    | `INITIAL_ADMIN_PASSWORD` | 初始管理员账户的密码。                     | `adminpass` | 

    **重要提示**: 服务器首次启动时，将使用上述凭据创建一个管理员用户。如果未设置这些变量，则不会创建管理员用户。

## 🏃 使用方法

### 本地运行

使用以下命令启动服务器。服务器将读取 `.env` 文件中的配置。

```sh
npm start
```

您应该会看到服务器正在运行的输出：
```
Server is running on http://localhost:3000
```

### 使用 Docker 运行

为了获得更隔离和可复现的环境，请使用 Docker Compose。

1.  **配置 `.env` 文件:**
    确保您的 `.env` 文件已根据需要配置。`docker-compose` 会自动读取此文件。

2.  **运行容器:**
    项目提供了一个便捷的部署脚本，用于拉取最新镜像并启动容器。

    首先，为脚本添加执行权限（仅需首次执行）：
    ```sh
    chmod +x deploy.sh
    ```

    然后，运行脚本来部署服务：
    ```sh
    ./deploy.sh
    ```
    此脚本会从 Docker Hub 拉取最新的 `zhoutijie/milomcp` 镜像，并使用您在 `.env` 文件中的配置来启动服务。`db` 和 `tools` 目录将作为卷进行持久化。

## 📡 API 端点

服务器提供了一个用于管理的 RESTful API 和一个用于工具交互的 JSON-RPC 端点。

### REST API

所有 REST 端点都以 `/api` 为前缀。

| 方法   | 端点                          | 描述                               | 需要认证 | 仅管理员 | 
| -------- | ----------------------------- | ---------------------------------- | -------- | -------- | 
| `POST`   | `/sign-up`                    | 创建一个新用户账户。               | 否       | 否       | 
| `POST`   | `/login`                      | 登录用户并返回 JWT 访问令牌。      | 否       | 否       | 
| `GET`    | `/me`                         | 获取当前用户的个人资料。           | 是       | 否       | 
| `GET`    | `/tokens`                     | 列出当前用户的所有 API 令牌。      | 是       | 否       | 
| `POST`   | `/tokens`                     | 为当前用户创建一个新的 API 令牌。  | 是       | 否       | 
| `DELETE` | `/tokens/:token`              | 撤销一个 API 令牌。                | 是       | 否       | 
| `GET`    | `/workspace/files`            | 列出用户工作区中的所有工具文件。   | 是       | 否       | 
| `GET`    | `/workspace/files/:filename`  | 读取特定工具文件的内容。           | 是       | 否       | 
| `PUT`    | `/workspace/files/:filename`  | 创建或更新一个工具文件。           | 是       | 否       | 
| `DELETE` | `/workspace/files/:filename`  | 从工作区删除一个工具文件。         | 是       | 否       | 
| `GET`    | `/environment`                | 获取用户的所有环境变量。           | 是       | 否       | 
| `POST`   | `/environment`                | 为用户设置一个环境变量。           | 是       | 否       | 
| `DELETE` | `/environment/:key`           | 删除一个环境变量。                 | 是       | 否       | 
| `GET`    | `/users`                      | 列出系统中的所有用户。             | 是       | 是       | 
| `POST`   | `/users`                      | 创建一个新用户（仅管理员）。       | 是       | 是       | 
| `DELETE` | `/users/:id`                  | 删除一个用户（仅管理员）。         | 是       | 是       | 

### JSON-RPC API

JSON-RPC 调用的主端点是 `/jsonrpc` (或其别名 `/mcp`)。

**示例: 使用 `curl` 调用工具**

要调用工具，您需要一个有效的 API 令牌。您可以在登录后通过 `/api/tokens` 端点创建一个。

```sh
# 首先，登录以获取访问令牌
curl -X POST http://localhost:3000/api/login \
     -H "Content-Type: application/json" \
     -d '{ "username": "youruser", "password": "yourpassword" }'

# 接下来，使用您的访问令牌创建一个 API 令牌
curl -X POST http://localhost:3000/api/tokens \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     -d '{ "name": "my-first-token", "permissions": ["*"] }'

# 最后，使用新的 API 令牌调用工具
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

## 🛠️ 创建和使用工具

每个用户在自己的个人工作区中管理自己的一套工具。

1.  **登录**: 通过 `/api/login` 端点进行身份验证，以获取 JWT 访问令牌。
2.  **创建工具**: 使用 `PUT /api/workspace/files/:filename` 端点上传您的工具代码。文件名将用作工具的名称 (例如, `calculator.js`)。
3.  **创建 API 令牌**: 使用 `/api/tokens` 端点生成一个 API 令牌。您可以授予它对特定工具 (例如, `["calculator"]`) 或所有工具 (`["*"]`) 的权限。
4.  **调用工具**: 使用带有您的 API 令牌的 JSON-RPC 端点来执行工具。

**示例: `calculator.js`**

每个工具文件必须导出一个具有 `name`、`description`、`parameters` 和 `execute` 函数的对象。

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
  async execute(args, env) {
    // `args` 包含从工具调用传递的参数。
    // `env` 包含用户合并的环境变量。
    try {
      // 注意: 使用 eval 存在风险。更安全的实现应使用数学解析库。
      const result = eval(args.expression);
      return `计算结果是 ${result}。`;
    } catch (error) {
      return `计算表达式时出错: ${error.message}`;
    }
  }
};
```

## 🔐 身份验证

身份验证通过两种类型的令牌进行管理：

1.  **访问令牌 (JWT)**: 通过 `/api/login` 获取的短期令牌。它们用于访问 REST API 以管理您的帐户、工具和 API 令牌。在 `Authorization: Bearer <token>` 请求头中提供它们。
2.  **API 令牌**: 您为外部服务或模型创建的长期令牌，用于调用您的工具。它们可以被限制为特定的权限。在 JSON-RPC 调用的 `Authorization: Bearer <token>` 请求头中提供它们。

## 🤝 贡献

贡献是使开源社区成为一个学习、激励和创造的绝佳场所的原因。我们**非常感谢**您的任何贡献。

1.  Fork 本项目
2.  创建您的功能分支 (`git checkout -b feature/AmazingFeature`)
3.  提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4.  推送到分支 (`git push origin feature/AmazingFeature`)
5.  打开一个 Pull Request

## 📜 许可证

根据 MIT 许可证分发。有关更多信息，请参阅 `LICENSE` 文件。
