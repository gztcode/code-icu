/**
 * Code ICU · 视图间的内存交接
 *
 * 只解决一件事：报告页 → 通知书页必须用**屏幕上那一份** analyze() 结果，
 * 不许重新发请求、也不许重算。理由是导出图要和读者刚看到的报告逐位一致，
 * 而重算一次会带上新的 now（停更天数可能跳到 804），导出的分数就和页面上的不是同一份了。
 *
 * 与 cache.js 的分工：那边是 HTTP 层的 15 分钟缓存（会落 localStorage、可能失效），
 * 这边是纯内存、随页面刷新即失效的「同一份结果」传递，不做持久化、不设 TTL —— 它就活在这一次会话里。
 * @module session
 */

/** @type {Map<string, object>} */
const store = new Map();

/**
 * 记住某个仓库当前渲染用的结果。
 * @param {string} slug `owner/repo`
 * @param {object} result analyze() 或 loadSnapshot() 的返回值
 * @returns {void}
 */
export function remember(slug, result) {
  if (!slug || !result) return;
  store.set(slug, result);
}

/**
 * 取出上一次渲染用的结果。
 * @param {string} slug `owner/repo`
 * @returns {object|null}
 */
export function recall(slug) {
  return store.get(slug) ?? null;
}
