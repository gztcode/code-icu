/**
 * Code ICU · HTTP 与响应裁剪
 *
 * 只回答一个问题：怎么安全地把 GitHub 的一个端点取回来、并裁成够用的大小。
 * 不含任何评分或缓存逻辑。
 * @module http
 */

import { API_BASE, RETRY_DELAYS_MS, REQUEST_TIMEOUT_MS } from './config.js';

/** 请求 README 原文用的 Accept 值 */
export const RAW_ACCEPT = 'application/vnd.github.raw';

/* ================================================================== *
 * 错误类型：调用方按 instanceof 分流到不同错误态视图
 * ================================================================== */

/** 限流：403 且剩余额度为 0。携带额度重置时刻供倒计时使用 */
export class RateLimitError extends Error {
  /** @param {Date|null} resetAt 额度重置时刻 */
  constructor(resetAt) {
    super('GitHub 接口限流：当前 IP 一小时内额度已耗尽');
    this.name = 'RateLimitError';
    this.resetAt = resetAt;
  }
}

/** 仓库不存在：404 */
export class NotFoundError extends Error {
  /** @param {string} target 出错的路径或 repository slug */
  constructor(target) {
    super(`查无此院：${target}`);
    this.name = 'NotFoundError';
    this.target = target;
  }
}

/** Token 无效或权限不足：401 */
export class TokenInvalidError extends Error {
  constructor() {
    super('GitHub Token 无效或已过期，请清除后重试');
    this.name = 'TokenInvalidError';
  }
}

/** 网络失败 / 5xx / 响应解析失败（已用尽重试） */
export class NetworkError extends Error {
  /**
   * @param {string} detail
   * @param {unknown} [cause]
   */
  constructor(detail, cause) {
    super(`网络请求失败：${detail}`);
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/* ================================================================== *
 * 请求
 * ================================================================== */

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * 单次带超时的请求。用 AbortController 主动掐断，避免 `/issues` 大响应无限挂起。
 * @param {string} url
 * @param {Record<string, string>} headers
 * @returns {Promise<Response>}
 */
async function requestOnce(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 从响应头换算限流重置时刻。
 * @param {Response} res
 * @returns {Date|null}
 */
function resetAtOf(res) {
  const seconds = Number(res.headers.get('x-ratelimit-reset'));
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
}

/**
 * GET 一个端点并解析响应体。内含超时、重试与错误归一化。
 *
 * 错误分流：401 → TokenInvalidError；403+额度 0 → RateLimitError；403 其他 → NetworkError（不重试）；
 * 404 → NotFoundError（`allow404` 时返回 null）；5xx / 网络异常 / 解析失败 → 重试后抛 NetworkError。
 * @param {string} path 以 `/` 开头的路径
 * @param {{token?: string, accept?: string, allow404?: boolean}} [options]
 *   `allow404` 为真时 404 返回 null 而非抛错（用于 readme：仓库没有 README 属正常情况）
 * @returns {Promise<any>}
 */
export async function getJson(path, options = {}) {
  const { token = '', accept = 'application/vnd.github+json', allow404 = false } = options;
  const url = API_BASE + path;
  /** @type {Record<string, string>} */
  const headers = { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let lastError = new NetworkError('请求未发出');
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    let res;
    try {
      res = await requestOnce(url, headers);
    } catch (error) {
      lastError = new NetworkError(/** @type {Error} */ (error).message, error);
      continue;
    }
    if (res.status === 404) {
      if (allow404) return null;
      throw new NotFoundError(path);
    }
    if (res.status === 401) throw new TokenInvalidError();
    if (res.status === 403) {
      if (res.headers.get('x-ratelimit-remaining') === '0') throw new RateLimitError(resetAtOf(res));
      throw new NetworkError('无权访问该资源（HTTP 403）');
    }
    if (!res.ok) {
      lastError = new NetworkError(`接口返回 HTTP ${res.status}`);
      continue;
    }
    try {
      return accept === RAW_ACCEPT ? await res.text() : await res.json();
    } catch (error) {
      lastError = new NetworkError('响应解析失败（响应体可能被截断）', error);
    }
  }
  throw lastError;
}

/**
 * 把 Promise 的成败收敛成结果对象，供 Promise.all 并行消费而不互相打断。
 * @template T
 * @param {Promise<T>} promise
 * @returns {Promise<{ok: true, value: T}|{ok: false, error: Error}>}
 */
export async function settle(promise) {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error: /** @type {Error} */ (error) };
  }
}

/* ================================================================== *
 * 响应裁剪
 *
 * 只保留指标层会读的字段，并刻意沿用 GitHub 原始字段名
 * （`commit.committer.date` / `author.login` / `updated_at` / `pull_request` / `license`），
 * 这样指标层不用为「原始响应」和「裁剪后的缓存」写两套读取路径。
 * 整包体积从 ~500KB 压到 ~70KB，localStorage 配额友好。
 * ================================================================== */

/**
 * @param {any} repo
 * @returns {object}
 */
export function trimRepo(repo) {
  return {
    full_name: repo.full_name ?? null,
    name: repo.name ?? null,
    // owner 补 html_url / avatar_url：患者档案卡的头像、用户名要能点回 GitHub。
    // 只保留 login 的话，视图层只能自己拼 URL（拼错域名就是钓鱼链接）。
    owner: {
      login: repo.owner?.login ?? null,
      html_url: repo.owner?.html_url ?? null,
      avatar_url: repo.owner?.avatar_url ?? null,
    },
    description: repo.description ?? '',
    html_url: repo.html_url ?? null,
    language: repo.language ?? null,
    default_branch: repo.default_branch ?? null,
    stargazers_count: repo.stargazers_count ?? 0,
    forks_count: repo.forks_count ?? 0,
    open_issues_count: repo.open_issues_count ?? 0,
    size: repo.size ?? 0,
    pushed_at: repo.pushed_at ?? null,
    created_at: repo.created_at ?? null,
    archived: repo.archived === true,
    license: repo.license ? { spdx_id: repo.license.spdx_id ?? null, name: repo.license.name ?? null } : null,
  };
}

/**
 * @param {any[]} commits
 * @returns {Array<{sha: string|null, commit: {committer: {date: string|null}}, author: {login: string}|null}>}
 */
export function trimCommits(commits) {
  return commits.map((item) => ({
    sha: item.sha ?? null,
    commit: { committer: { date: item.commit?.committer?.date ?? item.commit?.author?.date ?? null } },
    author: item.author?.login ? { login: item.author.login } : null,
  }));
}

/**
 * `pull_request` 只在 PR 上保留空对象，普通 issue 为 null。
 * 指标层统一用 `item.pull_request != null` 判定，原始响应与裁剪结果行为一致。
 * @param {any[]} issues
 * @returns {Array<{number: number|null, updated_at: string|null, pull_request: object|null}>}
 */
export function trimIssues(issues) {
  return issues.map((item) => ({
    number: item.number ?? null,
    updated_at: item.updated_at ?? null,
    pull_request: item.pull_request ? {} : null,
  }));
}

/**
 * @param {any[]} releases
 * @returns {Array<{tag_name: string|null, published_at: string|null}>}
 */
export function trimReleases(releases) {
  return releases.map((item) => ({
    tag_name: item.tag_name ?? null,
    published_at: item.published_at ?? null,
  }));
}
