module.exports = {
  name: 'exercise-muscles',
  description: '根据输入的健身动作，返回该动作主要训练的肌肉群',
  parameters: {
    exercise: {
      type: 'string',
      description: '健身动作名称，例如：引体向上、深蹲、硬拉等'
    }
  },
  required: ['exercise'],
  examples: [
    { exercise: '引体向上' },
    { exercise: 'Pull-ups' },
    { exercise: '硬拉' },
    { exercise: 'Deadlifts' }
  ],

  async execute(args) {
    const { exercise } = args;
    
    if (!exercise || typeof exercise !== 'string') {
      throw new Error('Missing or invalid exercise parameter');
    }

    // 健身动作与肌肉群的映射表
    const exerciseMuscleMap = {
      // 引体向上类
      '引体向上': ['背阔肌', '斜方肌', '肱二头肌', '前臂肌群'],
      'pull-ups': ['背阔肌', '斜方肌', '肱二头肌', '前臂肌群'],
      'pullups': ['背阔肌', '斜方肌', '肱二头肌', '前臂肌群'],
      '反手引体向上': ['背阔肌', '肱二头肌', '斜方肌', '前臂肌群'],
      'chin-ups': ['背阔肌', '肱二头肌', '斜方肌', '前臂肌群'],
      'chinups': ['背阔肌', '肱二头肌', '斜方肌', '前臂肌群'],

      // 硬拉类
      '硬拉': ['股二头肌', '臀大肌', '背阔肌', '斜方肌', '竖脊肌'],
      'deadlifts': ['股二头肌', '臀大肌', '背阔肌', '斜方肌', '竖脊肌'],
      'deadlift': ['股二头肌', '臀大肌', '背阔肌', '斜方肌', '竖脊肌'],
      '相扑硬拉': ['股二头肌', '臀大肌', '股四头肌', '内收肌群'],
      'sumo deadlift': ['股二头肌', '臀大肌', '股四头肌', '内收肌群'],

      // 深蹲类
      '深蹲': ['股四头肌', '臀大肌', '股二头肌', '小腿肌群'],
      'squats': ['股四头肌', '臀大肌', '股二头肌', '小腿肌群'],
      'squat': ['股四头肌', '臀大肌', '股二头肌', '小腿肌群'],
      '前蹲': ['股四头肌', '臀大肌', '核心肌群', '上背肌群'],
      'front squat': ['股四头肌', '臀大肌', '核心肌群', '上背肌群'],

      // 卧推类
      '卧推': ['胸大肌', '三角肌前束', '肱三头肌'],
      'bench press': ['胸大肌', '三角肌前束', '肱三头肌'],
      '上斜卧推': ['胸大肌上部', '三角肌前束', '肱三头肌'],
      'incline bench press': ['胸大肌上部', '三角肌前束', '肱三头肌'],
      '下斜卧推': ['胸大肌下部', '三角肌前束', '肱三头肌'],
      'decline bench press': ['胸大肌下部', '三角肌前束', '肱三头肌'],

      // 俯卧撑类
      '俯卧撑': ['胸大肌', '三角肌前束', '肱三头肌', '核心肌群'],
      'push-ups': ['胸大肌', '三角肌前束', '肱三头肌', '核心肌群'],
      'pushups': ['胸大肌', '三角肌前束', '肱三头肌', '核心肌群'],
      'push ups': ['胸大肌', '三角肌前束', '肱三头肌', '核心肌群'],

      // 肩部动作
      '推举': ['三角肌', '肱三头肌', '斜方肌上束'],
      'overhead press': ['三角肌', '肱三头肌', '斜方肌上束'],
      'shoulder press': ['三角肌', '肱三头肌', '斜方肌上束'],
      '侧平举': ['三角肌中束'],
      'lateral raises': ['三角肌中束'],
      '前平举': ['三角肌前束'],
      'front raises': ['三角肌前束'],

      // 背部动作
      '划船': ['背阔肌', '斜方肌', '后三角肌', '肱二头肌'],
      'rows': ['背阔肌', '斜方肌', '后三角肌', '肱二头肌'],
      'rowing': ['背阔肌', '斜方肌', '后三角肌', '肱二头肌'],
      '杠铃划船': ['背阔肌', '斜方肌', '后三角肌', '肱二头肌'],
      'barbell rows': ['背阔肌', '斜方肌', '后三角肌', '肱二头肌'],

      // 腿部动作
      '弓步': ['股四头肌', '臀大肌', '股二头肌'],
      'lunges': ['股四头肌', '臀大肌', '股二头肌'],
      'lunge': ['股四头肌', '臀大肌', '股二头肌'],
      '腿举': ['股四头肌', '臀大肌'],
      'leg press': ['股四头肌', '臀大肌'],

      // 核心动作
      '平板支撑': ['核心肌群', '肩部稳定肌群'],
      'plank': ['核心肌群', '肩部稳定肌群'],
      '仰卧起坐': ['腹直肌', '腹斜肌'],
      'sit-ups': ['腹直肌', '腹斜肌'],
      'situps': ['腹直肌', '腹斜肌'],
      '卷腹': ['腹直肌'],
      'crunches': ['腹直肌'],

      // 手臂动作
      '二头弯举': ['肱二头肌', '前臂肌群'],
      'bicep curls': ['肱二头肌', '前臂肌群'],
      'biceps curls': ['肱二头肌', '前臂肌群'],
      '臂屈伸': ['肱三头肌'],
      'tricep dips': ['肱三头肌'],
      'triceps dips': ['肱三头肌']
    };

    // 标准化输入（转为小写）
    const normalizedExercise = exercise.toLowerCase().trim();
    
    // 查找匹配的动作
    let muscles = null;
    let matchedExercise = null;

    // 精确匹配
    if (exerciseMuscleMap[normalizedExercise]) {
      muscles = exerciseMuscleMap[normalizedExercise];
      matchedExercise = normalizedExercise;
    } else {
      // 模糊匹配
      for (const [key, value] of Object.entries(exerciseMuscleMap)) {
        if (key.includes(normalizedExercise) || normalizedExercise.includes(key)) {
          muscles = value;
          matchedExercise = key;
          break;
        }
      }
    }

    if (!muscles) {
      return {
        exercise: exercise,
        muscles: [],
        found: false,
        message: `未找到动作 "${exercise}" 对应的肌肉群信息。请尝试使用更常见的动作名称，如：引体向上、深蹲、硬拉、卧推等。`
      };
    }

    const result = {
      exercise: exercise,
      matchedExercise: matchedExercise,
      muscles: muscles,
      found: true,
      summary: `${exercise}: ${muscles.join('、')}`
    };

    return result;
  }
};