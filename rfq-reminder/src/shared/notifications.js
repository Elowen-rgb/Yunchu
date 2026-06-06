// ============================================================
// 询价提醒助手 - 通知模块
// ============================================================

import { getRemainingText, isExpired } from './deadline.js';
import { STATUS_LABELS } from './constants.js';

/**
 * 构建提醒消息
 * @param {Object} project
 * @param {Date} [now]
 * @returns {{ title: string, body: string }}
 */
export function buildReminderMessage(project, now = new Date()) {
  const isExp = isExpired(project.deadline, now);
  const remaining = isExp ? '' : getRemainingText(project.deadline, now);
  const statusLabel = STATUS_LABELS[project.status] || '待处理';

  const title = isExp ? '【报价已截止】' : '【报价截止提醒】';

  const parts = [];
  if (!isExp && remaining) parts.push(`剩余时间：${remaining}`);
  parts.push(`询价标题：${project.title}`);
  parts.push(`发布人：${project.publisher}`);
  parts.push(`询价单号：${project.inquiryNo}`);
  parts.push(`截止时间：${formatDeadline(project.deadline)}`);
  parts.push(`当前状态：${isExp ? '已过期但未处理' : statusLabel}`);
  if (project.url) parts.push(`项目链接：${project.url}`);

  const body = parts.join('\n');

  return { title, body };
}

function formatDeadline(deadline) {
  if (!deadline) return '未知';
  const d = new Date(deadline);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ============================================================
// NotificationAdapter 接口
// ============================================================

/**
 * 浏览器通知适配器
 */
export class BrowserNotificationAdapter {
  async send(project, now = new Date()) {
    const { title, body } = buildReminderMessage(project, now);

    await chrome.notifications.create(`rfq_${project.id}_${Date.now()}`, {
      type: 'basic',
      iconUrl: '/icons/icon128.png',
      title,
      message: body.replace(/\n/g, ' · '),
      priority: 2,
      requireInteraction: true,
    });
  }
}

/**
 * WxPusher 推送适配器
 * 通过 WxPusher 公众号模板消息推送到个人微信
 * 文档：https://wxpusher.zjiecode.com/docs/
 */
export class WeChatPushAdapter {
  constructor(config) {
    this.config = config;
  }

  async send(project, now = new Date()) {
    if (!this.config.enabled) return;

    const { title, body } = buildReminderMessage(project, now);

    switch (this.config.serviceType) {
      case 'wxpusher':
        await this._sendViaWxPusher(title, body);
        break;
      case 'serverchan':
        await this._sendViaServerChan(title, body);
        break;
      case 'webhook':
        await this._sendViaWebhook(title, body);
        break;
      default:
        console.warn('[询价提醒] 未知推送服务类型:', this.config.serviceType);
    }
  }

  /**
   * WxPusher 推送
   * 使用原因：WxPusher 是第三方公众号消息推送服务，
   * 通过关注其公众号后获取 UID，再调用 API 向自己推送消息。
   * 这种方式不涉及个人微信号登录、不控制微信客户端、
   * 不抓取微信数据，完全合规。
   */
  async _sendViaWxPusher(title, body) {
    if (!this.config.appToken || !this.config.uid) {
      console.warn('[询价提醒] WxPusher 配置不完整，跳过推送');
      return;
    }

    // 支持多个 UID，用逗号或中英文逗号分隔
    const uids = String(this.config.uid)
      .split(/[,，]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!uids.length) {
      console.warn('[询价提醒] 没有有效的 UID');
      return;
    }

    try {
      const res = await fetch('https://wxpusher.zjiecode.com/api/send/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appToken: this.config.appToken,
          content: `${title}\n\n${body}`,
          contentType: 1,
          uids,
        }),
      });
      const data = await res.json();
      if (data.code !== 1000) {
        console.error('[询价提醒] WxPusher 推送失败:', data.msg);
      } else {
        console.log(`[询价提醒] WxPusher 已推送给 ${uids.length} 位用户`);
      }
    } catch (err) {
      console.error('[询价提醒] WxPusher 请求失败:', err.message);
    }
  }

  /**
   * Server酱 (ServerChan) 推送
   * 通过 Server 酱的 Webhook URL 推送消息到微信。
   * 同样不涉及个人微信号操作，完全合规。
   */
  async _sendViaServerChan(title, body) {
    if (!this.config.sendKey) {
      console.warn('[询价提醒] Server酱 sendKey 未配置，跳过推送');
      return;
    }

    try {
      const res = await fetch(`https://sctapi.ftqq.com/${this.config.sendKey}.send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, desp: body.replace(/\n/g, '\n\n') }),
      });
      const data = await res.json();
      if (data.code !== 0) {
        console.error('[询价提醒] Server酱推送失败:', data.message);
      }
    } catch (err) {
      console.error('[询价提醒] Server酱请求失败:', err.message);
    }
  }

  /**
   * 自定义 Webhook 推送
   */
  async _sendViaWebhook(title, body) {
    if (!this.config.webhookUrl) {
      console.warn('[询价提醒] 自定义 Webhook URL 未配置，跳过推送');
      return;
    }

    try {
      await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, timestamp: new Date().toISOString() }),
      });
    } catch (err) {
      console.error('[询价提醒] Webhook 请求失败:', err.message);
    }
  }
}
