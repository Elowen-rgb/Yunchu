// ============================================================
// 询价提醒助手 - Content Script
// 在当前页面中识别询价条目信息
// 所有依赖内联，确保 MV3 content script 兼容
// ============================================================

// ---- 关键词定义（与 shared/constants.js 同步） ----
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
const DEADLINE_KEYWORDS = [
  '报价截止', '报价截止时间', '报价起止时间', '询价截止', '询价截止时间',
  '投标截止', '投标截止时间', '响应截止', '响应截止时间',
  '报名截止', '截止日期', '截止时间', '开标时间',
];

// ---- 日期解析（与 shared/deadline.js 同步） ----
function parseDate(str) {
  if (!str || typeof str !== 'string') return null;
  str = str.trim();

  // 日期范围 "2026-06-04 15:00~2026-06-08 09:00" → 取结束时间
  const rangeMatch = str.match(/~\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2})/);
  if (rangeMatch) {
    const endDate = parseDate(rangeMatch[1]);
    if (endDate) return endDate;
  }

  // 今天/明天 HH:MM
  const todayMatch = str.match(/今天\s*(\d{1,2}:\d{2})/);
  if (todayMatch) return buildDate(new Date(), todayMatch[1]);
  const tomorrowMatch = str.match(/明天\s*(\d{1,2}:\d{2})/);
  if (tomorrowMatch) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return buildDate(d, tomorrowMatch[1]);
  }

  // XXXX年XX月XX日XX时XX分
  let m = str.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(\d{1,2})\s*时\s*(\d{1,2})\s*分/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);

  // XXXX年X月X日 HH:MM
  m = str.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*[^\d]*(\d{1,2}:\d{2})/);
  if (m) return buildDateFromYMD(+m[1], +m[2] - 1, +m[3], m[4]);

  // MM月DD日 HH:MM（默认当年）
  m = str.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*[^\d]*(\d{1,2}:\d{2})/);
  if (m) return buildDateFromYMD(new Date().getFullYear(), +m[1] - 1, +m[2], m[3]);

  // 2026-06-08 17:00 / 2026/06/08 17:00
  m = str.match(/(\d{4})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{1,2})[\sT]+(\d{1,2}:\d{2})(?::\d{2})?/);
  if (m) return buildDateFromYMD(+m[1], +m[2] - 1, +m[3], m[4]);

  // 纯日期 2026-06-08
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

// ---- 字段提取 ----
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
        if (value && value.length > 0 && value.length < 200) {
          return value;
        }
      }
    }
  }
  return defaultVal;
}

// ---- 页面解析 ----
function parsePage() {
  const bodyText = document.body?.innerText || '';
  const pageTitle = document.title || '';
  const url = window.location.href;
  const source = window.location.hostname;

  const deadlineRaw = extractField(DEADLINE_KEYWORDS, '', bodyText);
  let deadline = null;
  if (deadlineRaw) {
    const parsed = parseDate(deadlineRaw);
    if (parsed && !isNaN(parsed.getTime())) {
      deadline = parsed.toISOString();
    }
  }

  // 截取前 3000 字符用于调试
  const rawTextSample = bodyText.substring(0, 3000);

  return {
    title: extractField(TITLE_KEYWORDS, '未识别询价标题', bodyText),
    publisher: extractField(PUBLISHER_KEYWORDS, '未识别发布人', bodyText),
    inquiryNo: extractField(INQUIRY_NO_KEYWORDS, '未识别询价单号', bodyText),
    deadline,
    deadlineRaw,
    url,
    source,
    pageTitle,
    rawTextSample,
  };
}

// ---- 消息监听 ----
// ---- 表格批量解析 ----
function parseTableRows() {
  const tables = document.querySelectorAll('table');

  // 第一步：找数据表头（至少有5列且包含"询价标题"，排除筛选表单）
  let headers = [];
  for (const t of tables) {
    const ths = t.querySelectorAll('th');
    if (ths.length >= 5) {
      const texts = Array.from(ths).map((th) => th.textContent.trim());
      if (texts.some((h) => h.includes('询价标题') || h.includes('询价单号'))) {
        headers = texts;
        break;
      }
    }
  }
  if (!headers.length) return [];

  const colMap = {
    titleCol: findColIdx(headers, ['询价标题', '采购标题', '标题']),
    pubCol: findColIdx(headers, ['发布人', '采购员', '联系人']),
    noCol: findColIdx(headers, ['询价单号', '询价编号', '单号', '编号']),
    dlCol: findColIdx(headers, ['报价起止时间', '报价截止', '截止时间', '截止日期']),
  };
  if (colMap.titleCol < 0) return [];

  // 全局保存列映射用于调试
  window.__rfqColMap = colMap;
  window.__rfqHeaders = headers;

  // 检查是否数据列数 > 表头列数（欧贝有隐藏RP列），需要偏移
  let colOffset = 0;
  for (const t of tables) {
    for (const row of t.querySelectorAll('tr')) {
      const cells = row.querySelectorAll('td');
      if (cells.length > headers.length && cells.length >= 5) {
        colOffset = cells.length - headers.length;
        break;
      }
    }
    if (colOffset) break;
  }
  window.__rfqColOffset = colOffset;

  // 第二步：遍历所有表格找数据行
  const items = [];
  const seen = new Set();
  for (const t of tables) {
    const rows = t.querySelectorAll('tr');
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 5) continue;

      const get = (c) => (c >= 0 && c < cells.length) ? cells[c].textContent.trim() : '';
      // 应用列偏移
      const tc = colMap.titleCol + colOffset;
      const pc = colMap.pubCol + colOffset;
      const nc = colMap.noCol + colOffset;
      const dc = colMap.dlCol + colOffset;

      const title = get(tc);
      if (!title || headers.includes(title)) continue;

      const inquiryNo = get(nc) || '未识别询价单号';
      const publisher = get(pc) || '未识别发布人';

      const dlRaw = get(dc);
      let deadline = null;
      if (dlRaw) { const p = parseDate(dlRaw); if (p && !isNaN(p.getTime())) deadline = p.toISOString(); }

      // 去重
      const key = `${title}|${inquiryNo}`;
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({
        title, publisher,
        inquiryNo,
        deadline, deadlineRaw: dlRaw,
        url: window.location.href, source: window.location.hostname,
        pageTitle: document.title,
      });
    }
  }

  return items;
}
function findColIdx(headers, names) {
  for (const n of names) { const i = headers.findIndex((h) => h.includes(n)); if (i >= 0) return i; }
  return -1;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'scanPage') {
    const batch = parseTableRows();
    const debug = getDebugInfo();
    if (batch.length > 0) {
      sendResponse({ success: true, data: { ...batch[0], __debug: debug }, batch, isBatch: true });
    } else {
      const single = parsePage();
      single.__debug = debug;
      single.rawTextSample = (document.body?.innerText || '').substring(0, 3000);
      sendResponse({ success: true, data: single });
    }
    return true;
  }

  if (message.action === 'scanAll') {
    const batch = parseTableRows();
    sendResponse({ success: true, batch, count: batch.length });
    return true;
  }

  if (message.action === 'highlightKeywords') {
    highlightKeywords(); sendResponse({ success: true }); return true;
  }
  if (message.action === 'autoFillForm') {
    autoFillPageForm(message.template); sendResponse({ success: true }); return true;
  }
});

// ---- 关键词高亮 ----
function highlightKeywords() {
  const allKeywords = [
    ...TITLE_KEYWORDS, ...PUBLISHER_KEYWORDS,
    ...INQUIRY_NO_KEYWORDS, ...DEADLINE_KEYWORDS,
  ];

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  const textNodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement.tagName === 'SCRIPT') continue;
    if (node.parentElement.tagName === 'STYLE') continue;
    textNodes.push(node);
  }

  for (const node of textNodes) {
    let text = node.textContent;
    let modified = false;
    for (const kw of allKeywords) {
      if (text.includes(kw)) {
        text = text.replace(
          new RegExp(`(${escapeRegex(kw)})`, 'g'),
          '<mark style="background:#fff3cd;border-radius:2px;padding:0 2px;">$1</mark>'
        );
        modified = true;
      }
    }
    if (modified) {
      const span = document.createElement('span');
      span.innerHTML = text;
      node.parentNode.replaceChild(span, node);
    }
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---- 表单自动填充 ----
function autoFillPageForm(template) {
  if (!template) return;
  const inputs = document.querySelectorAll('input[type="text"], input:not([type]), textarea, select');
  const fieldMap = {
    company: ['公司', '供应商', '企业', '单位', 'company'],
    name: ['姓名', '联系人', '经办人', 'name', 'contact'],
    phone: ['电话', '手机', 'phone', 'tel', 'mobile'],
    creditCode: ['信用代码', '统一社会信用代码', '税号', 'credit'],
    address: ['地址', '注册地址', 'address'],
  };
  inputs.forEach((input) => {
    const placeholder = (input.placeholder || '').toLowerCase();
    const inputName = (input.name || '').toLowerCase();
    const label = (input.getAttribute('aria-label') || '').toLowerCase();
    for (const [key, patterns] of Object.entries(fieldMap)) {
      if (template[key] && patterns.some((p) =>
        placeholder.includes(p) || inputName.includes(p) || label.includes(p)
      )) {
        input.value = template[key];
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
}

const CS_VERSION = '2.0-obei';
console.log('[询价提醒 v' + CS_VERSION + '] Content script 已加载');

// 在返回数据中附带版本和调试信息
function getDebugInfo() {
  const tables = document.querySelectorAll('table');
  let tableInfo = [];
  const rawCellRows = [];
  tables.forEach((t, i) => {
    const ths = t.querySelectorAll('th');
    const rows = t.querySelectorAll('tr');
    tableInfo.push(`表${i}: th=${ths.length} tr=${rows.length}`);
    // 收集前3行原始数据
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 4 && rawCellRows.length < 3) {
        rawCellRows.push(Array.from(cells).map((c, ci) => `${ci}:${c.textContent.trim().substring(0,30)}`).join(' | '));
      }
    }
  });
  const cm = window.__rfqColMap || {};
  const hdrs = window.__rfqHeaders || [];
  const colOff = window.__rfqColOffset || 0;
  return {
    version: CS_VERSION,
    tableCount: tables.length,
    tableInfo: tableInfo.join(' | '),
    bodyTextLen: (document.body?.innerText || '').length,
    headers: hdrs.join(', '),
    colMap: `title=${cm.titleCol}→${cm.titleCol+colOff} pub=${cm.pubCol}→${cm.pubCol+colOff} no=${cm.noCol}→${cm.noCol+colOff} dl=${cm.dlCol}→${cm.dlCol+colOff} offset=${colOff}`,
    rawCells: rawCellRows.join('\n'),
  };
}
