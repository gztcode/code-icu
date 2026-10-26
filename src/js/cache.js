/**
 * Code ICU · 本地缓存
 *
 * localStorage 在无痕模式、禁用 Cookie、配额写满、Node 环境下都会抛异常，
 * 因此这里所有操作都包 try/catch 并静默降级 —— 缓存失败绝不能让体检白屏。
 * @module cache
 */

import { CACHE_PREFIX, CACHE_TTL_MS } from './config.js';

/**
 * 探测可用的 localStorage。不可用时返回 null（调用方按「无缓存」处理）。
 * @returns {Storage|null}
 */
function getStore() {
  try {
    const store = globalThis.localStorage;
    if (!store) return null;
    const probe = '__icu_probe__';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

/**
 * 读缓存。过期、结构非法、解析失败一律视为未命中。
 * @param {string} slug `owner/repo`
 * @returns {{bundle: object, fetchedAt: string, ageMs: number}|null}
 */
export function readCache(slug) {
  const store = getStore();
  if (!store) return null;
  try {
    const raw = store.getItem(CACHE_PREFIX + slug);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    const fetchedAt = typeof entry?.fetchedAt === 'string' ? entry.fetchedAt : null;
    if (!fetchedAt || !entry?.bundle) return null;
    const ageMs = Date.now() - new Date(fetchedAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > CACHE_TTL_MS) return null;
    return { bundle: entry.bundle, fetchedAt, ageMs };
  } catch {
    return null;
  }
}

/**
 * 写缓存。写失败（配额满 / 隐私模式）静默忽略，不影响主流程。
 * @param {string} slug `owner/repo`
 * @param {object} bundle 已裁剪的数据包
 * @returns {void}
 */
export function writeCache(slug, bundle) {
  const store = getStore();
  if (!store) return;
  try {
    store.setItem(CACHE_PREFIX + slug, JSON.stringify({ fetchedAt: new Date().toISOString(), bundle }));
  } catch {
    /* 配额不足时放弃缓存 */
  }
}

/**
 * 清除单个仓库的缓存，供「点击重新体检」使用。
 * @param {string} slug `owner/repo`
 * @returns {void}
 */
export function clearCache(slug) {
  const store = getStore();
  if (!store) return;
  try {
    store.removeItem(CACHE_PREFIX + slug);
  } catch {
    /* 忽略 */
  }
}

/**
 * 读取用户自填的 GitHub PAT（可选，用于把限流从 60/h 提到 5000/h）。
 * @param {string} key 存储 Key（config.TOKEN_KEY）
 * @returns {string} 未填写或不可用时返回空字符串
 */
export function readToken(key) {
  const store = getStore();
  if (!store) return '';
  try {
    return store.getItem(key) ?? '';
  } catch {
    return '';
  }
}

/**
 * 保存 / 清除 GitHub PAT。传空字符串即清除。
 * @param {string} key 存储 Key（config.TOKEN_KEY）
 * @param {string} token
 * @returns {boolean} 是否写入成功
 */
export function writeToken(key, token) {
  const store = getStore();
  if (!store) return false;
  try {
    if (token) store.setItem(key, token);
    else store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
