// ============================================================
// 询价提醒助手 - 页面内容解析模块
// ============================================================

import {
  TITLE_KEYWORDS, PUBLISHER_KEYWORDS, INQUIRY_NO_KEYWORDS, DEADLINE_KEYWORDS,
} from './constants.js';
import { parseDate } from './deadline.js';

/**
 * 从当前页面解析询价信息
 * 返回字段：title, publisher, inquiryNo, deadline, url, source, pageTitle
 * @param {Document} document
 * @returns {Object}
 */
export function parseInquiryFromPage(document) {
  const bodyText = document.body?.innerText || '';
  const pageTitle = document.title || '';
  const url = document.location?.href || '';
  const source = document.location?.hostname || '';

  const result = {
    title: extractField(bodyText, TITLE_KEYWORDS, '未识别询价标题'),
    publisher: extractField(bodyText, PUBLISHER_KEYWORDS, '未识别发布人'),
    inquiryNo: extractField(bodyText, INQUIRY_NO_KEYWORDS, '未识别询价单号'),
    deadlineRaw: extractField(bodyText, DEADLINE_KEYWORDS, ''),
    deadline: null,
    url,
    source,
    pageTitle,
  };

  // 解析日期
  if (result.deadlineRaw) {
    const parsed = parseDate(result.deadlineRaw);
    if (parsed && !isNaN(parsed.getTime())) {
      result.deadline = parsed.toISOString();
    }
  }

  return result;
}

/**
 * 从文本中提取字段值
 * 策略：找到关键词后，取同一行或下一行的内容
 * @param {string} text
 * @param {string[]} keywords
 * @param {string} defaultVal
 * @returns {string}
 */
function extractField(text, keywords, defaultVal) {
  if (!text) return defaultVal;

  const lines = text.split(/\n/);

  for (const keyword of keywords) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const idx = line.indexOf(keyword);
      if (idx >= 0) {
        // 取关键词之后的内容
        let value = line.slice(idx + keyword.length).trim();

        // 去掉开头的冒号、空格、制表符等分隔符
        value = value.replace(/^[：:\s\t]+/, '');

        // 如果当前行关键词后没有内容，尝试取下一行
        if (!value || value.length <= 1) {
          if (i + 1 < lines.length) {
            value = lines[i + 1].trim();
          }
        }

        // 常见后缀清理
        value = value.replace(/\s{2,}/g, ' ').trim();

        if (value && value.length > 0 && value.length < 200) {
          return value;
        }
      }
    }

    // 尝试宽松匹配（关键词可能在任意位置）
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(keyword)) {
        const idx = line.indexOf(keyword);
        let value = line.slice(idx + keyword.length).trim();
        value = value.replace(/^[：:\s\t]+/, '');

        if (!value && i + 1 < lines.length) {
          value = lines[i + 1].trim();
        }

        if (value && value.length > 0 && value.length < 200) {
          return value;
        }
      }
    }
  }

  return defaultVal;
}

/**
 * 在页面中查找所有可能的询价条目（供批量识别使用）
 * @param {Document} document
 * @returns {Array<Object>}
 */
export function findAllInquiries(document) {
  // MVP 版本返回单个识别的项目
  // 后续可扩展为批量识别表格行
  const result = parseInquiryFromPage(document);
  return [result];
}
