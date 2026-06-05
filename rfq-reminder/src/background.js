// ============================================================
// 询价提醒助手 - Background Service Worker
// 定时检查所有项目，触发浏览器通知和微信推送
// ============================================================

import { ALARM_NAME, ALARM_INTERVAL_MINUTES, STATUS } from './shared/constants.js';
import { getProjects, getReminderConfig, getWechatConfig, updateProject } from './shared/storage.js';
import { shouldNotify, isExpired } from './shared/deadline.js';
import { BrowserNotificationAdapter, WeChatPushAdapter } from './shared/notifications.js';

const browserNotify = new BrowserNotificationAdapter();

// ============================================================
// 安装 & 启动
// ============================================================
chrome.runtime.onInstalled.addListener(() => {
  console.log('[询价提醒] 插件已安装');
  startAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  startAlarm();
});

function startAlarm() {
  chrome.alarms.clear(ALARM_NAME, () => {
    chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: ALARM_INTERVAL_MINUTES,
    });
    console.log('[询价提醒] 定时检查已启动，间隔:', ALARM_INTERVAL_MINUTES, '分钟');
  });
}

// ============================================================
// 定时检查 & 触发提醒
// ============================================================
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await checkAndNotify();
});

async function checkAndNotify() {
  const [projects, reminderConfig, wechatConfig] = await Promise.all([
    getProjects(),
    getReminderConfig(),
    getWechatConfig(),
  ]);

  if (!projects.length) return;

  const now = new Date();
  const wechatAdapter = new WeChatPushAdapter(wechatConfig);

  for (const project of projects) {
    const { shouldNotify: notify, reason } = shouldNotify(project, now, reminderConfig);

    if (notify) {
      console.log(`[询价提醒] 触发提醒: ${project.title} (${reason})`);

      // 浏览器通知
      try {
        await browserNotify.send(project, now);
      } catch (e) {
        console.error('[询价提醒] 浏览器通知失败:', e);
      }

      // 微信推送
      try {
        await wechatAdapter.send(project, now);
      } catch (e) {
        console.error('[询价提醒] 微信推送失败:', e);
      }

      // 更新提醒状态
      const updates = { lastNotifiedAt: now.toISOString() };
      if (isExpired(project.deadline, now)) {
        updates.expiredNotified = true;
        updates.status = STATUS.EXPIRED;
      }
      await updateProject(project.id, updates);
    }
  }

  // 自动将过期项目标记为 expired
  for (const project of projects) {
    if (project.status === STATUS.PENDING && isExpired(project.deadline, now) && project.expiredNotified) {
      await updateProject(project.id, { status: STATUS.EXPIRED });
    }
  }
}

// ============================================================
// 消息处理 - 接收 content script 发来的解析结果
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'parseInquiry') {
    // content script 请求 background 解析页面
    handleParseRequest(sender.tab).then(sendResponse);
    return true; // 保持消息通道
  }

  if (message.action === 'saveProject') {
    handleSaveProject(message.project).then(sendResponse);
    return true;
  }
});

async function handleParseRequest(tab) {
  try {
    // activeTab 权限下，注入一个脚本直接读取页面
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.body?.innerText || '',
    });

    const pageText = results[0]?.result || '';
    const pageTitle = tab.title || '';
    const url = tab.url || '';

    // 简单解析（在 background 侧执行）
    // content script 会更精确地解析，这里做备用
    return {
      success: true,
      text: pageText.substring(0, 5000),
      pageTitle,
      url,
      source: new URL(url).hostname,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleSaveProject(project) {
  const { addProject } = await import('./shared/storage.js');
  const result = await addProject(project);
  return { success: true, ...result };
}
