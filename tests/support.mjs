/**
 * Code ICU · 回归验证的公共支撑
 *
 * 基线数据、终端排版、断言收集器，以及不需要真实网络的确定性用例（请求预算 / 缓存）。
 * 拆出来只为一件事：让 verify.mjs 留在 300 行以内。
 * @module tests/support
 */

import { fetchBundle } from '../src/js/github.js';

/** SPEC §6.5 实测基线（2026-10-26，项目总监用真实 API 实算） */
export const BASELINE = [
  {
    slug: 'expressjs/express',
    health: 87,
    level: '健康',
    scores: { heartbeat: 100, breathing: 80, busFactor: 97.3, metabolism: 100, immunity: 40.6, legacy: 100 },
  },
  {
    slug: 'moment/moment',
    health: 69,
    level: '住院观察',
    scores: { heartbeat: 95.7, breathing: 66.7, busFactor: 53.7, metabolism: 89, immunity: 23.2, legacy: 90 },
  },
  {
    slug: 'request/request',
    health: 16,
    level: '临床死亡',
    scores: { heartbeat: 0, breathing: 0, busFactor: 20, metabolism: 45, immunity: 0, legacy: 70 },
  },
  {
    slug: 'angular/angular.js',
    health: 8,
    level: '临床死亡',
    scores: { heartbeat: 0, breathing: 0, busFactor: 20, metabolism: 45, immunity: 0, legacy: 0 },
  },
];

/** 六项体征的固定顺序，打印与断言都按它走 */
export const VITAL_ORDER = ['heartbeat', 'breathing', 'busFactor', 'metabolism', 'immunity', 'legacy'];

/** 中文体征名 */
export const VITAL_NAMES = {
  heartbeat: '心跳',
  breathing: '呼吸',
  busFactor: '依赖度',
  metabolism: '代谢',
  immunity: '免疫',
  legacy: '遗嘱',
};

/** 判定阈值：单项偏差 > WARN 记警告，> FAIL 记缺陷（SPEC §6.5） */
export const WARN_AT = 2;
export const FAIL_AT = 5;

/* ---------------------------------------------------------------- *
 * 终端排版：中文字符占两列，必须按显示宽度对齐
 * ---------------------------------------------------------------- */

/**
 * 计算字符串在等宽终端里的显示宽度（CJK 全角字符按 2 列算）。
 * @param {string} text
 * @returns {number}
 */
export function width(text) {
  let total = 0;
  for (const char of String(text)) {
    total += /[\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF01-\uFF60]/.test(char) ? 2 : 1;
  }
  return total;
}

/**
 * 按显示宽度补空格。
 * @param {string|number} value
 * @param {number} size
 * @param {'left'|'right'} [align]
 * @returns {string}
 */
export function pad(value, size, align = 'left') {
  const text = String(value);
  const filler = ' '.repeat(Math.max(0, size - width(text)));
  return align === 'right' ? filler + text : text + filler;
}

/**
 * 渲染一张表。每行是 `{cells, align}`，`widths` 是对应的列宽。
 * @param {Array<{cells: Array<string|number>, align?: Array<'left'|'right'>}>} rows
 * @param {number[]} widths
 * @returns {string}
 */
export function table(rows, widths) {
  return rows
    .map((row) => row.cells.map((cell, i) => pad(cell, widths[i], row.align?.[i] ?? 'left')).join('  '))
    .join('\n');
}

/**
 * 数字格式化成一位小数；非数字（含 null / Infinity）显示为破折号。
 * @param {number|null|undefined} value
 * @param {number} [digits]
 * @returns {string}
 */
export function fixed(value, digits = 1) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
}

/**
 * 带符号的差值，用于基线比对表。
 * @param {number} delta
 * @returns {string}
 */
export function signed(delta) {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

/* ---------------------------------------------------------------- *
 * 断言收集器
 * ---------------------------------------------------------------- */

/** @type {Array<{name: string, ok: boolean, detail: string}>} */
export const checks = [];

/**
 * 记录一条断言。
 * @param {string} name
 * @param {boolean} ok
 * @param {string|number} detail 失败时要能直接定位的证据
 * @returns {void}
 */
export function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail: String(detail) });
}

/**
 * 打印单个仓库的体征明细与文案，供人工核对「数字背后的原因」是否说得通。
 * @param {Array<{expected: object, bundle: object, report: object, fromFixture: boolean}>} results
 * @returns {void}
 */
export function printRepoDetails(results) {
  for (const { expected, bundle, report, fromFixture } of results) {
    const detailOf = (key) => report.vitals.find((item) => item.key === key).detail;
    const breathing = detailOf('breathing');
    const busFactor = detailOf('busFactor');
    const immunity = detailOf('immunity');
    console.log(`  · ${expected.slug}  [${fromFixture ? '夹具缓存' : '实拉'} · ${bundle.fetchedAt}]`);
    console.log(
      `    停更 ${report.daysSincePush} 天 · 提交 ${breathing.total} 次（后半年 ${breathing.last6} / 前半年 ${breathing.prev6}${
        breathing.capped ? ' · 已取满 100 条' : ''
      }）· 作者 ${busFactor.authors} 人 / 单人最多 ${busFactor.topCount} 次 · issue 抽样 ${immunity.open} 条，僵尸占 ${Math.round(immunity.staleRatio * 100)}%`,
    );
    const degraded = report.degraded.length ? `降级项：${report.degraded.join(', ')}` : '无降级项';
    console.log(`    推演剩余 ${report.remainingDays} 天 · ${degraded} · 等级话术：${report.level.summary}`);
    for (const item of report.vitals) {
      console.log(`    ${pad(item.label, 12)}${pad(fixed(item.score), 7, 'right')}  ${item.diagnosis}`);
    }
  }
}

/* ---------------------------------------------------------------- *
 * 请求预算与本地缓存（AC-15）—— 假 fetch + 假 localStorage，零网络
 * ---------------------------------------------------------------- */

/** SPEC §5 锁定的 5 个端点，多一个都算缺陷 */
const EXPECTED_PATHS = ['/repos/demo/repo', '/commits?', '/releases?', '/issues?', '/readme'];

/**
 * 用假的 fetch 和假的 localStorage 跑一遍完整取数链路：
 * 断言单次体检恰好 5 个请求、15 分钟内复开不再请求、force 能穿透缓存。
 * @returns {Promise<void>}
 */
export async function verifyCache() {
  const store = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => { store.set(key, String(value)); },
      removeItem: (key) => { store.delete(key); },
    },
  });
  const body = JSON.stringify({ full_name: 'demo/repo', pushed_at: new Date().toISOString(), archived: false });
  /** @type {string[]} */
  const urls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const first = await fetchBundle({ owner: 'demo', repo: 'repo' });
    check(
      '单次体检恰好 5 个请求且落在 SPEC §5 锁定的端点上',
      urls.length === 5 && EXPECTED_PATHS.every((p) => urls.some((u) => u.includes(p))),
      `${urls.length} 个：${urls.map((u) => u.replace('https://api.github.com', '')).join(' ')}`,
    );
    check('首次取数 fromCache = false', first.fromCache === false, String(first.fromCache));
    const second = await fetchBundle({ owner: 'demo', repo: 'repo' });
    check('15 分钟内重复打开不发任何请求（AC-15）', urls.length === 5, `累计 ${urls.length} 个请求`);
    check('缓存命中 fromCache = true', second.fromCache === true, String(second.fromCache));
    await fetchBundle({ owner: 'demo', repo: 'repo', force: true });
    check('force=true 绕过缓存重新取数', urls.length === 10, `累计 ${urls.length} 个请求`);
  } finally {
    globalThis.fetch = realFetch;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined });
  }
  console.log('\n[6] 请求预算与本地缓存（假 fetch + 假 localStorage，零网络）');
  console.log('  单次体检 5 个请求 · 15 分钟内重复打开 0 个请求 · force 重新体检再 5 个 · 隐私模式见 [5] 同款静默降级');
}
