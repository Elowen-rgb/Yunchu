// ============================================================
// 询价提醒助手 - 截止时间判断 测试用例
// 运行: node tests/deadline.test.js
// ============================================================

// 为了在 Node.js 中运行，将函数内联
// 实际实现见 src/shared/deadline.js

const STATUS = {
  PENDING: 'pending',
  QUOTED: 'quoted',
  ABANDONED: 'abandoned',
  EXPIRED: 'expired',
};

// ---- parseDate ----
function parseDate(str) {
  if (!str || typeof str !== 'string') return null;
  str = str.trim();

  const todayMatch = str.match(/今天\s*(\d{1,2}:\d{2})/);
  if (todayMatch) return buildDate(new Date(), todayMatch[1]);
  const tomorrowMatch = str.match(/明天\s*(\d{1,2}:\d{2})/);
  if (tomorrowMatch) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return buildDate(d, tomorrowMatch[1]);
  }

  let m = str.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(\d{1,2})\s*时\s*(\d{1,2})\s*分/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);

  m = str.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*[^\d]*(\d{1,2}:\d{2})/);
  if (m) return buildDateFromYMD(+m[1], +m[2] - 1, +m[3], m[4]);

  m = str.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*[^\d]*(\d{1,2}:\d{2})/);
  if (m) return buildDateFromYMD(new Date().getFullYear(), +m[1] - 1, +m[2], m[3]);

  m = str.match(/(\d{4})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{1,2})[\sT]+(\d{1,2}:\d{2})(?::\d{2})?/);
  if (m) return buildDateFromYMD(+m[1], +m[2] - 1, +m[3], m[4]);

  m = str.match(/(\d{4})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59);

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

// ---- Remaining minutes ----
function getRemainingMinutes(deadline, now = new Date()) {
  const dl = typeof deadline === 'string' ? new Date(deadline) : deadline;
  if (!dl || isNaN(dl.getTime())) return Infinity;
  return Math.round((dl.getTime() - now.getTime()) / 60000);
}

function isExpired(deadline, now = new Date()) {
  return getRemainingMinutes(deadline, now) < 0;
}

// ---- shouldNotify ----
function shouldNotify(project, now, reminderConfig) {
  if (!reminderConfig.enabled) return false;
  if (project.status === STATUS.QUOTED || project.status === STATUS.ABANDONED) return false;

  const remaining = getRemainingMinutes(project.deadline, now);

  if (remaining < 0) {
    if (reminderConfig.notifyAfterExpired && !project.expiredNotified) return true;
    return false;
  }
  if (remaining > reminderConfig.startBeforeHours * 60) return false;

  if (!project.lastNotifiedAt) return true;

  const interval = getCurrentInterval(project.deadline, now, reminderConfig);
  if (!interval) return false;

  const lastTime = new Date(project.lastNotifiedAt).getTime();
  const elapsedMinutes = (now.getTime() - lastTime) / 60000;
  return elapsedMinutes >= interval.intervalMinutes - 1;
}

function getCurrentInterval(deadline, now, reminderConfig) {
  const remaining = getRemainingMinutes(deadline, now);
  if (remaining > reminderConfig.startBeforeHours * 60) return null;

  // 从小到大排序：最精确的区间先匹配
  const intervals = [...reminderConfig.intervals].sort(
    (a, b) => (a.withinHours || a.withinMinutes / 60) - (b.withinHours || b.withinMinutes / 60)
  );

  for (const interval of intervals) {
    const threshold = (interval.withinHours || 0) * 60 + (interval.withinMinutes || 0);
    if (remaining >= 0 && remaining <= threshold) {
      return { withinMinutes: threshold, intervalMinutes: interval.intervalMinutes };
    }
  }

  if (remaining < 0 && reminderConfig.notifyAfterExpired) {
    return { withinMinutes: -1, intervalMinutes: Infinity };
  }
  return null;
}

// ============================================================
// 测试运行
// ============================================================
const DEFAULT_CONFIG = {
  enabled: true,
  startBeforeHours: 48,
  intervals: [
    { withinHours: 48, intervalMinutes: 1440 },
    { withinHours: 24, intervalMinutes: 720 },
    { withinHours: 12, intervalMinutes: 360 },
    { withinHours: 6, intervalMinutes: 120 },
    { withinHours: 2, intervalMinutes: 30 },
    { withinMinutes: 30, intervalMinutes: 10 },
  ],
  notifyAfterExpired: true,
};

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed');
}

function assertEquals(a, b, msg) {
  if (a !== b) throw new Error(msg || `expected ${b}, got ${a}`);
}

// ---- 日期解析测试 ----
console.log('\n📅 日期解析测试');
test('标准格式 2026-06-08 17:00', () => {
  const d = parseDate('2026-06-08 17:00');
  assert(d !== null, '应为有效日期');
  assertEquals(d.getFullYear(), 2026);
  assertEquals(d.getMonth(), 5); // 0-based
  assertEquals(d.getDate(), 8);
  assertEquals(d.getHours(), 17);
});

test('中文格式 2026年6月8日 17:00', () => {
  const d = parseDate('2026年6月8日 17:00');
  assert(d !== null, '应为有效日期');
  assertEquals(d.getFullYear(), 2026);
  assertEquals(d.getDate(), 8);
});

test('中文完整格式 2026年06月08日17时30分', () => {
  const d = parseDate('2026年06月08日17时30分');
  assert(d !== null, '应为有效日期');
  assertEquals(d.getMinutes(), 30);
});

test('斜杠格式 2026/06/08 17:00', () => {
  const d = parseDate('2026/06/08 17:00');
  assert(d !== null, '应为有效日期');
  assertEquals(d.getDate(), 8);
});

test('今天 HH:MM', () => {
  const d = parseDate('今天 17:00');
  assert(d !== null, '应为有效日期');
  const today = new Date();
  assertEquals(d.getDate(), today.getDate());
  assertEquals(d.getHours(), 17);
});

test('明天 HH:MM', () => {
  const d = parseDate('明天 17:00');
  assert(d !== null, '应为有效日期');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  assertEquals(d.getDate(), tomorrow.getDate());
});

// ---- 提醒判断测试 ----
console.log('\n🔔 提醒判断测试');

test('距离截止 50 小时：不提醒', () => {
  const deadline = new Date(Date.now() + 50 * 3600000).toISOString();
  const project = { deadline, status: 'pending', lastNotifiedAt: null, expiredNotified: false };
  assert(!shouldNotify(project, new Date(), DEFAULT_CONFIG), '50小时应不提醒');
});

test('距离截止 47 小时：提醒', () => {
  const deadline = new Date(Date.now() + 47 * 3600000).toISOString();
  const project = { deadline, status: 'pending', lastNotifiedAt: null, expiredNotified: false };
  assert(shouldNotify(project, new Date(), DEFAULT_CONFIG), '47小时应提醒');
});

test('距离截止 23 小时，刚刚提醒过：不提醒', () => {
  const deadline = new Date(Date.now() + 23 * 3600000).toISOString();
  const project = {
    deadline, status: 'pending',
    lastNotifiedAt: new Date(Date.now() - 10 * 60000).toISOString(), // 10分钟前刚提醒
    expiredNotified: false, reminderEnabled: true,
  };
  assert(!shouldNotify(project, new Date(), DEFAULT_CONFIG), '刚刚提醒过不应再提醒');
});

test('距离截止 5 小时，2小时前提醒过：提醒', () => {
  const deadline = new Date(Date.now() + 5 * 3600000).toISOString();
  const project = {
    deadline, status: 'pending',
    lastNotifiedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    expiredNotified: false, reminderEnabled: true,
  };
  assert(shouldNotify(project, new Date(), DEFAULT_CONFIG), '超过间隔应提醒');
});

test('已报价项目：不提醒', () => {
  const deadline = new Date(Date.now() + 1 * 3600000).toISOString();
  const project = { deadline, status: 'quoted', lastNotifiedAt: null, expiredNotified: false };
  assert(!shouldNotify(project, new Date(), DEFAULT_CONFIG), '已报价不提醒');
});

test('已放弃项目：不提醒', () => {
  const deadline = new Date(Date.now() + 1 * 3600000).toISOString();
  const project = { deadline, status: 'abandoned', lastNotifiedAt: null, expiredNotified: false };
  assert(!shouldNotify(project, new Date(), DEFAULT_CONFIG), '已放弃不提醒');
});

test('已过期未提醒过：提醒一次', () => {
  const deadline = new Date(Date.now() - 1 * 3600000).toISOString();
  const project = { deadline, status: 'pending', lastNotifiedAt: null, expiredNotified: false };
  assert(shouldNotify(project, new Date(), DEFAULT_CONFIG), '过期未提醒应提醒');
});

test('已过期且 expiredNotified=true：不提醒', () => {
  const deadline = new Date(Date.now() - 1 * 3600000).toISOString();
  const project = { deadline, status: 'pending', lastNotifiedAt: null, expiredNotified: true };
  assert(!shouldNotify(project, new Date(), DEFAULT_CONFIG), '已过期已提醒不应再提醒');
});

test('提醒功能关闭：不提醒', () => {
  const deadline = new Date(Date.now() + 1 * 3600000).toISOString();
  const project = { deadline, status: 'pending', lastNotifiedAt: null, expiredNotified: false };
  const config = { ...DEFAULT_CONFIG, enabled: false };
  assert(!shouldNotify(project, new Date(), config), '功能关闭不提醒');
});

// ---- 结果汇总 ----
console.log(`\n${'='.repeat(40)}`);
console.log(`测试完成: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 项`);
console.log(`${'='.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
