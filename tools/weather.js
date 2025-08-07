const axios = require('axios');

module.exports = {
  name: 'weather',
  description: '获取指定城市的实时天气信息',
  parameters: {
    city: {
      type: 'string',
      description: '城市名称或高德地图的adcode，例如：北京、上海、330100'
    }
  },
  required: ['city'],
  examples: [
    { city: '北京' },
    { city: '330100' } // 杭州市的adcode
  ],

  async execute(args) {
    const { city } = args;
    const apiKey = process.env.WEATHER_API_KEY;

    if (!apiKey) {
      throw new Error('Missing WEATHER_API_KEY in .env file');
    }
    
    if (!city || typeof city !== 'string') {
      throw new Error('Missing or invalid city parameter');
    }

    const url = `https://restapi.amap.com/v3/weather/weatherInfo`;

    try {
      const response = await axios.get(url, {
        params: {
          city: city,
          key: apiKey,
          extensions: 'base' // 获取实时天气
        }
      });

      if (response.data.status !== '1' || response.data.infocode !== '10000') {
        // https://lbs.amap.com/api/webservice/guide/tools/info
        throw new Error(`高德地图API返回错误: ${response.data.info} (infocode: ${response.data.infocode})`);
      }

      if (!response.data.lives || response.data.lives.length === 0) {
        throw new Error(`无法找到城市 "${city}" 的天气信息。`);
      }

      const weather = response.data.lives[0]; // Corrected line

      const result = {
        province: weather.province,
        city: weather.city,
        weather: weather.weather,
        temperature: `${weather.temperature}°C`,
        windDirection: weather.winddirection,
        windPower: `${weather.windpower}级`,
        humidity: `${weather.humidity}%`,
        reportTime: weather.reporttime,
      };

      return {
        weather: result,
        summary: `${result.city}的天气：${result.weather}，温度 ${result.temperature}，${result.windDirection}风${result.windPower}，湿度 ${result.humidity}。`
      };

    } catch (error) {
      // 区分是axios错误还是API逻辑错误
      if (error.response) {
        // 请求已发出，但服务器响应的状态码超出了 2xx 范围
        console.error('Error fetching weather data (response):', error.response.data);
        throw new Error(`天气服务API请求失败: ${error.response.status} ${error.response.statusText}`);
      } else if (error.request) {
        // 请求已发出，但没有收到任何响应
        console.error('Error fetching weather data (request):', error.request);
        throw new Error('天气服务无响应，请检查网络连接。');
      } else {
        // 在设置请求时触发了一个错误
        console.error('Error fetching weather data (setup):', error.message);
        throw error; // 抛出原始错误，可能是API逻辑错误或代码错误
      }
    }
  }
};