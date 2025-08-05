module.exports = {
  name: 'weather',
  description: '获取指定城市的天气信息（模拟数据）',
  parameters: {
    city: {
      type: 'string',
      description: '城市名称，例如：北京、上海、广州'
    },
    unit: {
      type: 'string',
      description: '温度单位，celsius 或 fahrenheit',
      enum: ['celsius', 'fahrenheit'],
      default: 'celsius'
    }
  },
  required: ['city'],
  examples: [
    { city: '北京' },
    { city: '上海', unit: 'fahrenheit' },
    { city: 'New York', unit: 'celsius' }
  ],

  async execute(args) {
    const { city, unit = 'celsius' } = args;
    
    if (!city || typeof city !== 'string') {
      throw new Error('Missing or invalid city parameter');
    }

    // 模拟天气数据
    const weatherData = {
      '北京': { temp: 15, condition: '晴天', humidity: 45, windSpeed: 8 },
      '上海': { temp: 18, condition: '多云', humidity: 62, windSpeed: 12 },
      '广州': { temp: 25, condition: '阴天', humidity: 78, windSpeed: 6 },
      '深圳': { temp: 26, condition: '小雨', humidity: 82, windSpeed: 10 },
      'New York': { temp: 12, condition: 'Sunny', humidity: 40, windSpeed: 15 },
      'London': { temp: 8, condition: 'Cloudy', humidity: 65, windSpeed: 18 },
      'Tokyo': { temp: 16, condition: 'Partly Cloudy', humidity: 55, windSpeed: 7 }
    };

    const weather = weatherData[city] || {
      temp: Math.floor(Math.random() * 30) + 5,
      condition: ['晴天', '多云', '阴天', '小雨'][Math.floor(Math.random() * 4)],
      humidity: Math.floor(Math.random() * 60) + 40,
      windSpeed: Math.floor(Math.random() * 20) + 5
    };

    // 温度单位转换
    let temperature = weather.temp;
    let tempUnit = '°C';
    
    if (unit === 'fahrenheit') {
      temperature = Math.round((weather.temp * 9/5) + 32);
      tempUnit = '°F';
    }

    const result = {
      city: city,
      temperature: `${temperature}${tempUnit}`,
      condition: weather.condition,
      humidity: `${weather.humidity}%`,
      windSpeed: `${weather.windSpeed} km/h`,
      timestamp: new Date().toISOString(),
      note: '这是模拟天气数据，仅供测试使用'
    };

    return {
      weather: result,
      summary: `${city}的天气：${weather.condition}，温度 ${temperature}${tempUnit}，湿度 ${weather.humidity}%，风速 ${weather.windSpeed} km/h`
    };
  }
};