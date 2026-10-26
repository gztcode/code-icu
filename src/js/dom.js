/**
 * Code ICU · DOM 与格式化小工具
 *
 * 视图层用模板字符串拼 DOM（和设计稿逐行对得上），所以这里的第一责任是**转义**：
 * 仓库描述、owner、repo 名都是外部数据，一律经过 `esc()` 才能进 innerHTML。
 * @module dom
 */

/** 允许使用的图标 id（严格白名单，防止拼字符串时注入） */
const ICONS = new Set([
  'heart-pulse', 'wind', 'user-round', 'repeat-2', 'shield-check', 'scroll-text',
  'star', 'git-fork', 'circle-dot', 'code-2', 'scale', 'calendar-clock',
  'stethoscope', 'download', 'rotate-ccw', 'copy', 'arrow-right', 'external-link', 'x', 'chevron-down',
  'check', 'loader', 'lock', 'clipboard-list',
  'file-question', 'gauge', 'wifi-off', 'clock',
  'flask-conical', 'workflow', 'square-check-big', 'file-key', 'house',
]);

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * emoji 字符集（SPEC §8.2：`repo.description` 渲染前必须剥离）。
 *
 * 刻意**不用** `\p{Emoji_Component}`：它把 ASCII 的 0-9、`#`、`*` 也算作 emoji 组件，
 * 用它洗一遍 "Node.js 18" 会变成 "Node.js "、"v0.3" 会变成 "v."。这里只保留
 * 真正会被渲染成彩色图形的码位：Extended_Pictographic（含 U+2600 段的 BMP 符号）、
 * 区域指示符（国旗）、肤色修饰符、变体选择符、零宽连接符、键帽组合符。
 */
const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu;

/**
 * 剥离字符串里的 emoji，并把剥离后残留的连续空格压成一个、去掉首尾空白。
 * 只用于渲染层：数据层的 `repo.description` 保留 API 原文，不改数据。
 * @param {unknown} value
 * @returns {string}
 */
export function stripEmoji(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(EMOJI_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * 校验外部链接，只放行 github.com 下的 https 地址。
 *
 * 为什么不能直接用 API 返回的 `html_url`：那是外部数据，理论上可以被篡改或
 * 指向恶意站点。直接塞进 href 等于把用户的点击送出去。`javascript:` 伪协议
 * 更危险 —— 一旦拼进 href，页面里的脚本就可能被它执行。
 *
 * 校验用 URL 解析而不是字符串前缀匹配：`https://github.com.evil.com/x` 能骗过
 * `startsWith('https://github.com')`，但骗不过 `hostname === 'github.com'`。
 *
 * @param {unknown} value 待校验的 URL
 * @param {string} [host] 允许的主机名，默认 github.com
 * @returns {string} 合法则返回原 URL，否则返回空字符串
 */
export function safeUrl(value, host = 'github.com') {
  if (typeof value !== 'string' || !value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return '';
    if (url.hostname.toLowerCase() !== host.toLowerCase()) return '';
    return url.href;
  } catch {
    return '';
  }
}

/**
 * HTML 转义。所有来自 API 的字符串都必须经过它。
 * @param {unknown} value
 * @returns {string}
 */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/**
 * 生成一个 `<svg><use>>` 图标标签。装饰性图标一律 aria-hidden。
 * @param {string} name 白名单内的图标名（不带 `i-` 前缀）
 * @param {'ic'|'ic-20'|'ic-24'} [size]
 * @param {string} [extraClass]
 * @returns {string}
 */
export function icon(name, size = 'ic', extraClass = '') {
  if (!ICONS.has(name)) throw new Error(`未登记的图标：${name}`);
  const cls = ['ic', size === 'ic' ? '' : size, extraClass].filter(Boolean).join(' ');
  return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

/**
 * 千分位数字。
 * @param {number|null|undefined} value
 * @returns {string} 非数字返回破折号
 */
export function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US') : '—';
}

/**
 * 保留一位小数的评分。弃权（null）返回破折号，绝不显示成 0。
 * @param {number|null|undefined} value
 * @returns {string}
 */
export function score(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '—';
}

/**
 * ISO 时间 → `YYYY-MM-DD`（本地时区）。
 * @param {string|null|undefined} iso
 * @returns {string}
 */
export function fmtDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 仓库创建时间 → 病案号 `EX-YYYYMMDD`（SPEC §8.2：必须由 `repo.created_at` 派生，不得硬编码）。
 *
 * 两条都不能省：
 *   1. 不用 `owner-repo-日期` 那种拼法 —— 仓库改名或转移 owner 时那个编号会漂移，
 *      而病案号一旦打印出来就不该再变；
 *   2. 取 ISO 字符串里的 **UTC 日期位**，不转本地时区 —— `2011-01-23T18:58:05Z` 在 UTC+8
 *      下是 24 号，但 GitHub 记录的创建日期是 23 号，病案号必须与 spec 的 EX-20110123 一致，
 *      也不能因为读者在哪个时区而变成另一个编号。
 * 取不到创建时间时给 `EX-UNDATED`，绝不编一个日期。
 * @param {string|null|undefined} iso
 * @returns {string}
 */
export function fmtCaseNo(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return match ? `EX-${match[1]}${match[2]}${match[3]}` : 'EX-UNDATED';
}

/**
 * ISO 时间 → `YYYY-MM-DD HH:mm`。
 * @param {string|null|undefined} iso
 * @returns {string}
 */
export function fmtDateTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${fmtDate(iso)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * ISO 时间 → `HH:mm`。
 * @param {string|null|undefined} iso
 * @returns {string}
 */
export function fmtTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * 毫秒 → `00:04.2` 形式的秒表读数。
 * @param {number} ms
 * @returns {string}
 */
export function fmtStopwatch(ms) {
  const total = Math.max(0, ms) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(1).padStart(4, '0')}`;
}

/**
 * 毫秒 → `00:14:38` 倒计时。负数归零。
 * @param {number} ms
 * @returns {string}
 */
export function fmtCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/**
 * 用 HTML 字符串替换容器内容，并返回根元素。
 * @param {Element} container
 * @param {string} html
 * @returns {HTMLElement|null}
 */
export function mount(container, html) {
  container.innerHTML = html;
  return /** @type {HTMLElement|null} */ (container.firstElementChild);
}

/**
 * 弹出一次轻提示（复制成功等）。
 * @param {string} message
 * @returns {void}
 */
export function toast(message) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.setAttribute('role', 'status');
  node.textContent = message;
  document.body.appendChild(node);
  requestAnimationFrame(() => node.classList.add('on'));
  setTimeout(() => {
    node.classList.remove('on');
    setTimeout(() => node.remove(), 320);
  }, 1800);
}
