/**
 * Code ICU · 哈希路由
 *
 * 锁定四条：
 *   #/                          首页输入台
 *   #/r/{owner}/{repo}          体检报告（内部状态机 loading / ok / error）
 *   #/r/{owner}/{repo}/live     强制走实时取数（示例仓库默认读快照，这里给想拉实时数据的人留口）
 *   #/notice/{owner}/{repo}     病危通知书（DOM 预览 + 下载 PNG）
 *
 * 通知书刻意**不复用** `/r/.../notice`：它是一个独立成品页（有导出、有返回），
 * 不是一个 tab；独立前缀也让「这个地址发出去就是一张可下载的通知书」这件事在 URL 上就成立。
 *
 * 任何解析不出来的地址一律回落首页 —— 深链分享是主打卖点，绝不允许白屏。
 * @module router
 */

const OWNER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * 解析当前 hash。
 * @param {string} [hash] 默认读 `location.hash`
 * @returns {{name: 'home'}|{name: 'report', owner: string, repo: string, slug: string, mode: string}
 *   |{name: 'notice', owner: string, repo: string, slug: string}}
 */
export function parseHash(hash = globalThis.location?.hash ?? '') {
  const segments = String(hash)
    .replace(/^#/, '')
    .split(/[?#]/)[0]
    .split('/')
    .filter(Boolean);
  const kind = segments[0];
  if ((kind !== 'r' && kind !== 'notice') || segments.length < 3) return { name: 'home' };

  let owner = '';
  let repo = '';
  try {
    owner = decodeURIComponent(segments[1]);
    repo = decodeURIComponent(segments[2]);
  } catch {
    return { name: 'home' };
  }
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo)) return { name: 'home' };
  const slug = `${owner}/${repo}`;
  if (kind === 'notice') return { name: 'notice', owner, repo, slug };
  return { name: 'report', owner, repo, slug, mode: segments[3] ?? '' };
}

/**
 * 通知书的 hash 路径。
 * @param {string} slug `owner/repo`
 * @returns {string}
 */
export function noticePath(slug) {
  return `#/notice/${slug}`;
}

/**
 * 报告页的 hash 路径。
 * @param {string} slug `owner/repo`
 * @param {''|'live'|'notice'} [mode]
 * @returns {string}
 */
export function reportPath(slug, mode = '') {
  return `#/r/${slug}${mode ? `/${mode}` : ''}`;
}

/**
 * 跳转。同一个地址不重复 push（避免点两次「重新体检」堆两条历史）。
 * @param {string} path 以 `#/` 开头
 * @returns {void}
 */
export function navigate(path) {
  if (globalThis.location.hash === path) return;
  globalThis.location.hash = path;
}

/**
 * 订阅路由变化。首次渲染由调用方自己触发，这里不回放。
 * @param {() => void} handler
 * @returns {() => void} 取消订阅
 */
export function onChange(handler) {
  const listener = () => handler();
  globalThis.addEventListener('hashchange', listener);
  return () => globalThis.removeEventListener('hashchange', listener);
}
