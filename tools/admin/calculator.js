module.exports = {
  name: 'calculator',
  description: '执行基本的数学计算',
  parameters: {
    expression: {
      type: 'string',
      description: '要计算的数学表达式，例如：2 + 2, 10 * 5, sqrt(16)'
    }
  },
  required: ['expression'],
  examples: [
    { expression: '2 + 2' },
    { expression: '10 * 5 - 3' },
    { expression: 'sqrt(16) + pow(2, 3)' }
  ],

  async execute(args) {
    const { expression } = args;
    
    if (!expression || typeof expression !== 'string') {
      throw new Error('Missing or invalid expression parameter');
    }

    try {
      // 安全的数学表达式计算
      const sanitizedExpression = expression
        .replace(/[^0-9+\-*/().\s]/g, '') // 基本清理
        .replace(/sqrt\(([^)]+)\)/g, 'Math.sqrt($1)')
        .replace(/pow\(([^,]+),([^)]+)\)/g, 'Math.pow($1,$2)')
        .replace(/sin\(([^)]+)\)/g, 'Math.sin($1)')
        .replace(/cos\(([^)]+)\)/g, 'Math.cos($1)')
        .replace(/tan\(([^)]+)\)/g, 'Math.tan($1)')
        .replace(/log\(([^)]+)\)/g, 'Math.log($1)')
        .replace(/abs\(([^)]+)\)/g, 'Math.abs($1)');

      // 使用Function构造器安全执行
      const result = new Function('Math', `return ${sanitizedExpression}`)(Math);
      
      if (isNaN(result)) {
        throw new Error('计算结果无效');
      }

      return {
        expression: expression,
        result: result,
        formatted: `${expression} = ${result}`
      };
    } catch (error) {
      throw new Error(`计算错误: ${error.message}`);
    }
  }
};