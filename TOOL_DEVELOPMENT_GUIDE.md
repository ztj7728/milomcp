# 工具开发指南

本指南旨在帮助开发者为MiloMCP框架创建功能强大、高效且易于维护的工具。我们的核心设计哲学是：**让开发者专注于业务逻辑，将基础设施的复杂性交给框架处理。**

## 文档日期
2025/8/15

## 工具模块结构

每个工具都应该是一个独立的Node.js模块（一个`.js`文件），位于`tools`目录下。该模块必须导出一个对象，该对象包含工具的元数据和执行逻辑。

一个标准的工具模块结构如下：

```javascript
// tools/your-tool-name.js

module.exports = {
  // 1. 元数据 (必需)
  name: 'your-tool-name',
  description: '简要描述你的工具做什么。',
  
  // 2. 参数定义 (可选)
  parameters: {
    param1: {
      type: 'string', // 'string', 'number', 'boolean', 'object', 'array'
      description: '参数1的描述。',
      required: true // 或 false
    },
    param2: {
      type: 'number',
      description: '参数2的描述。',
      default: 100 // 可选的默认值
    }
  },

  // 3. 轻量级任务执行器 (可选)
  execute: async (args, context) => {
    // 在这里处理I/O密集型或轻量级的CPU任务。
    // args: 包含所有经过验证的参数的对象。
    // context: 框架提供的上下文，可能包含logger, db连接等。
    return `处理完成，参数1是 ${args.param1}`;
  },

  // 4. CPU密集型任务执行器 (可选)
  cpu: {
    // 在这里定义纯计算、可能会阻塞的函数。
    // 函数名应该与一个可区分的操作相对应。
    complexCalculation: (param1, param2) => {
      // **重要**: 这里的函数必须是纯函数，只依赖于其输入参数。
      // **不要** 在这里执行任何I/O操作或访问外部状态。
      // 框架会自动将这个函数放入工作线程中执行。
      
      // 示例：一个耗时的计算
      let result = 0;
      for (let i = 0; i < param2 * 10000000; i++) {
        result += Math.sqrt(i);
      }
      return { finalResult: result, input: param1 };
    }
  }
};
```

## 核心概念

### `execute` vs `cpu`

正确区分何时使用 `execute` 和何时使用 `cpu` 是开发高效工具的关键。

#### 使用 `execute` 的场景：

-   **I/O密集型任务**：如读写文件、访问数据库、调用外部API等。这些操作应该总是使用 `async/await`。
-   **轻量级、快速的计算**：如简单的字符串操作、数学计算、对象转换等。这些操作在主线程上执行不会造成明显阻塞。

#### 使用 `cpu` 的场景：

-   **长时间运行的计算**：如复杂的数学运算（斐波那契数列）、大规模数据处理（大型数组排序、过滤）、图像或视频处理、数据加解密等。
-   **任何可能阻塞事件循环超过几毫秒的同步代码**。

**工作原理**：当工具被调用时，框架会检查 `arguments` 中 `operation` 参数指定的操作是否存在于 `tool.cpu` 对象中。
-   **是**：框架会自动将该函数及其参数发送到共享的 **Worker Thread 池** 中执行，确保主线程不会被阻塞。
-   **否**：框架会调用 `execute` 方法。

### 编写 `cpu` 函数的规则

1.  **必须是纯函数**：函数的输出应该只由其输入决定。
2.  **必须是同步的**：不要在 `cpu` 函数内部使用 `async/await`。框架会处理异步化。
3.  **无副作用**：不要修改函数外部的变量、写入文件或数据库。
4.  **参数简单**：函数的参数应该是可序列化的（字符串、数字、普通对象、数组等）。不要传递复杂的类实例。

## 示例：`text-processor` 工具

下面是 `text-processor` 工具遵循此规范的示例。

```javascript
// tools/text-processor.js
module.exports = {
  name: 'text-processor',
  description: '处理文本：统计、转换、提取等功能。调用时需指定operation参数。',
  parameters: {
    text: {
      type: 'string',
      description: '要处理的文本内容'
    },
    operation: {
      type: 'string',
      description: '要执行的具体操作 (e.g., "uppercase", "lowercase", "reverse", "extract-emails", "extract-urls", "countWordOccurrence")'
    },
    word: {
      type: 'string',
      description: '要操作的特定单词 (例如 "Emma")'
    }
  },
  required: ['text', 'operation'],
  examples: [
    { text: 'Hello World!', operation: 'uppercase' },
    { text: 'Emma is a writer. Emma lives in Paris.', operation: 'countWordOccurrence', word: 'Emma' }
  ],

  /**
   * 执行轻量级或I/O密集型任务。
   * 对于CPU密集型任务，框架会自动调用下面的 'cpu' 对象中的方法。
   */
  async execute(args) {
    const { text, operation } = args;

    switch (operation) {
      case 'uppercase':
        return text.toUpperCase();
      
      case 'lowercase':
        return text.toLowerCase();
      
      case 'reverse':
        return text.split('').reverse().join('');

      case 'extract-emails':
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        return text.match(emailRegex) || [];

      case 'extract-urls':
        const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
        return text.match(urlRegex) || [];

      default: {
        const cpuOperations = Object.keys(this.cpu);
        if (cpuOperations.includes(operation)) {
          throw new Error(`操作 "${operation}" 是一个CPU密集型任务，应该在工作线程中执行。`);
        }
        const lightweightOperations = ['uppercase', 'lowercase', 'reverse', 'extract-emails', 'extract-urls'];
        const availableOperations = [...lightweightOperations, ...cpuOperations];
        throw new Error(`不支持的操作: "${operation}". 可用的操作有: ${availableOperations.join(', ')}`);
      }
    }
  },

  /**
   * 定义纯计算、可能会阻塞的CPU密集型函数。
   * 框架会自动将这些函数放入工作线程中执行。
   */
  cpu: {
    countWordOccurrence: ({ text, word }) => {
      if (!text || typeof text !== 'string' || !word) {
        return { count: 0 };
      }
      const specificWord = word.toLowerCase();
      const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
      
      const count = words.reduce((acc, currentWord) => {
        return currentWord === specificWord ? acc + 1 : acc;
      }, 0);

      return { word: specificWord, count };
    },

    wordCount: ({ text }) => {
      if (!text || typeof text !== 'string') {
        return {};
      }
      const words = text.trim().split(/\s+/).filter(word => word.length > 0);
      return {
        characters: text.length,
        words: words.length,
        lines: text.split('\n').length,
      };
    }
  }
};
```

## 工具生命周期管理

MiloMCP框架提供了完整的工具生命周期管理功能，包括工具的列表查询、动态重载等操作。这些功能通过RESTful API和JSON-RPC 2.0协议提供，方便前端开发者集成。

### 工具列表查询

框架提供两种方式查询已加载的工具列表：

#### 方式一：RESTful API

**端点**: `GET /tools`

**请求示例**:
```bash
curl -X GET http://localhost:3000/tools
```

**响应格式**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "tools": [
      {
        "name": "text-processor",
        "description": "处理文本：统计、转换、提取等功能。调用时需指定operation参数。",
        "inputSchema": {
          "type": "object",
          "properties": {
            "text": {
              "type": "string",
              "description": "要处理的文本内容"
            },
            "operation": {
              "type": "string",
              "description": "要执行的具体操作 (e.g., \"uppercase\", \"lowercase\", \"reverse\", \"extract-emails\", \"extract-urls\", \"countWordOccurrence\")"
            },
            "word": {
              "type": "string",
              "description": "要操作的特定单词 (例如 \"Emma\")"
            }
          },
          "required": ["text", "operation"]
        }
      }
    ]
  }
}
```

#### 方式二：JSON-RPC 2.0

**端点**: `POST /jsonrpc`

**请求示例**:
```json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 1
}
```

**响应格式**:```json
{
  "jsonrpc": "2.0",
  "result": {
    "tools": [
      {
        "name": "text-processor",
        "description": "处理文本：统计、转换、提取等功能。调用时需指定operation参数。",
        "inputSchema": {
          "type": "object",
          "properties": {
            "text": {
              "type": "string",
              "description": "要处理的文本内容"
            },
            "operation": {
              "type": "string",
              "description": "要执行的具体操作 (e.g., \"uppercase\", \"lowercase\", \"reverse\", \"extract-emails\", \"extract-urls\", \"countWordOccurrence\")"
            },
            "word": {
              "type": "string",
              "description": "要操作的特定单词 (例如 \"Emma\")"
            }
          },
          "required": ["text", "operation"]
        }
      }
    ]
  },
  "id": 1
}
```

### 工具重载

当您添加、修改或删除工具文件后，可以使用重载API来刷新工具列表，无需重启服务器。

**端点**: `POST /reload`

**请求示例**:
```bash
curl -X POST http://localhost:3000/reload
```

**成功响应**:
```json
{
  "success": true,
  "message": "工具重载成功",
  "loadedTools": ["text-processor", "calculator"],
  "reloadTime": "2024-01-15T10:30:00.000Z"
}
```

**失败响应**:
```json
{
  "success": false,
  "error": "工具重载失败: [具体错误信息]"
}
```

### 工具管理工作流程

#### 添加新工具

1. **创建工具文件**: 在 `tools/` 目录下创建新的 `.js` 文件
2. **编写工具代码**: 按照本指南的规范编写工具模块
3. **重载工具**: 调用 `POST /reload` API 重新加载工具
4. **验证工具**: 使用 `GET /tools` 或 `tools/list` 确认工具已成功加载

**示例工作流程**:
```bash
# 1. 创建新工具文件
echo 'module.exports = { name: "hello", description: "Say hello", execute: async () => "Hello!" };' > tools/hello.js

# 2. 重载工具
curl -X POST http://localhost:3000/reload

# 3. 验证工具已加载
curl -X GET http://localhost:3000/tools
```

#### 修改现有工具

1. **编辑工具文件**: 修改 `tools/` 目录下的对应 `.js` 文件
2. **重载工具**: 调用 `POST /reload` API 应用更改
3. **测试工具**: 调用工具验证修改是否生效

#### 删除工具

1. **删除工具文件**: 从 `tools/` 目录删除对应的 `.js` 文件
2. **重载工具**: 调用 `POST /reload` API 更新工具列表
3. **确认删除**: 使用 `GET /tools` 确认工具已从列表中移除

**注意事项**:
- 工具文件的修改会在下次重载时生效
- 重载操作是原子性的，要么全部成功，要么全部回滚
- 如果某个工具文件有语法错误，重载会失败并保持原有工具列表
- 建议在生产环境中谨慎使用重载功能

### 错误处理

工具管理API会返回详细的错误信息，帮助开发者快速定位问题：

**常见错误类型**:
- **语法错误**: 工具文件包含JavaScript语法错误
- **模块错误**: 工具模块导出格式不正确
- **参数错误**: 工具参数定义不符合规范
- **文件系统错误**: 无法读取tools目录或文件权限问题

**错误响应示例**:
```json
{
  "success": false,
  "error": "工具加载失败",
  "details": {
    "file": "tools/broken-tool.js",
    "error": "SyntaxError: Unexpected token '}'"
  }
}
```

通过遵循本指南，你可以轻松地为MiloMCP生态系统贡献出既强大又不会阻塞服务器的关键功能，并且能够灵活地管理工具的整个生命周期。