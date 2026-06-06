// ============================================================
// 询价提醒助手 - 本地存储模块
// ============================================================

import { STORAGE_KEY, DEFAULT_REMINDER_CONFIG, DEFAULT_WECHAT_CONFIG } from './constants.js';

/**
 * 读取所有询价项目
 * @returns {Promise<Array>}
 */
export async function getProjects() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY]?.projects || [];
}

/**
 * 保存所有询价项目
 * @param {Array} projects
 */
export async function saveProjects(projects) {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const existing = data[STORAGE_KEY] || {};
  existing.projects = projects;
  await chrome.storage.local.set({ [STORAGE_KEY]: existing });
}

/**
 * 添加项目（带去重）
 * @param {Object} project
 * @returns {Promise<{added: boolean, project: Object|null}>}
 */
export async function addProject(project) {
  const projects = await getProjects();
  const existingIdx = findDuplicateIndex(projects, project);

  if (existingIdx >= 0) {
    // 更新现有项目
    const existing = projects[existingIdx];
    if (existing.deadline !== project.deadline) {
      existing.deadline = project.deadline;
      existing.lastNotifiedAt = null;
      existing.expiredNotified = false;
    }
    existing.lastSeenAt = new Date().toISOString();
    projects[existingIdx] = existing;
    await saveProjects(projects);
    return { added: false, project: existing };
  }

  const now = new Date().toISOString();
  const newProject = {
    ...project,
    id: generateId(),
    status: 'pending',
    priority: 'normal',
    reminderEnabled: false,  // 默认不提醒，需手动确认
    lastSeenAt: now,
    createdAt: now,
    lastNotifiedAt: null,
    expiredNotified: false,
  };

  projects.push(newProject);
  await saveProjects(projects);
  return { added: true, project: newProject };
}

/**
 * 更新项目
 * @param {string} id
 * @param {Object} updates
 */
export async function updateProject(id, updates) {
  const projects = await getProjects();
  const idx = projects.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  projects[idx] = { ...projects[idx], ...updates };
  await saveProjects(projects);
  return projects[idx];
}

/**
 * 删除项目
 * @param {string} id
 */
export async function deleteProject(id) {
  const projects = await getProjects();
  const filtered = projects.filter((p) => p.id !== id);
  await saveProjects(filtered);
}

/**
 * 获取提醒配置
 * @returns {Promise<Object>}
 */
export async function getReminderConfig() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY]?.reminderConfig || DEFAULT_REMINDER_CONFIG;
}

/**
 * 保存提醒配置
 * @param {Object} config
 */
export async function saveReminderConfig(config) {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const existing = data[STORAGE_KEY] || {};
  existing.reminderConfig = config;
  await chrome.storage.local.set({ [STORAGE_KEY]: existing });
}

/**
 * 获取微信推送配置
 * @returns {Promise<Object>}
 */
export async function getWechatConfig() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY]?.wechatConfig || DEFAULT_WECHAT_CONFIG;
}

/**
 * 保存微信推送配置
 * @param {Object} config
 */
export async function saveWechatConfig(config) {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const existing = data[STORAGE_KEY] || {};
  existing.wechatConfig = config;
  await chrome.storage.local.set({ [STORAGE_KEY]: existing });
}

/**
 * 获取关键词配置
 * @returns {Promise<Object>}
 */
export async function getKeywordConfig() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY]?.keywordConfig || {};
}

/**
 * 保存关键词配置
 * @param {Object} config
 */
export async function saveKeywordConfig(config) {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const existing = data[STORAGE_KEY] || {};
  existing.keywordConfig = config;
  await chrome.storage.local.set({ [STORAGE_KEY]: existing });
}

/**
 * 导出所有数据
 * @returns {Promise<Object>}
 */
export async function exportData() {
  return await chrome.storage.local.get(STORAGE_KEY);
}

/**
 * 清空所有数据
 */
export async function clearAllData() {
  await chrome.storage.local.remove(STORAGE_KEY);
}

// ---- 内部工具函数 ----

function generateId() {
  return 'rfq_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * 查找重复项目
 * 规则：1) URL 相同 2) 询价标题+截止时间相同 3) 页面标题+截止时间相同
 */
function findDuplicateIndex(projects, project) {
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    // URL+标题相同才算重复（同页面不同项目不重复）
    if (p.url && project.url && p.url === project.url && p.title === project.title) return i;
    if (p.title === project.title && p.deadline === project.deadline) return i;
  }
  return -1;
}
