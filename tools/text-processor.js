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
      description: '要执行的具体操作 (e.g., "uppercase", "wordFrequency")',
      required: true
    }
  },
  examples: [
    { text: 'Hello World!', operation: 'uppercase' },
    { text: 'The quick brown fox jumps over the lazy dog. The dog was not amused.', operation: 'wordFrequency' }
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

      default:
        throw new Error(`操作 "${operation}" 不支持或应通过CPU密集型任务执行器调用。请检查工具文档。`);
    }
  },

  /**
   * 定义纯计算、可能会阻塞的CPU密集型函数。
   * 框架会自动将这些函数放入工作线程中执行。
   */
  cpu: {
    wordFrequency: (text) => {
      if (!text || typeof text !== 'string') {
        return [];
      }
      const words = text.toLowerCase()
        .replace(/[^\w\s]/g, '') // 移除标点
        .split(/\s+/)
        .filter(word => word.length > 0);
      
      const frequency = {};
      words.forEach(word => {
        frequency[word] = (frequency[word] || 0) + 1;
      });
      
      // 返回排序后的前10个结果
      return Object.entries(frequency)
        .sort((a, b) => b - a)
        .slice(0, 10)
        .map(([word, count]) => ({ word, count }));
    },

    count: (text) => {
      if (!text || typeof text !== 'string') {
        return {};
      }
      return {
        characters: text.length,
        charactersNoSpaces: text.replace(/\s/g, '').length,
        words: text.trim().split(/\s+/).filter(word => word.length > 0).length,
        lines: text.split('\n').length,
        paragraphs: text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length
      };
    }
  }
};