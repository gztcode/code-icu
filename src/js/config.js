/**
 * Code ICU · 全局配置
 *
 * 权重、阈值、示例仓库、缓存与网络参数集中在此文件。
 * 业务代码禁止出现裸魔法数字，一律引用本文件常量。
 * @module config
 */

/** GitHub REST API 根地址（浏览器可直连，已实测 `access-control-allow-origin: *`） */
export const API_BASE = 'https://api.github.com';

/**
 * 六项体征权重（锁定，来源 SPEC §6）。合计恒为 1。
 * 任一项数据缺失时由 metrics.computeHealth 按剩余项权重重新归一化。
 * @type {Record<string, number>}
 */
export const WEIGHTS = {
  heartbeat: 0.25,
  breathing: 0.2,
  busFactor: 0.2,
  metabolism: 0.1,
  immunity: 0.15,
  legacy: 0.1,
};

/**
 * 体征显示名。视图层只能从这里取文案，禁止另起字段名。
 * @type {Record<string, string>}
 */
export const VITAL_LABELS = {
  heartbeat: '心跳',
  breathing: '呼吸',
  busFactor: '单人依赖度',
  metabolism: '代谢',
  immunity: '免疫',
  legacy: '遗嘱',
};

/**
 * 三个内置示例仓库（锁定，来源 SPEC §6.6）。
 * `tag` 是按钮副文案，`expectHealth` 是 2026-10-26 实测基线，供快照与 QA 兜底比对。
 * @type {Array<{slug: string, tag: string, expectHealth: number}>}
 */
export const DEMO_REPOS = [
  { slug: 'expressjs/express', tag: '健康的对照样本', expectHealth: 87 },
  { slug: 'moment/moment', tag: '中年危机', expectHealth: 69 },
  { slug: 'request/request', tag: '已经凉了很久', expectHealth: 16 },
];

/* ------------------------------------------------------------------ *
 * 网络
 * ------------------------------------------------------------------ */

/** 单次请求超时（毫秒）。`/issues` 响应体可达 400KB，给足但必须封顶 */
export const REQUEST_TIMEOUT_MS = 15000;

/** 网络失败重试间隔（毫秒），长度即重试次数 */
export const RETRY_DELAYS_MS = [800, 2000];

/** commits 采样上限（GitHub per_page 硬上限） */
export const PER_PAGE_COMMITS = 100;

/** issues 采样上限 */
export const PER_PAGE_ISSUES = 100;

/** releases 采样上限 */
export const PER_PAGE_RELEASES = 10;

/** 提交窗口：近 12 个月，按 365 天近似（避免时区与闰年分支） */
export const COMMIT_WINDOW_DAYS = 365;

/* ------------------------------------------------------------------ *
 * 缓存
 * ------------------------------------------------------------------ */

/**
 * 缓存 Key 前缀，拼成 `icu:v2:repo:{owner}/{repo}`
 *
 * v2：repo.owner 补了 html_url / avatar_url（患者档案卡的头像、用户名、项目名
 * 要能点回 GitHub）。v1 的缓存里没有这两个字段，不换前缀的话老缓存会命中
 * 15 分钟，期间页面上三个链接全是死的。
 */
export const CACHE_PREFIX = 'icu:v2:repo:';

/** 缓存有效期：15 分钟 */
export const CACHE_TTL_MS = 15 * 60 * 1000;

/** 可选 GitHub PAT 的存储 Key */
export const TOKEN_KEY = 'icu:v1:token';

/* ------------------------------------------------------------------ *
 * 取数阶段（体检中视图的分步进度直接消费这张表）
 * ------------------------------------------------------------------ */

/**
 * 单次体检的 5 个端点，顺序即报告页与加载页的展示顺序。
 * `path` 是给人看的真实 API 路径模板（`{slug}` 会被替换），也是「数据从哪来」的证据。
 * @type {Array<{key: string, label: string, path: string}>}
 */
export const FETCH_STEPS = [
  { key: 'repo', label: '读取仓库档案', path: '/repos/{slug}' },
  { key: 'commits', label: '采集近 12 个月提交', path: '/repos/{slug}/commits?since=…&per_page=100' },
  { key: 'releases', label: '计算发版代谢', path: '/repos/{slug}/releases?per_page=10' },
  { key: 'issues', label: '评估免疫（未关闭 issue）', path: '/repos/{slug}/issues?state=open&per_page=100' },
  { key: 'readme', label: '检查遗嘱（README 完整度）', path: '/repos/{slug}/readme' },
];

/* ------------------------------------------------------------------ *
 * 体征算法阈值（SPEC §6）
 * ------------------------------------------------------------------ */

/** 呼吸：一年 120 次提交视为满分 */
export const BREATHING_FULL_COMMITS = 120;

/** 免疫：超过该天数未更新的 issue 记为僵尸 */
export const STALE_ISSUE_DAYS = 90;

/** 遗嘱：README 字数超过该值加分 */
export const README_LONG_CHARS = 1500;

/** 代谢：无 release 时的中性分（不发版不等于有病） */
export const METABOLISM_NO_RELEASE_SCORE = 45;

/** 依赖度：无人提交（12 个月内零非 bot 提交）时的保底分 */
export const BUS_FACTOR_NO_COMMIT_SCORE = 20;

/** 寿命推演上下限（天） */
export const REMAINING_DAYS_MIN = 3;
export const REMAINING_DAYS_MAX = 3650;

/* ------------------------------------------------------------------ *
 * 项目年龄归一化（SPEC §6.0）
 *
 * 六项体征里有两项的分母是「一年」的绝对值（120 次提交、单人占比惩罚），
 * 对刚开源几个月的新项目会系统性低估：2 个月 40 次提交本是年化 240 次的
 * 健康密度，却只拿到 43 分；2 个月单人开发被判成「过度集中」10 分。
 * 下面这组常量让各体征按项目实际存在月数归一化，12 个月以上的项目一分不动。
 * ------------------------------------------------------------------ */

/** 项目活到多少个月算「成熟」，此后不再做年龄宽容 */
export const PROJECT_MATURE_MONTHS = 12;

/** 「婴儿期」上限（月）：低于此值免疫项弃权、遗嘱保底 */
export const PROJECT_INFANT_MONTHS = 3;

/** 呼吸项最小统计窗口（月）：不足则弃权，交给权重归一化 */
export const BREATHING_MIN_WINDOW_MONTHS = 1;

/** 呼吸项窗口不足这个月数时不做趋势修正（对半分的两段样本都太小） */
export const BREATHING_TREND_MIN_MONTHS = 6;

/** 年轻项目（不足 6 个月）未发版时的代谢分，而非成熟项目的 45 */
export const METABOLISM_YOUNG_NO_RELEASE_SCORE = 70;

/** 婴儿期项目的遗嘱保底分：README 还没写完是正常的，不该判成「遗嘱残缺」 */
export const LEGACY_INFANT_MIN_SCORE = 60;

/** 项目存在不足这么多天，不做寿命推演（样本太短，推出来的数字没有意义） */
export const REMAINING_MIN_AGE_DAYS = 30;

/* ------------------------------------------------------------------ *
 * 病危等级（SPEC §6 分级表）
 * ------------------------------------------------------------------ */

/**
 * 五档分诊等级，按 `min` 降序匹配第一条。
 * `tone` 直接拼成设计 Token 变量名 `--level-{tone}`，视图层不要再写映射。
 * @type {Array<{min: number, level: string, label: string, tone: string, summary: string}>}
 */
export const LEVELS = [
  { min: 85, level: 'healthy', label: '健康', tone: 'healthy', summary: '各项体征平稳，可放心接入' },
  { min: 70, level: 'clinic', label: '门诊随访', tone: 'clinic', summary: '存在需要关注的老化信号' },
  { min: 50, level: 'ward', label: '住院观察', tone: 'ward', summary: '多项体征恶化，接手前需评估成本' },
  { min: 30, level: 'icu', label: 'ICU', tone: 'icu', summary: '危重，除维护外不建议新接入' },
  { min: 0, level: 'dead', label: '临床死亡', tone: 'dead', summary: '已无生命体征，仅作史料' },
];

/** 健康分无法计算时的等级兜底（六项全部取数失败才会出现） */
export const UNKNOWN_LEVEL = {
  level: 'unknown',
  label: '数据不足',
  tone: 'dead',
  summary: '关键指标全部取数失败，无法出具结论',
};

/**
 * 等级英文名，用于徽章副文案（报告页徽章、通知书等级章）。
 * 放这里的理由：设计稿、社媒对比图、通知书三处必须同一个词，只能有这一份。
 * `dead` 用 `DEAD` 不用 `DECEASED` —— 急诊病历的冷，不是讣告的正式。
 * @type {Record<string, string>}
 */
export const LEVEL_EN = {
  healthy: 'HEALTHY',
  clinic: 'FOLLOW-UP',
  ward: 'ADMITTED',
  icu: 'CRITICAL',
  dead: 'DEAD',
  unknown: 'NO DATA',
};
