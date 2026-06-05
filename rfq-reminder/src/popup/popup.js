// ============================================================
// 询价提醒助手 - Popup 脚本
// ============================================================

import {
  getProjects, addProject, updateProject, deleteProject,
  getReminderConfig, getWechatConfig,
} from '../shared/storage.js';
import { getRemainingMinutes, getRemainingText, isExpired, isDueToday, sortByUrgency } from '../shared/deadline.js';
import { STATUS, STATUS_LABELS } from '../shared/constants.js';

let currentFilter = 'urgent';
let projects = [];

// ============================================================
// 初始化
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  await loadProjects();
  setupEventListeners();
});

async function loadProjects() {
  projects = await getProjects();
  renderProjects();
  updateCount();
}

// ============================================================
// 事件绑定
// ============================================================
function setupEventListeners() {
  // 筛选标签
  document.querySelectorAll('.filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderProjects();
    });
  });

  // 识别本页询价
  document.getElementById('scanBtn').addEventListener('click', handleScanPage);

  // 设置按钮
  document.getElementById('optionsLink').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

// ============================================================
// 页面识别
// ============================================================
async function handleScanPage() {
  const btn = document.getElementById('scanBtn');
  btn.textContent = '识别中...';
  btn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('无法获取当前标签页');

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'scanPage' });
    if (!response || !response.success) throw new Error('页面识别失败');

    const data = response.data;
    const result = await addProject(data);

    if (result.added) {
      showToast('✅ 询价项目已保存');
    } else {
      showToast('ℹ️ 项目已存在，已更新');
    }

    await loadProjects();
  } catch (err) {
    // 如果 content script 未响应，尝试通过 background 处理
    if (err.message.includes('Could not establish connection')) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const response = await chrome.runtime.sendMessage({ action: 'parseInquiry' });
        if (response?.success && response.text) {
          // background 返回了页面文本，在这里解析
          // 简化处理：直接用页面标题和 URL 创建项目
          await addProject({
            title: response.pageTitle || '未识别询价标题',
            publisher: '请手动补充发布人',
            inquiryNo: '请手动补充单号',
            deadline: null,
            url: response.url,
            source: response.source,
            pageTitle: response.pageTitle,
          });
          showToast('⚠️ 页面信息有限，请手动补充');
          await loadProjects();
        } else {
          showToast('❌ 识别失败，请刷新页面后重试');
        }
      } catch (e2) {
        showToast('❌ 识别失败: ' + e2.message);
      }
    } else {
      showToast('❌ 识别失败: ' + err.message);
    }
  } finally {
    btn.textContent = '识别本页询价';
    btn.disabled = false;
  }
}

// ============================================================
// 渲染
// ============================================================
function renderProjects() {
  const container = document.getElementById('projectList');
  const now = new Date();
  let filtered = filterProjects(projects, currentFilter, now);

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p>${getEmptyMessage(currentFilter)}</p>
        <p class="empty-hint">打开采购/询价网页，点击"识别本页询价"</p>
      </div>`;
    return;
  }

  // 排序：按紧急程度
  filtered = sortByUrgency(filtered, now);

  container.innerHTML = filtered
    .map((p) => renderProjectCard(p, now))
    .join('');

  // 绑定卡片按钮事件
  bindCardEvents();
}

function filterProjects(projects, filter, now) {
  switch (filter) {
    case 'urgent': {
      // pending 且 48 小时内到期
      return projects.filter((p) => {
        if (p.status !== STATUS.PENDING) return false;
        const mins = getRemainingMinutes(p.deadline, now);
        return mins >= 0 && mins <= 48 * 60;
      });
    }
    case 'today':
      return projects.filter((p) => p.status === STATUS.PENDING && isDueToday(p.deadline, now));
    case 'expired':
      return projects.filter((p) => isExpired(p.deadline, now) && p.status !== STATUS.QUOTED && p.status !== STATUS.ABANDONED);
    case 'all':
      return projects;
    default:
      return projects;
  }
}

function getEmptyMessage(filter) {
  switch (filter) {
    case 'urgent': return '暂无即将到期的项目 🎉';
    case 'today': return '今天没有到期的项目';
    case 'expired': return '没有过期未处理的项目';
    case 'all': return '暂无询价项目';
    default: return '暂无数据';
  }
}

function renderProjectCard(p, now) {
  const remaining = getRemainingMinutes(p.deadline, now);
  const exp = isExpired(p.deadline, now);
  const statusLabel = STATUS_LABELS[p.status] || '未知';

  // 紧急等级
  let cardClass = '';
  let badgeClass = 'ok';
  let badgeText = '正常';

  if (exp) {
    cardClass = 'expired';
    badgeClass = 'expired';
    badgeText = '已过期';
  } else if (remaining <= 120) {
    cardClass = 'urgent';
    badgeClass = 'urgent';
    badgeText = getRemainingText(p.deadline, now);
  } else if (remaining <= 1440) {
    badgeClass = 'warning';
    badgeText = getRemainingText(p.deadline, now);
  }

  if (p.status === STATUS.QUOTED) cardClass += ' quoted';

  const deadlineStr = p.deadline
    ? new Date(p.deadline).toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
    : '未识别';

  return `
    <div class="project-card ${cardClass}" data-id="${p.id}">
      <div class="card-header">
        <span class="card-title" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</span>
        <span class="status-tag ${p.status}">${statusLabel}</span>
      </div>
      <div class="card-meta">
        <span>👤 ${escapeHtml(p.publisher)}</span>
        <span>📋 ${escapeHtml(p.inquiryNo)}</span>
      </div>
      <div class="card-meta">
        <span>⏰ ${deadlineStr}</span>
        <span class="deadline-badge ${badgeClass}">${badgeText}</span>
        ${p.source ? `<span>🌐 ${escapeHtml(p.source)}</span>` : ''}
      </div>
      <div class="card-actions">
        ${p.url ? `<button data-action="open" data-id="${p.id}" data-url="${escapeHtml(p.url)}">🔗 打开</button>` : ''}
        ${p.status === STATUS.PENDING ? `<button data-action="quote" data-id="${p.id}">✅ 已报价</button>` : ''}
        ${p.status === STATUS.PENDING ? `<button data-action="abandon" data-id="${p.id}">❌ 放弃</button>` : ''}
        ${p.status === STATUS.QUOTED || p.status === STATUS.ABANDONED ? `<button data-action="restore" data-id="${p.id}">🔄 恢复</button>` : ''}
        <button data-action="delete" data-id="${p.id}">🗑 删除</button>
      </div>
    </div>`;
}

function bindCardEvents() {
  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      switch (action) {
        case 'open':
          chrome.tabs.create({ url: btn.dataset.url });
          break;
        case 'quote':
          await updateProject(id, { status: STATUS.QUOTED });
          showToast('✅ 已标记为已报价');
          await loadProjects();
          break;
        case 'abandon':
          await updateProject(id, { status: STATUS.ABANDONED });
          showToast('❌ 已标记为放弃');
          await loadProjects();
          break;
        case 'restore':
          await updateProject(id, { status: STATUS.PENDING, expiredNotified: false, lastNotifiedAt: null });
          showToast('🔄 已恢复为待报价');
          await loadProjects();
          break;
        case 'delete':
          await deleteProject(id);
          showToast('🗑 已删除');
          await loadProjects();
          break;
      }
    });
  });
}

// ============================================================
// 工具函数
// ============================================================
function updateCount() {
  const total = projects.length;
  const pending = projects.filter((p) => p.status === STATUS.PENDING).length;
  document.getElementById('projectCount').textContent = `${total} 个项目，${pending} 个待处理`;
}

function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = `
      position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%);
      background: #1a1a2e; color: #fff; padding: 8px 16px; border-radius: 8px;
      font-size: 12px; z-index: 100; transition: all 0.3s; opacity: 0;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
