
export const locales = {
  'zh-CN': {
    common: {
      confirm: '确定',
      cancel: '取消',
      save: '保存',
      clear: '清除',
      today: '今天',
      hour: '小时',
      hours: '小时',
      days: '天',
      remaining: '剩余',
      used: '已使用'
    },
    tabBar: {
      home: '首页',
      calendar: '日历',
      profile: '我的'
    },
    home: {
      today: 'Today',
      question: '今天在哪儿办公呢？',
      homeStatus: '在家办公，享受专注时光 ☕',
      companyStatus: '元气满满，与团队并肩作战 🚀',
      workFromHome: '居家办公',
      workFromCompany: '公司办公',
      hint: '点击或拖动上方选项切换状态'
    },
    calendar: {
      monthlyWio: '月度 WIO',
      ot: 'OT',
      target: '目标',
      warning: '您的WIO百分比低于目标。',
      success: '您已达到WIO目标！',
      legendTitle: '图例',
      legendHint: '点击选择后标记日历',
      clickToClear: '请点击日期清除状态',
      overtime: '加班时长',
      weekdays: ['日', '一', '二', '三', '四', '五', '六'],
      legends: {
        company: '公司办公',
        home: '居家办公',
        vacation: '休年假',
        birthday: '生日假',
        comp_off: '调休',
        sick: '休病假',
        unpaid: '无薪假',
        public: '公共假期',
        overtime_record: '记录加班',
        exclude_wio: '不统计WIO',
        clear: '清除'
      },
      workBadge: '班',
      birthdayLimit: '当月生日假已标记，请先清除',
      birthdayReminderTitle: '生日假提醒',
      birthdayReminderDesc: '本月是您的生日月，别忘了休生日假哦！',
      markToday: '立即标记',
      clickDateToMark: '请点击日期标记生日假',
      legendTip: '双击日期可清除标记'
    },
    profile: {
      wioTarget: '🎯 WIO 目标',
      wioTargetDesc: '设置您每月期望在公司办公的时间比例。',
      vacationDays: '🏖️ 年假额度',
      sickDays: '💊 病假额度',
      birthdayLeave: '🎂 生日假',
      birthdayLeaveDesc: '公司福利 · 生日当月可享一天假期',
      birthdayLeavePlaceholder: '请选择月份',
      birthdayMonthLabel: '生日月份',
      birthdayEnableHint: '点击开启生日福利',
      compOffSettings: '📅 调休配置',
      compOffHint: '点击卡片切换状态 (蓝色表示补班算工作日)',
      noCompOff: '无补班',
      noHoliday: '本年度无节日安排',
      saved: '已保存',
      language: '🌍 语言',
      languageDesc: '切换语言'
    }
  },
  'en-US': {
    common: {
      confirm: 'Confirm',
      cancel: 'Cancel',
      save: 'Save',
      clear: 'Clear',
      today: 'Today',
      hour: 'hour',
      hours: 'hours',
      days: 'days',
      remaining: 'Remaining',
      used: 'Used'
    },
    tabBar: {
      home: 'Home',
      calendar: 'Calendar',
      profile: 'Profile'
    },
    home: {
      today: 'Today',
      question: 'Where are you working today?',
      homeStatus: 'Working from home, enjoy focused time ☕',
      companyStatus: 'Full of energy, working with the team 🚀',
      workFromHome: 'Work from Home',
      workFromCompany: 'Work from Office',
      hint: 'Tap or drag above to switch status'
    },
    calendar: {
      monthlyWio: 'Monthly WIO',
      ot: 'OT',
      target: 'Target',
      warning: 'Your WIO percentage is below target.',
      success: 'You have reached your WIO target!',
      legendTitle: 'Legend',
      legendHint: 'Tap to select and mark calendar',
      clickToClear: 'Please tap a date to clear status',
      overtime: 'Overtime Hours',
      weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      legends: {
        company: 'Off',
        home: 'Home',
        vacation: 'Vacation',
        birthday: 'Birthday',
        comp_off: 'Comp Off',
        sick: 'Sick Leave',
        unpaid: 'Unpaid Leave',
        public: 'Public Holiday',
        overtime_record: 'Record OT',
        exclude_wio: 'Exclude WIO',
        clear: 'Clear'
      },
      workBadge: 'Work',
      birthdayLimit: 'Birthday leave already marked, please clear first',
      birthdayReminderTitle: 'Birthday Reminder',
      birthdayReminderDesc: "It's your birthday month! Don't forget to take your birthday leave!",
      markToday: 'Mark Now',
      clickDateToMark: 'Click a date to mark birthday leave',
      legendTip: 'Double-tap to clear'
    },
    profile: {
      wioTarget: '🎯 WIO Target',
      wioTargetDesc: 'Set your desired monthly office work percentage.',
      vacationDays: '🏖️ Vacation Days',
      sickDays: '💊 Sick Days',
      birthdayLeave: '🎂 Birthday Leave',
      birthdayLeaveDesc: 'Company Benefit · One day off in your birthday month',
      birthdayLeavePlaceholder: 'Select month',
      birthdayMonthLabel: 'Birthday Month',
      birthdayEnableHint: 'Tap to enable benefit',
      compOffSettings: '📅 Compensatory Off Settings',
      compOffHint: 'Tap cards to toggle (blue means count as workday)',
      noCompOff: 'No Comp Off',
      noHoliday: 'No holidays this year',
      saved: 'Saved',
      language: '🌍 Language',
      languageDesc: 'Switch language'
    }
  }
};

export function t(key, lang = 'zh-CN') {
  const keys = key.split('.');
  let result = locales[lang];
  for (const k of keys) {
    if (result && result[k]) {
      result = result[k];
    } else {
      return key;
    }
  }
  return result;
}

export function getMonthName(month, lang = 'zh-CN') {
  if (lang === 'zh-CN') {
    return `${month}月`;
  }
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                 'July', 'August', 'September', 'October', 'November', 'December'];
  return months[month - 1];
}

export function getWeekdayName(day, lang = 'zh-CN') {
  const weekdays = lang === 'zh-CN' 
    ? ['日', '一', '二', '三', '四', '五', '六']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return weekdays[day];
}
