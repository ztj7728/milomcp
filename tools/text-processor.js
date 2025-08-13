module.exports = {
  name: 'text-processor',
  description: '处理文本：统计、转换、提取等功能。调用时需指定operation参数。',
  parameters: {
    text: {
      type: 'string',
      description: '要处理的文本内容',
      required: true
    },
    operation: {
      type: 'string',
      description: '要执行的具体操作 (e.g., "uppercase", "lowercase", "reverse", "extract-emails", "extract-urls", "countWordOccurrence")',
      required: true
    },
    word: {
      type: 'string',
      description: '要操作的特定单词 (例如 "Emma")',
      required: false
    }
  },
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