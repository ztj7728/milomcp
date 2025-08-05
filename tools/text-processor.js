module.exports = {
  name: 'text-processor',
  description: '处理文本：统计、转换、提取等功能',
  parameters: {
    text: {
      type: 'string',
      description: '要处理的文本内容'
    },
    operation: {
      type: 'string',
      description: '操作类型',
      enum: ['count', 'uppercase', 'lowercase', 'reverse', 'extract-emails', 'extract-urls', 'word-frequency'],
      default: 'count'
    }
  },
  required: ['text'],
  examples: [
    { text: 'Hello World!', operation: 'count' },
    { text: 'Hello World!', operation: 'uppercase' },
    { text: 'Contact us at support@example.com', operation: 'extract-emails' }
  ],

  async execute(args) {
    const { text, operation = 'count' } = args;
    
    if (!text || typeof text !== 'string') {
      throw new Error('Missing or invalid text parameter');
    }

    const result = {
      originalText: text,
      operation: operation,
      timestamp: new Date().toISOString()
    };

    switch (operation) {
      case 'count':
        result.stats = {
          characters: text.length,
          charactersNoSpaces: text.replace(/\s/g, '').length,
          words: text.trim().split(/\s+/).filter(word => word.length > 0).length,
          lines: text.split('\n').length,
          paragraphs: text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length
        };
        result.summary = `文本包含 ${result.stats.characters} 个字符，${result.stats.words} 个词，${result.stats.lines} 行`;
        break;

      case 'uppercase':
        result.processedText = text.toUpperCase();
        result.summary = '文本已转换为大写';
        break;

      case 'lowercase':
        result.processedText = text.toLowerCase();
        result.summary = '文本已转换为小写';
        break;

      case 'reverse':
        result.processedText = text.split('').reverse().join('');
        result.summary = '文本已反转';
        break;

      case 'extract-emails':
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        result.extractedEmails = text.match(emailRegex) || [];
        result.summary = `提取到 ${result.extractedEmails.length} 个邮箱地址`;
        break;

      case 'extract-urls':
        const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
        result.extractedUrls = text.match(urlRegex) || [];
        result.summary = `提取到 ${result.extractedUrls.length} 个URL`;
        break;

      case 'word-frequency':
        const words = text.toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .filter(word => word.length > 0);
        
        const frequency = {};
        words.forEach(word => {
          frequency[word] = (frequency[word] || 0) + 1;
        });
        
        result.wordFrequency = Object.entries(frequency)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([word, count]) => ({ word, count }));
        
        result.summary = `分析了 ${words.length} 个词，显示前10个高频词`;
        break;

      default:
        throw new Error(`不支持的操作类型: ${operation}`);
    }

    return result;
  }
};