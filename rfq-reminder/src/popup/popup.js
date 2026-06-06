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

document.addEventListener('DOMContentLoaded', async () => {
  await loadProjects();
  setupEventListeners();
});

async function loadProjects() {
  projects = await getProjects();
  renderProjects();
  updateCount();
}

function setupEventListeners() {
  document.querySelectorAll('.filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderProjects();
    });
  });

  document.getElementById('scanBtn').addEventListener('click', handleScanPage);
  document.getElementById('optionsLink').addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
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

    const response = await Promise.race([
      chrome.tabs.sendMessage(tab.id, { action: 'scanPage' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 3000)),
    ]);

    if (!response || !response.success) throw new Error('页面识别失败');
    const data = response.data;

    if (response.isBatch && response.batch && response.batch.length > 1) {
      let saved = 0, updated = 0;
      for (const item of response.batch) {
        const r = await addProject(item);
        if (r.added) saved++;
        else updated++;
      }
      showDebug(data, `识别到 ${response.batch.length} 条，新增 ${saved} 条，已存在 ${updated} 条`);
      showToast(`✅ 新增 ${saved} 条（识别 ${response.batch.length} 条）\n🔕 默认不提醒，勾选后点「批量确认」`);
    } else {
      showDebug(data);
      const result = await addProject(data);
      showToast(result.added ? '✅ 已保存（默认不提醒，请点确认提醒）' : 'ℹ️ 项目已存在');
    }

    await loadProjects();
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('TIMEOUT') || msg.includes('Could not establish connection')) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['src/contentScript.js'],
        });
        showToast('✅ 已激活，请再点一次识别');
      } catch (e2) {
        showToast('❌ 请刷新当前页面后重试（F5）');
      }
    } else {
      showToast('❌ ' + msg);
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
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>${getEmptyMsg(currentFilter)}</p><p class="empty-hint">打开采购页面，点击"识别本页询价"</p></div>`;
    return;
  }

  filtered = sortByUrgency(filtered, now);
  const toolbar = renderToolbar(filtered);
  container.innerHTML = toolbar + filtered.map((p) => renderCard(p, now)).join('');
  bindCardEvents();
  bindBatchEvents();
}

function filterProjects(projects, filter, now) {
  switch (filter) {
    case 'urgent':
      return projects.filter((p) => {
        if (p.status !== STATUS.PENDING) return false;
        const mins = getRemainingMinutes(p.deadline, now);
        return mins >= 0 && mins <= 24 * 60;  // 24小时内
      });
    case 'expired':
      return projects.filter((p) => isExpired(p.deadline, now) && p.status !== STATUS.QUOTED && p.status !== STATUS.ABANDONED);
    case 'all':
      return projects;
    default:
      return projects;
  }
}

function getEmptyMsg(filter) {
  switch (filter) {
    case 'urgent': return '暂无24小时内到期的项目 🎉';
    case 'expired': return '没有过期未处理的项目';
    case 'all': return '暂无询价项目';
    default: return '暂无数据';
  }
}

function renderToolbar(filteredList) {
  const pendings = filteredList.filter((p) => p.status === STATUS.PENDING && !p.reminderEnabled);
  if (!pendings.length) return '';
  return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0 8px;font-size:11px;">
    <label><input type="checkbox" id="selectAll" style="vertical-align:middle;"> 全选 (${pendings.length}条)</label>
    <button id="batchEnableReminder" style="font-size:11px;padding:3px 10px;border-radius:4px;border:1px solid #f59e0b;background:#fef3c7;color:#92400e;cursor:pointer;">🔔 批量确认</button>
    <button id="batchDelete" style="font-size:11px;padding:3px 10px;border-radius:4px;border:1px solid var(--border);background:#fff;cursor:pointer;">🗑 批量删除</button>
  </div>`;
}

function renderCard(p, now) {
  const remaining = getRemainingMinutes(p.deadline, now);
  const exp = isExpired(p.deadline, now);
  const statusLabel = STATUS_LABELS[p.status] || '未知';

  let cardClass = '', badgeClass = 'ok', badgeText = '正常';
  if (exp) { cardClass = 'expired'; badgeClass = 'expired'; badgeText = '已过期'; }
  else if (remaining <= 120) { cardClass = 'urgent'; badgeClass = 'urgent'; badgeText = getRemainingText(p.deadline, now); }
  else if (remaining <= 1440) { badgeClass = 'warning'; badgeText = getRemainingText(p.deadline, now); }
  if (p.status === STATUS.QUOTED) cardClass += ' quoted';

  const deadlineStr = p.deadline ? new Date(p.deadline).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '未识别';
  const reminderIcon = p.reminderEnabled ? '🔔' : '🔕';

  return `
    <div class="project-card ${cardClass}" data-id="${p.id}">
      <div class="card-header">
        <input type="checkbox" class="item-checkbox" data-id="${p.id}" style="flex-shrink:0;margin-right:4px;">
        <span class="card-title" title="${esc(p.title)}">${reminderIcon} ${esc(p.title)}</span>
        <span class="status-tag ${p.status}">${statusLabel}</span>
      </div>
      <div class="card-meta">
        <span>👤 ${esc(p.publisher)}</span>
        <span>📋 ${esc(p.inquiryNo)}</span>
      </div>
      <div class="card-meta">
        <span>⏰ ${deadlineStr}</span>
        <span class="deadline-badge ${badgeClass}">${badgeText}</span>
        ${p.source ? `<span>🌐 ${esc(p.source)}</span>` : ''}
      </div>
      <div class="card-actions">
        ${p.url ? `<button data-action="open" data-id="${p.id}" data-url="${esc(p.url)}">🔗 打开</button>` : ''}
        ${!p.reminderEnabled
          ? `<button data-action="enableReminder" data-id="${p.id}" style="background:#fef3c7;border-color:#f59e0b;color:#92400e;">🔔 确认提醒</button>`
          : `<button data-action="disableReminder" data-id="${p.id}" style="background:#e5e7eb;">🔕 关闭提醒</button>`}
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
        case 'open': chrome.tabs.create({ url: btn.dataset.url }); break;
        case 'enableReminder':
          await updateProject(id, { reminderEnabled: true });
          showToast('🔔 已开启提醒'); await loadProjects(); break;
        case 'disableReminder':
          await updateProject(id, { reminderEnabled: false });
          showToast('🔕 已关闭提醒'); await loadProjects(); break;
        case 'quote':
          await updateProject(id, { status: STATUS.QUOTED });
          showToast('✅ 已标记为已报价'); await loadProjects(); break;
        case 'abandon':
          await updateProject(id, { status: STATUS.ABANDONED });
          showToast('❌ 已标记为放弃'); await loadProjects(); break;
        case 'restore':
          await updateProject(id, { status: STATUS.PENDING, expiredNotified: false, lastNotifiedAt: null, reminderEnabled: false });
          showToast('🔄 已恢复（需重新确认提醒）'); await loadProjects(); break;
        case 'delete':
          await deleteProject(id);
          showToast('🗑 已删除'); await loadProjects(); break;
      }
    });
  });
}

function bindBatchEvents() {
  const selectAll = document.getElementById('selectAll');
  if (selectAll) {
    selectAll.addEventListener('change', () => {
      // 只勾选当前可见的（未被筛选隐藏的）
      document.querySelectorAll('.project-card:not([style*="display:none"]) .item-checkbox').forEach((cb) => { cb.checked = selectAll.checked; });
    });
  }

  const batchEnable = document.getElementById('batchEnableReminder');
  if (batchEnable) {
    batchEnable.addEventListener('click', async () => {
      const ids = getCheckedIds();
      if (!ids.length) return showToast('请先勾选项目');
      for (const id of ids) await updateProject(id, { reminderEnabled: true });
      showToast(`✅ 已为 ${ids.length} 个项目开启提醒`);
      await loadProjects();
    });
  }

  const batchDelete = document.getElementById('batchDelete');
  if (batchDelete) {
    batchDelete.addEventListener('click', async () => {
      const ids = getCheckedIds();
      if (!ids.length) return showToast('请先勾选项目');
      for (const id of ids) await deleteProject(id);
      showToast(`🗑 已删除 ${ids.length} 个项目`);
      await loadProjects();
    });
  }
}

function getCheckedIds() {
  return Array.from(document.querySelectorAll('.item-checkbox:checked')).map((cb) => cb.dataset.id);
}

function updateCount() {
  const total = projects.length;
  const pending = projects.filter((p) => p.status === STATUS.PENDING).length;
  const remind = projects.filter((p) => p.reminderEnabled).length;
  document.getElementById('projectCount').textContent = `${total} 个项目，${pending} 待处理，${remind} 已开提醒`;
}

function showDebug(data, extraMsg = '') {
  const content = document.getElementById('debugContent');
  const toggle = document.getElementById('debugToggle');
  toggle.style.display = 'inline-block';
  content.style.display = 'none';

  toggle.onclick = (e) => {
    e.stopPropagation();
    content.style.display = content.style.display === 'none' ? 'block' : 'none';
  };

  const d = data.__debug || {};
  const raw = data.rawTextSample || '(无)';
  const dlStr = data.deadline ? new Date(data.deadline).toLocaleString('zh-CN') : '❌ 未识别';
  content.innerHTML = `
    ${extraMsg ? `<div style="color:#92400e;font-weight:bold;">📊 ${esc(extraMsg)}</div>` : ''}
    <div>🔧 v${esc(d.version||'?')} | 表格:${d.tableCount||'?'} | ${esc(d.colMap||'')}</div>
    📋 标题: <b>${esc(data.title||'?')}</b><br>
    👤 发布人: <b>${esc(data.publisher||'?')}</b><br>
    📄 单号: <b>${esc(data.inquiryNo||'?')}</b><br>
    ⏰ 截止: <b>${dlStr}</b><br>
    ${d.rawCells ? '<div style="margin-top:4px;color:#92400e;">📋 原始单元格:<br><pre style="font-size:9px;max-height:80px;overflow:auto;">'+esc(d.rawCells)+'</pre></div>' : ''}
    <details style="margin-top:4px;"><summary style="cursor:pointer;color:#2563eb;">📝 原始文本</summary>
    <pre style="max-height:120px;overflow:auto;background:#fff;padding:4px;border-radius:4px;font-size:10px;white-space:pre-wrap;word-break:break-all;">${esc(raw)}</pre></details>`;
}

function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = 'position:fixed;bottom:40px;left:50%;transform:translateX(-50%);background:#1a1a2e;color:#fff;padding:8px 16px;border-radius:8px;font-size:12px;z-index:100;transition:all 0.3s;opacity:0;white-space:pre-line;text-align:center;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

function esc(s) { if (!s) return ''; return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
