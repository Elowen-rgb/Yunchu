// ============================================================
// 询价提醒助手 - 截止时间判断模块
// ============================================================

import { STATUS } from './constants.js';

/**
 * 解析各种格式的日期字符串
 * 支持: 2026-06-08 17:00 / 2026/06/08 17:00 / 2026年6月8日 17:00
 *       2026年06月08日17时00分 / 06月08日 17:00(默认当年) / 今天 17:00 / 明天 17:00
 * @param {string} str
 * @returns {Date|null}
 */
export function parseDate(str) {
  if (!str || typeof str !== 'string') return null;
  str = str.trim();

  // 日期范围 "2026-06-04 15:00~ 2026-06-08 09:00" → 取结束时间
  const rangeMatch = str.match(/~.*?(\d{4}[-/]\d{1,2}[-/]\d{1,2}[\sT]+\d{1,2}:\d{2})/);
  if (rangeMatch) return parseDate(rangeMatch[1]);

  // 处理"今天 HH:MM" / "明天 HH:MM"
  const todayMatch = str.match(/今天\s*(\d{1,2}:\d{2})/);
  if (todayMatch) {
    return buildDate(new Date(), todayMatch[1]);
  }
  const tomorrowMatch = str.match(/明天\s*(\d{1,2}:\d{2})/);
  if (tomorrowMatch) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return buildDate(d, tomorrowMatch[1]);
  }

  // 2026年06月08日17时00分
  let m = str.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(\d{1,2})\s*时\s*(\d{1,2})\s*分/);
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  }

  // 2026年6月8日 17:00
  m = str.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(\d{1,2}:\d{2})/);
  if (m) {
    return buildDateFromYMD(+m[1], +m[2] - 1, +m[3], m[4]);
  }

  // 06月08日 17:00（默认当前年份）
  m = str.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(\d{1,2}:\d{2})/);
  if (m) {
    return buildDateFromYMD(new Date().getFullYear(), +m[1] - 1, +m[2], m[3]);
  }

  // 2026-06-08 17:00 / 2026-06-08T17:00
  m = str.match(/(\d{4})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{1,2})[\sT]+(\d{1,2}:\d{2})(?::\d{2})?/);
  if (m) {
    return buildDateFromYMD(+m[1], +m[2] - 1, +m[3], m[4]);
  }

  // 2026/06/08 17:00
  m = str.match(/(\d{4})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})\s+(\d{1,2}:\d{2})/);
  if (m) {
    return buildDateFromYMD(+m[1], +m[2] - 1, +m[3], m[4]);
  }

  // 纯日期 2026-06-08 (默认 23:59:59)
  m = str.match(/(\d{4})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{1,2})$/);
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59);
  }

  return null;
}

function buildDate(date, timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  date.setHours(h, m, 0, 0);
  return new Date(date);
}

function buildDateFromYMD(year, month, day, timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return new Date(year, month, day, h, m, 0);
}

/**
 * 计算剩余时间（分钟）
 * @param {string|Date} deadline
 * @param {Date} [now]
 * @returns {number} 负数表示已过期
 */
export function getRemainingMinutes(deadline, now = new Date()) {
  const dl = typeof deadline === 'string' ? new Date(deadline) : deadline;
  if (!dl || isNaN(dl.getTime())) return Infinity;
  return Math.round((dl.getTime() - now.getTime()) / 60000);
}

/**
 * 计算剩余时间可读文本
 * @param {string|Date} deadline
 * @param {Date} [now]
 * @returns {string}
 */
export function getRemainingText(deadline, now = new Date()) {
  const mins = getRemainingMinutes(deadline, now);
  if (mins < -1440) return `已过期 ${Math.floor(-mins / 1440)} 天`;
  if (mins < -60) return `已过期 ${Math.floor(-mins / 60)} 小时`;
  if (mins < 0) return `已过期 ${Math.abs(mins)} 分钟`;
  if (mins < 60) return `${mins} 分钟`;
  if (mins < 1440) return `${Math.floor(mins / 60)} 小时 ${mins % 60} 分钟`;
  return `${Math.floor(mins / 1440)} 天 ${Math.floor((mins % 1440) / 60)} 小时`;
}

/**
 * 判断项目是否已过期
 * @param {string|Date} deadline
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isExpired(deadline, now = new Date()) {
  return getRemainingMinutes(deadline, now) < 0;
}

/**
 * 判断项目是否今天到期
 * @param {string|Date} deadline
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isDueToday(deadline, now = new Date()) {
  const dl = typeof deadline === 'string' ? new Date(deadline) : deadline;
  return dl.toDateString() === now.toDateString();
}

/**
 * 获取当前剩余时间所在的提醒区间
 * @param {string|Date} deadline
 * @param {Date} now
 * @param {Object} reminderConfig
 * @returns {{ withinMinutes: number, intervalMinutes: number }|null}
 */
export function getCurrentInterval(deadline, now, reminderConfig) {
  const remaining = getRemainingMinutes(deadline, now);
  if (remaining > reminderConfig.startBeforeHours * 60) return null;

  // 从小到大排序：最精确的区间先匹配
  const intervals = [...reminderConfig.intervals].sort(
    (a, b) => (a.withinHours || a.withinMinutes / 60) - (b.withinHours || b.withinMinutes / 60)
  );

  for (const interval of intervals) {
    const threshold = (interval.withinHours || 0) * 60 + (interval.withinMinutes || 0);
    if (remaining >= 0 && remaining <= threshold) {
      return {
        withinMinutes: threshold,
        intervalMinutes: interval.intervalMinutes,
      };
    }
  }

  // 已过期
  if (remaining < 0 && reminderConfig.notifyAfterExpired) {
    return { withinMinutes: -1, intervalMinutes: Infinity };
  }

  return null;
}

/**
 * 判断是否应该提醒
 * @param {Object} project
 * @param {Date} now
 * @param {Object} reminderConfig
 * @returns {{ shouldNotify: boolean, reason?: string }}
 */
export function shouldNotify(project, now, reminderConfig) {
  // 1. 功能未启用
  if (!reminderConfig.enabled) {
    return { shouldNotify: false, reason: '提醒功能未启用' };
  }

  // 2. 已报价或已放弃
  if (project.status === STATUS.QUOTED || project.status === STATUS.ABANDONED) {
    return { shouldNotify: false, reason: `项目已${project.status === STATUS.QUOTED ? '报价' : '放弃'}` };
  }

  const remaining = getRemainingMinutes(project.deadline, now);

  // 3. 已过期处理
  if (remaining < 0) {
    if (reminderConfig.notifyAfterExpired && !project.expiredNotified) {
      return { shouldNotify: true, reason: '已过期，首次提醒' };
    }
    return { shouldNotify: false, reason: '已过期且已提醒过' };
  }

  // 4. 距离截止时间大于 startBeforeHours，不提醒
  if (remaining > reminderConfig.startBeforeHours * 60) {
    return { shouldNotify: false, reason: `距离截止还有 ${Math.round(remaining / 60)} 小时，超过提醒阈值` };
  }

  // 5. 找到当前剩余时间对应的提醒间隔
  const interval = getCurrentInterval(project.deadline, now, reminderConfig);
  if (!interval) {
    return { shouldNotify: false, reason: '不在任何提醒区间' };
  }

  // 6. 从未提醒过
  if (!project.lastNotifiedAt) {
    return { shouldNotify: true, reason: '首次提醒' };
  }

  // 7. 检查间隔
  const lastTime = new Date(project.lastNotifiedAt).getTime();
  const elapsedMinutes = (now.getTime() - lastTime) / 60000;
  if (elapsedMinutes >= interval.intervalMinutes - 1) { // 1分钟容差
    return { shouldNotify: true, reason: `距离上次提醒 ${Math.round(elapsedMinutes)} 分钟，超过间隔 ${interval.intervalMinutes} 分钟` };
  }

  return { shouldNotify: false, reason: '未到下次提醒时间' };
}

/**
 * 按紧急程度排序
 * @param {Array} projects
 * @param {Date} [now]
 * @returns {Array}
 */
export function sortByUrgency(projects, now = new Date()) {
  return [...projects].sort((a, b) => {
    const ra = getRemainingMinutes(a.deadline, now);
    const rb = getRemainingMinutes(b.deadline, now);

    // 已过期未处理排最前
    const aExpiredUnresolved = ra < 0 && a.status === STATUS.PENDING;
    const bExpiredUnresolved = rb < 0 && b.status === STATUS.PENDING;
    if (aExpiredUnresolved && !bExpiredUnresolved) return -1;
    if (!aExpiredUnresolved && bExpiredUnresolved) return 1;

    // 按剩余时间升序
    return ra - rb;
  });
}
