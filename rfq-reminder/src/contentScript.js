// ============================================================
// 询价提醒助手 - Content Script
// 在当前页面中识别询价条目信息
// ============================================================

import {
  TITLE_KEYWORDS, PUBLISHER_KEYWORDS, INQUIRY_NO_KEYWORDS, DEADLINE_KEYWORDS,
} from './shared/constants.js';
import { parseDate } from './shared/deadline.js';

// ============================================================
// 页面解析
// ============================================================

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

  return {
    title: extractField(TITLE_KEYWORDS, '未识别询价标题', bodyText),
    publisher: extractField(PUBLISHER_KEYWORDS, '未识别发布人', bodyText),
    inquiryNo: extractField(INQUIRY_NO_KEYWORDS, '未识别询价单号', bodyText),
    deadline,
    deadlineRaw,
    url,
    source,
    pageTitle,
  };
}

// ============================================================
// 监听来自 popup / background 的消息
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'scanPage') {
    const result = parsePage();
    sendResponse({ success: true, data: result });
    return true;
  }

  if (message.action === 'highlightKeywords') {
    highlightKeywords();
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'autoFillForm') {
    // 接收 background 发来的模板数据，尝试填充当前页面表单
    const template = message.template;
    autoFillPageForm(template);
    sendResponse({ success: true });
    return true;
  }
});

// ============================================================
// 高亮页面中的询价关键词（可选功能）
// ============================================================
function highlightKeywords() {
  const allKeywords = [
    ...TITLE_KEYWORDS, ...PUBLISHER_KEYWORDS,
    ...INQUIRY_NO_KEYWORDS, ...DEADLINE_KEYWORDS,
  ];

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

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

// ============================================================
// 表单自动填充（预留）
// ============================================================
function autoFillPageForm(template) {
  if (!template) return;

  // 遍历页面中的 input/textarea，尝试匹配模板字段
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
    const name = (input.name || '').toLowerCase();
    const label = (input.getAttribute('aria-label') || '').toLowerCase();

    for (const [key, patterns] of Object.entries(fieldMap)) {
      if (template[key] && patterns.some((p) =>
        placeholder.includes(p) || name.includes(p) || label.includes(p)
      )) {
        input.value = template[key];
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
}

console.log('[询价提醒] Content script 已加载');
