// 情绪价值文案配置
export const motivationQuotes = {
  'zh-CN': {
    home: [
      '在家办公，享受专注时光 ☕',
      '无需通勤，把时间留给生活 🌿',
      '舒适的家，是灵感的温床 💡',
      '睡衣也能是战斗服，效率满分 💯',
      '一杯咖啡，一只猫，工作也能很惬意 🐱',
      '自由掌控节奏，让工作融入生活 🎵'
    ],
    company: [
      '元气满满，与团队并肩作战 🚀',
      '高效沟通，面对面碰撞火花 ✨',
      '专注当下，创造更多可能 💪',
      '今天的努力，是未来的基石 🧱',
      '与优秀的伙伴同行，走得更远 🤝',
      '不仅是工作，更是成长的旅程 🌟'
    ],
    default: [
      '今天在哪儿办公呢？',
      '记录今天的工作足迹 🐾',
      '又是充满希望的一天 ☀️'
    ]
  },
  'en-US': {
    home: [
      'Enjoy focused time at home ☕',
      'No commute, more life time 🌿',
      'Home is where inspiration lives 💡',
      'Pajamas = productivity mode 💯',
      'Coffee, cat, and cozy work 🐱',
      'Your pace, your life 🎵'
    ],
    company: [
      'Team power, full energy 🚀',
      'Face-to-face sparks fly ✨',
      'Focus now, achieve more 💪',
      "Today's effort, tomorrow's gain 🧱",
      'Great team, greater journey 🤝',
      'Grow through what you do 🌟'
    ],
    default: [
      'Where to work today?',
      'Record your work day 🐾',
      'A day full of hope ☀️'
    ]
  }
};

// 随机获取一条文案
export const getRandomQuote = (type, lang = 'zh-CN') => {
  const quotes = motivationQuotes[lang]?.[type] || motivationQuotes[lang]?.default || motivationQuotes['zh-CN'][type] || motivationQuotes['zh-CN'].default;
  const randomIndex = Math.floor(Math.random() * quotes.length);
  return quotes[randomIndex];
};
