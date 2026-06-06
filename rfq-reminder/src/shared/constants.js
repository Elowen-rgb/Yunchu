// ============================================================
// 询价提醒助手 - 常量定义
// ============================================================

/** 项目状态枚举 */
export const STATUS = {
  PENDING: 'pending',
  QUOTED: 'quoted',
  ABANDONED: 'abandoned',
  EXPIRED: 'expired',
};

export const STATUS_LABELS = {
  pending: '待报价',
  quoted: '已报价',
  abandoned: '已放弃',
  expired: '已过期',
};

/** 优先级别 */
export const PRIORITY = {
  NORMAL: 'normal',
  HIGH: 'high',
};

/** 默认提醒配置 */
export const DEFAULT_REMINDER_CONFIG = {
  enabled: true,
  startBeforeHours: 48,
  intervals: [
    { withinHours: 48, intervalMinutes: 1440 },
    { withinHours: 24, intervalMinutes: 720 },
    { withinHours: 12, intervalMinutes: 360 },
    { withinHours: 6, intervalMinutes: 120 },
    { withinHours: 2, intervalMinutes: 30 },
    { withinMinutes: 30, intervalMinutes: 10 },
  ],
  notifyAfterExpired: true,
};

/** 默认微信推送配置 */
export const DEFAULT_WECHAT_CONFIG = {
  enabled: false,
  serviceType: 'wxpusher',
  appToken: '',
  uid: '',
  sendKey: '',
  webhookUrl: '',
};

// ---- 询价标题关键词 ----
export const TITLE_KEYWORDS = [
  '询价标题', '标题', '询价名称', '询价项目', '项目名称',
  '采购标题', '采购项目', '物资名称', '标的物', '采购内容',
];

// ---- 发布人关键词 ----
export const PUBLISHER_KEYWORDS = [
  '发布人', '采购员', '采购联系人', '联系人', '经办人',
  '采购负责人', '业务联系人', '项目联系人',
];

// ---- 询价单号关键词 ----
export const INQUIRY_NO_KEYWORDS = [
  '询价单号', '询价编号', '询价书编号', 'RFQ编号', 'RFQ No',
  '单据编号', '单号', '项目编号', '采购编号', '招标编号', 'RFQ',
];

// ---- 截止时间关键词 ----
export const DEADLINE_KEYWORDS = [
  '报价截止', '报价截止时间', '报价起止时间', '询价截止', '询价截止时间',
  '投标截止', '投标截止时间', '响应截止', '响应截止时间',
  '报名截止', '截止日期', '截止时间', '开标时间',
];

/** 提醒检查 alarm 名称 */
export const ALARM_NAME = 'rfq-reminder-check';

/** 提醒检查间隔（分钟） */
export const ALARM_INTERVAL_MINUTES = 1;

/** 存储 key 前缀 */
export const STORAGE_KEY = 'rfq_reminder';
