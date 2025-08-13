# 工具开发指南

本指南旨在帮助开发者为MiloMCP框架创建功能强大、高效且易于维护的工具。我们的核心设计哲学是：**让开发者专注于业务逻辑，将基础设施的复杂性交给框架处理。**

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

**工作原理**：当工具被调用时，框架会检查调用的操作是否在 `cpu` 对象中定义。
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
  description: '处理文本：统计、转换、提取等功能',
  parameters: {
    text: { type: 'string', description: '要处理的文本内容', required: true },
    operation: { type: 'string', description: '操作类型', default: 'count' }
  },

  // 轻量级操作放在 execute 中
  async execute(args) {
    const { text, operation } = args;
    switch (operation) {
      case 'uppercase':
        return text.toUpperCase();
      case 'lowercase':
        return text.toLowerCase();
      case 'reverse':
        return text.split('').reverse().join('');
      default:
        // 如果操作不是轻量级的，或者未定义，可以抛出错误或返回提示
        throw new Error(`操作 "${operation}" 不支持或应通过CPU密集型任务执行器调用。`);
    }
  },

  // 重量级操作放在 cpu 中
  cpu: {
    wordFrequency: (text) => {
      const words = text.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 0);
      
      const frequency = {};
      words.forEach(word => {
        frequency[word] = (frequency[word] || 0) + 1;
      });
      
      return Object.entries(frequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word, count]) => ({ word, count }));
    },
    
    countStats: (text) => {
        return {
          characters: text.length,
          words: text.trim().split(/\s+/).length,
          lines: text.split('\n').length
        };
    }
  }
};
```

通过遵循本指南，你可以轻松地为MiloMCP生态系统贡献出既强大又不会阻塞服务器的关键功能。