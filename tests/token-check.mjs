/**
 * Code ICU · GitHub Token 链路回归
 *
 * 覆盖两���：
 *   A 单元层（零网络）：请求头注入、401/403 错误分流、localStorage 存取与隐私模式降级
 *   B 真实网络层：认证额度是否真的从 60/h 提到 5000/h、无效 Token 是否被正确识别
 *
 * 跑法：node tests/token-check.mjs
 * 可选环境变量 GITHUB_TOKEN —— 不给就用 gh auth token；两者都没有时 B 组自动跳过。
 */
import { getJson, TokenInvalidError, RateLimitError, NotFoundError } from '../src/js/http.js';
import { readToken, writeToken } from '../src/js/cache.js';
import { fetchBundle } from '../src/js/github.js';
import { TOKEN_KEY } from '../src/js/config.js';

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
function section(title) {
  console.log(`\n[${title}]`);
}

/** 记住真实的 fetch：A 组的 mock 会污染全局，留给 B 组会得出假结论 */
const REAL_FETCH = globalThis.fetch;

/* ------------------------------------------------------------------ *
 * A. 单元层：零网络
 * ------------------------------------------------------------------ */

/** 装一个假 fetch，记录请求头，返回预设响应 */
function mockFetch(response) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, headers: init.headers ?? {} });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      headers: { get: (k) => response.headers?.[k.toLowerCase()] ?? null },
      json: async () => response.body ?? {},
      text: async () => JSON.stringify(response.body ?? {}),
    };
  };
  return calls;
}

section('A1 请求头注入');
{
  const calls = mockFetch({ status: 200, body: { ok: true } });
  await getJson('/repos/expressjs/express', { token: '' });
  const hasAuth = Object.keys(calls[0].headers).some((k) => k.toLowerCase() === 'authorization');
  check('未填 Token 时不发送 Authorization 头', !hasAuth, `headers=${JSON.stringify(calls[0].headers)}`);

  const calls2 = mockFetch({ status: 200, body: { ok: true } });
  await getJson('/repos/expressjs/express', { token: 'ghp_dummy' });
  const auth = Object.entries(calls2[0].headers).find(([k]) => k.toLowerCase() === 'authorization');
  check('填了 Token 时发送 Bearer 头', auth?.[1] === 'Bearer ghp_dummy', auth?.[1] ?? '缺失');
  check('同时带 GitHub API 版本头', Boolean(calls2[0].headers['X-GitHub-Api-Version']));
}

section('A2 错误分流');
{
  mockFetch({ status: 401, body: { message: 'Bad credentials' } });
  let caught = null;
  try {
    await getJson('/repos/x/y', { token: 'ghp_bad' });
  } catch (error) {
    caught = error;
  }
  check('401 → TokenInvalidError', caught instanceof TokenInvalidError, caught?.name ?? '无异常');

  mockFetch({ status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1780000000' } });
  caught = null;
  try {
    await getJson('/repos/x/y', { token: 'ghp_x' });
  } catch (error) {
    caught = error;
  }
  check('403 + 额度为 0 → RateLimitError', caught instanceof RateLimitError, caught?.name ?? '无异常');
  check('RateLimitError 带重置时刻', Boolean(caught?.resetAt), caught?.resetAt ? String(caught.resetAt) : '无');

  mockFetch({ status: 404, body: { message: 'Not Found' } });
  caught = null;
  try {
    await getJson('/repos/no/such', {});
  } catch (error) {
    caught = error;
  }
  check('404 → NotFoundError', caught instanceof NotFoundError, caught?.name ?? '无异常');
}

section('A3 Token 本地存取与降级');
{
  /** 假 localStorage */
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  writeToken(TOKEN_KEY, 'ghp_abc123');
  check('写入后能读回', readToken(TOKEN_KEY) === 'ghp_abc123');
  writeToken(TOKEN_KEY, '');
  check('传空串即清除', readToken(TOKEN_KEY) === '');

  // 隐私模式：localStorage 直接抛异常，必须静默降级而不是让页面崩
  globalThis.localStorage = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('SecurityError');
    },
    removeItem: () => {
      throw new Error('SecurityError');
    },
  };
  let threw = null;
  let value = null;
  try {
    writeToken(TOKEN_KEY, 'ghp_x');
    value = readToken(TOKEN_KEY);
  } catch (error) {
    threw = error;
  }
  check('隐私模式下读写不抛异常', threw === null, threw ? String(threw.message) : '');
  check('隐私模式下读回空串', value === '', JSON.stringify(value));
  delete globalThis.localStorage;
}

// 恢复真实 fetch —— 忘了这步，B 组的「真实网络」请求会全部走上面那个 404 mock，
// 得出「无效 Token 抛 NotFoundError」这种完全错误的结论。
globalThis.fetch = REAL_FETCH;

/* ------------------------------------------------------------------ *
 * B. 真实网络层
 * ------------------------------------------------------------------ */

section('B 真实 GitHub API');

let realToken = process.env.GITHUB_TOKEN ?? '';
if (!realToken) {
  try {
    const { execSync } = await import('node:child_process');
    realToken = execSync('gh auth token', { encoding: 'utf8' }).trim();
  } catch {
    realToken = '';
  }
}

if (!realToken) {
  console.log('  SKIP  本机没有可用 Token（既无 GITHUB_TOKEN 环境变量也无 gh 登录），B 组跳过');
} else {
  // 额度有两个来源：响应头 x-ratelimit-limit 与响应体 resources.core.limit。
  // 两者都读，body 优先 —— 只读 header 时一旦头被中间层裁掉，Number(null) 就是 0，
  // 断言会得到「未认证额度 = 0」这种完全误导的结论。
  const readLimit = async (response) => {
    const body = await response.json().catch(() => null);
    const fromBody = Number(body?.resources?.core?.limit);
    const fromHeader = Number(response.headers.get('x-ratelimit-limit'));
    return Number.isFinite(fromBody) && fromBody > 0 ? fromBody : fromHeader;
  };

  const anon = await fetch('https://api.github.com/rate_limit', { headers: { 'User-Agent': 'code-icu-test' } });
  const anonLimit = await readLimit(anon);
  check('未认证额度 = 60/h', anonLimit === 60, `limit=${anonLimit}`);

  const auth = await fetch('https://api.github.com/rate_limit', {
    headers: { Authorization: `Bearer ${realToken}`, 'User-Agent': 'code-icu-test' },
  });
  const authLimit = await readLimit(auth);
  check('认证额度 = 5000/h', authLimit === 5000, `limit=${authLimit}`);
  check('认证后额度确实被抬高', authLimit > anonLimit, `${anonLimit} → ${authLimit}`);

  // 无效 Token 必须被识别成 TokenInvalidError，而不是笼统的网络错误
  let caught = null;
  try {
    await getJson('/repos/expressjs/express', { token: 'ghp_this_is_not_a_real_token_xxxxx' });
  } catch (error) {
    caught = error;
  }
  check('无效 Token → TokenInvalidError（不是笼统网络错误）', caught instanceof TokenInvalidError, caught?.name ?? '无异常');

  // 带真 Token 走完整取数链路
  const bundle = await fetchBundle({ owner: 'expressjs', repo: 'express', token: realToken });
  const ok = Boolean(bundle?.repo?.full_name === 'expressjs/express');
  check('带 Token 的 fetchBundle 取数成功', ok, bundle?.repo?.full_name ?? '无');
  check('五个数据源都拿到了', Boolean(bundle.commits && bundle.releases && bundle.issues && bundle.readme !== undefined));
  check('无降级标记', Object.values(bundle.flags ?? {}).every((v) => v === false), JSON.stringify(bundle.flags));
}

/* ------------------------------------------------------------------ *
 * 汇总
 * ------------------------------------------------------------------ */
const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
console.log(`\n[汇总] 共 ${checks.length} 项断言，通过 ${passed}，失败 ${failed}`);
console.log(failed === 0 ? '\n结论：PASS' : '\n结论：FAIL');
process.exit(failed === 0 ? 0 : 1);
