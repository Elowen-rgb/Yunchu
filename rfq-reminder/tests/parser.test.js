// ============================================================
// 询价提醒助手 - 页面解析 测试用例
// 运行: node tests/parser.test.js
// ============================================================

// 解析函数内联（与 contentScript.js 同步）
const TITLE_KEYWORDS = [
  '询价标题', '标题', '询价名称', '询价项目', '项目名称',
  '采购标题', '采购项目', '物资名称', '标的物', '采购内容',
];
const PUBLISHER_KEYWORDS = [
  '发布人', '采购员', '采购联系人', '联系人', '经办人',
  '采购负责人', '业务联系人', '项目联系人',
];
const INQUIRY_NO_KEYWORDS = [
  '询价单号', '询价编号', '询价书编号', 'RFQ编号', 'RFQ No',
  '单据编号', '单号', '项目编号', '采购编号', '招标编号', 'RFQ',
];

function extractField(keywords, defaultVal, text) {
  if (!text) return defaultVal;
  const lines = text.split(/\n/);
  for (const keyword of keywords) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const idx = line.indexOf(keyword);
      if (idx >= 0) {
        let value = line.slice(idx + keyword.length).trim();
        value = value.replace(/^[：:\s\t]+/, '');
        if ((!value || value.length <= 1) && i + 1 < lines.length) {
          value = lines[i + 1].trim();
        }
        value = value.replace(/\s{2,}/g, ' ').trim();
        if (value && value.length > 0 && value.length < 200) return value;
      }
    }
  }
  return defaultVal;
}

// ============================================================
// 测试
// ============================================================
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
  if (a !== b) throw new Error(msg || `expected "${b}", got "${a}"`);
}

console.log('\n📝 字段提取测试');

test('提取询价标题 - 标准格式', () => {
  const text = '询价标题：2026年度办公耗材采购\n发布人：张三';
  assertEquals(extractField(TITLE_KEYWORDS, '未识别', text), '2026年度办公耗材采购');
});

test('提取发布人 - 采购员关键词', () => {
  const text = '采购员：李四\n询价单号：RFQ001';
  assertEquals(extractField(PUBLISHER_KEYWORDS, '未识别', text), '李四');
});

test('提取询价单号 - RFQ格式', () => {
  const text = 'RFQ编号：RFQ20260608001\n截止时间：2026-06-08';
  assertEquals(extractField(INQUIRY_NO_KEYWORDS, '未识别', text), 'RFQ20260608001');
});

test('提取询价单号 - 项目编号格式', () => {
  const text = '项目编号：CG2026-0789\n采购标题：钢材采购';
  assertEquals(extractField(INQUIRY_NO_KEYWORDS, '未识别', text), 'CG2026-0789');
});

test('字段未找到时返回默认值', () => {
  const text = '本页面与采购无关';
  assertEquals(extractField(TITLE_KEYWORDS, '未识别询价标题', text), '未识别询价标题');
});

test('关键词带冒号（全角）', () => {
  const text = '采购标题：钢材采购（Q235B）\n经办人：王五';
  assertEquals(extractField(TITLE_KEYWORDS, '未识别', text), '钢材采购（Q235B）');
});

test('提取采购联系人', () => {
  const text = '采购联系人：赵六\n电话：13800000000';
  assertEquals(extractField(PUBLISHER_KEYWORDS, '未识别', text), '赵六');
});

test('提取招标编号', () => {
  const text = '招标编号：ZB2026/001\n开标时间：2026/07/15';
  assertEquals(extractField(INQUIRY_NO_KEYWORDS, '未识别', text), 'ZB2026/001');
});

test('提取经办人', () => {
  const text = '经办人：钱七\n部门：采购部';
  assertEquals(extractField(PUBLISHER_KEYWORDS, '未识别', text), '钱七');
});

test('提取物资名称', () => {
  const text = '物资名称：热轧钢板 Q235B\n规格：10mm*2000mm';
  assertEquals(extractField(TITLE_KEYWORDS, '未识别', text), '热轧钢板 Q235B');
});

console.log(`\n${'='.repeat(40)}`);
console.log(`测试完成: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 项`);
console.log(`${'='.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
