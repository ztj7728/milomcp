const crypto = require('crypto');

module.exports = {
  name: 'uuid-generator',
  description: '生成各种类型的唯一标识符',
  parameters: {
    type: {
      type: 'string',
      description: 'UUID类型',
      enum: ['uuid4', 'timestamp', 'short', 'numeric', 'hex'],
      default: 'uuid4'
    },
    count: {
      type: 'integer',
      description: '生成数量',
      minimum: 1,
      maximum: 100,
      default: 1
    },
    prefix: {
      type: 'string',
      description: '可选前缀'
    }
  },
  required: [],
  examples: [
    { type: 'uuid4' },
    { type: 'short', count: 5 },
    { type: 'timestamp', prefix: 'task_' }
  ],

  async execute(args) {
    const { type = 'uuid4', count = 1, prefix = '' } = args;
    
    if (count < 1 || count > 100) {
      throw new Error('Count must be between 1 and 100');
    }

    const generators = {
      uuid4: () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c == 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      },

      timestamp: () => {
        const now = Date.now();
        const random = Math.random().toString(36).substr(2, 5);
        return `${now}-${random}`;
      },

      short: () => {
        return Math.random().toString(36).substr(2, 8);
      },

      numeric: () => {
        return Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
      },

      hex: () => {
        return crypto.randomBytes(8).toString('hex');
      }
    };

    if (!generators[type]) {
      throw new Error(`Unsupported UUID type: ${type}`);
    }

    const generator = generators[type];
    const results = [];

    for (let i = 0; i < count; i++) {
      const id = generator();
      results.push(prefix + id);
    }

    return {
      type: type,
      count: count,
      prefix: prefix || null,
      ids: results,
      summary: `生成了 ${count} 个 ${type} 类型的标识符`,
      timestamp: new Date().toISOString()
    };
  }
};