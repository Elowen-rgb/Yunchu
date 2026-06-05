// ============================================================
// 询价提醒助手 - Options 脚本
// ============================================================

import {
  getReminderConfig, saveReminderConfig,
  getWechatConfig, saveWechatConfig,
  exportData, clearAllData,
} from '../shared/storage.js';
import { WeChatPushAdapter } from '../shared/notifications.js';

// ============================================================
// 加载配置
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  await loadConfigs();
  setupEventListeners();
});

async function loadConfigs() {
  const [reminderConfig, wechatConfig] = await Promise.all([
    getReminderConfig(), getWechatConfig(),
  ]);

  // 提醒配置
  document.getElementById('reminderEnabled').checked = reminderConfig.enabled;
  document.getElementById('startBeforeHours').value = reminderConfig.startBeforeHours;
  document.getElementById('notifyAfterExpired').checked = reminderConfig.notifyAfterExpired;

  const intervals = reminderConfig.intervals || [];
  const intMap = {};
  intervals.forEach((i) => {
    if (i.withinHours) intMap[i.withinHours] = i.intervalMinutes;
    if (i.withinMinutes === 30) intMap[0.5] = i.intervalMinutes;
  });

  document.getElementById('int48h').value = intMap[48] || 1440;
  document.getElementById('int24h').value = intMap[24] || 720;
  document.getElementById('int12h').value = intMap[12] || 360;
  document.getElementById('int6h').value = intMap[6] || 120;
  document.getElementById('int2h').value = intMap[2] || 30;
  document.getElementById('int30m').value = intMap[0.5] || 10;

  // 微信配置
  document.getElementById('wechatEnabled').checked = wechatConfig.enabled;
  document.getElementById('serviceType').value = wechatConfig.serviceType || 'wxpusher';
  document.getElementById('appToken').value = wechatConfig.appToken || '';
  document.getElementById('uid').value = wechatConfig.uid || '';
  document.getElementById('sendKey').value = wechatConfig.sendKey || '';
  document.getElementById('webhookUrl').value = wechatConfig.webhookUrl || '';

  updateServiceFields();
}

// ============================================================
// 事件
// ============================================================
function setupEventListeners() {
  document.getElementById('serviceType').addEventListener('change', updateServiceFields);

  document.getElementById('saveAll').addEventListener('click', saveAllConfigs);
  document.getElementById('testWechat').addEventListener('click', testWechatPush);
  document.getElementById('exportData').addEventListener('click', handleExport);
  document.getElementById('clearData').addEventListener('click', handleClear);
}

function updateServiceFields() {
  const type = document.getElementById('serviceType').value;
  document.getElementById('wxpusherFields').style.display = type === 'wxpusher' ? '' : 'none';
  document.getElementById('serverchanFields').style.display = type === 'serverchan' ? '' : 'none';
  document.getElementById('webhookFields').style.display = type === 'webhook' ? '' : 'none';
}

// ============================================================
// 保存
// ============================================================
async function saveAllConfigs() {
  const reminderConfig = {
    enabled: document.getElementById('reminderEnabled').checked,
    startBeforeHours: parseInt(document.getElementById('startBeforeHours').value) || 48,
    intervals: [
      { withinHours: 48, intervalMinutes: parseInt(document.getElementById('int48h').value) || 1440 },
      { withinHours: 24, intervalMinutes: parseInt(document.getElementById('int24h').value) || 720 },
      { withinHours: 12, intervalMinutes: parseInt(document.getElementById('int12h').value) || 360 },
      { withinHours: 6, intervalMinutes: parseInt(document.getElementById('int6h').value) || 120 },
      { withinHours: 2, intervalMinutes: parseInt(document.getElementById('int2h').value) || 30 },
      { withinMinutes: 30, intervalMinutes: parseInt(document.getElementById('int30m').value) || 10 },
    ],
    notifyAfterExpired: document.getElementById('notifyAfterExpired').checked,
  };

  const wechatConfig = {
    enabled: document.getElementById('wechatEnabled').checked,
    serviceType: document.getElementById('serviceType').value,
    appToken: document.getElementById('appToken').value.trim(),
    uid: document.getElementById('uid').value.trim(),
    sendKey: document.getElementById('sendKey').value.trim(),
    webhookUrl: document.getElementById('webhookUrl').value.trim(),
  };

  await Promise.all([
    saveReminderConfig(reminderConfig),
    saveWechatConfig(wechatConfig),
  ]);

  const status = document.getElementById('saveStatus');
  status.textContent = '✅ 已保存';
  setTimeout(() => { status.textContent = ''; }, 2000);
}

// ============================================================
// 测试微信推送
// ============================================================
async function testWechatPush() {
  const config = {
    enabled: true,
    serviceType: document.getElementById('serviceType').value,
    appToken: document.getElementById('appToken').value.trim(),
    uid: document.getElementById('uid').value.trim(),
    sendKey: document.getElementById('sendKey').value.trim(),
    webhookUrl: document.getElementById('webhookUrl').value.trim(),
  };

  const adapter = new WeChatPushAdapter(config);
  const testProject = {
    title: '【测试消息】询价提醒助手',
    publisher: '系统测试',
    inquiryNo: 'TEST-001',
    deadline: new Date(Date.now() + 3600000).toISOString(),
    url: 'https://example.com',
    status: 'pending',
  };

  try {
    await adapter.send(testProject, new Date());
    document.getElementById('testResult').textContent = '✅ 测试消息已发送，请检查微信';
  } catch (err) {
    document.getElementById('testResult').textContent = '❌ 发送失败: ' + err.message;
  }
}

// ============================================================
// 数据管理
// ============================================================
async function handleExport() {
  const data = await exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rfq-reminder-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function handleClear() {
  if (!confirm('确定要清空所有本地数据吗？此操作不可恢复！')) return;
  await clearAllData();
  alert('数据已清空');
}
