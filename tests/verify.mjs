#!/usr/bin/env node
/**
 * Code ICU · 数据层回归验证
 *
 * 真跑：直接 import src/js 下的模块，对 4 个仓库实拉 GitHub 公开 API，
 * 把结果与 SPEC §6.5 的实测基线逐项比对。没有任何 mock 掉真实取数链路的部分。
 *
 * 用法：
 *   node tests/verify.mjs                    使用 15 分钟本地夹具缓存
 *   node tests/verify.mjs --fresh            忽略夹具缓存，全部重新拉取
 *   GITHUB_TOKEN=xxx node tests/verify.mjs   用 PAT 把限流从 60/h 提到 5000/h
 *
 * 判定阈值：单项偏差 > 2 分记警告，> 5 分记失败（SPEC §6.5「误差超 5 分即为实现缺陷」）。
 * @module tests/verify
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchBundle, parseRepoInput } from '../src/js/github.js';
import { analyze, scoreImmunity } from '../src/js/metrics.js';
import { safeUrl } from '../src/js/dom.js';
import {
  BASELINE,
  FAIL_AT,
  VITAL_NAMES,
  VITAL_ORDER,
  check,
  checks,
  fixed,
  printRepoDetails,
  signed,
  table,
  verifyCache,
} from './support.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE_DIR = path.join(ROOT, 'tests', '.cache');
const FIXTURE_TTL_MS = 15 * 60 * 1000;
const FRESH = process.argv.includes('--fresh');
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

/* ---------------------------------------------------------------- *
 * 夹具缓存：避免反复调试时把 60/h 的未认证额度打穿
 * ---------------------------------------------------------------- */

/** @param {string} slug */
const fixturePath = (slug) => path.join(CACHE_DIR, `${slug.replace(/[^\w.-]+/g, '_')}.json`);

/** @param {string} slug @returns {Promise<object|null>} */
async function readFixture(slug) {
  if (FRESH) return null;
  try {
    const info = await stat(fixturePath(slug));
    if (Date.now() - info.mtimeMs > FIXTURE_TTL_MS) return null;
    return JSON.parse(await readFile(fixturePath(slug), 'utf8'));
  } catch {
    return null;
  }
}

/** @param {string} slug @param {object} bundle */
async function writeFixture(slug, bundle) {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(fixturePath(slug), JSON.stringify(bundle), 'utf8');
  } catch {
    /* 夹具缓存写失败不影响验证结论 */
  }
}

/**
 * 取一个仓库的数据包：优先夹具缓存，否则实拉 5 个端点。
 * @param {string} slug
 * @returns {Promise<{bundle: object, fromFixture: boolean}>}
 */
async function getBundle(slug) {
  const cached = await readFixture(slug);
  if (cached) return { bundle: cached, fromFixture: true };
  const parsed = parseRepoInput(slug);
  const bundle = await fetchBundle({ ...parsed, token: TOKEN });
  await writeFixture(slug, bundle);
  return { bundle, fromFixture: false };
}

/* ---------------------------------------------------------------- *
 * [1] 输入解析（AC-01 / AC-02）
 * ---------------------------------------------------------------- */

function verifyParse() {
  const expected = { owner: 'expressjs', repo: 'express' };
  const valid = [
    'expressjs/express',
    'https://github.com/expressjs/express',
    'expressjs/express.git',
    'expressjs/express/',
  ];
  const invalid = ['不是仓库', '', 'owner', 'https://github.com/', 'a/b/c'];
  const rows = [];
  for (const input of valid) {
    const got = parseRepoInput(input);
    const ok = got !== null && got.owner === expected.owner && got.repo === expected.repo;
    check(`parseRepoInput(${input})`, ok, JSON.stringify(got));
    rows.push({ cells: [input, JSON.stringify(got)] });
  }
  for (const input of invalid) {
    const got = parseRepoInput(input);
    check(`parseRepoInput(${JSON.stringify(input)}) 应为 null`, got === null, JSON.stringify(got));
    rows.push({ cells: [JSON.stringify(input), JSON.stringify(got)] });
  }
  console.log('\n[1] 输入解析 parseRepoInput');
  console.log(table(rows, [42, 40]));
}

/* ---------------------------------------------------------------- *
 * [1.5] 外链 URL 校验（患者档案卡的三个链接都走它）
 * ---------------------------------------------------------------- */

function verifySafeUrl() {
  // 这些 URL 全部来自 API 响应，不能不校验就塞进 href。
  const blocked = [
    ['javascript:alert(1)', 'javascript 伪协议'],
    ['JavaScript:alert(1)', 'javascript 伪协议（大小写混淆）'],
    ['data:text/html,<script>alert(1)</script>', 'data 伪协议'],
    ['http://github.com/expressjs', 'http 非 https'],
    ['https://github.com.evil.com/x', '伪造域名（github.com.evil.com）'],
    ['https://evil.com/https://github.com/x', '伪造域名（evil.com）'],
    ['https://notgithub.com/x', '相似域名'],
    ['', '空字符串'],
    [null, 'null'],
    [undefined, 'undefined'],
    ['not a url', '非 URL'],
  ];
  const allowed = [
    ['https://github.com/expressjs', 'github.com'],
    ['https://github.com/expressjs/express', 'github.com'],
    ['https://avatars.githubusercontent.com/u/5658226?v=4', 'avatars.githubusercontent.com'],
  ];

  for (const [input, why] of blocked) {
    const got = safeUrl(input);
    check(`safeUrl 拒绝${why}`, got === '', `返回 ${JSON.stringify(got)}`);
  }
  for (const [input, host] of allowed) {
    const got = safeUrl(input, host);
    check(`safeUrl 放行 ${host} 的合法地址`, got.startsWith('https://'), `返回 ${JSON.stringify(got)}`);
  }
  // 头像走独立主机名，默认白名单里没有它，必须显式传 host
  const avatar = safeUrl('https://avatars.githubusercontent.com/u/1?v=4', 'avatars.githubusercontent.com');
  check('safeUrl 默认不放行 avatars 主机名', safeUrl('https://avatars.githubusercontent.com/u/1?v=4') === '', '默认应拒绝');
  check('safeUrl 显式指定 host 后放行头像地址', avatar.startsWith('https://avatars.githubusercontent.com/'), avatar);

  console.log(`\n[1.5] 外链 URL 校验 safeUrl（拒 ${blocked.length} 条 / 放行 ${allowed.length} 条）`);
}

/* ---------------------------------------------------------------- *
 * [2] /issues 混入 PR 的排除（SPEC §11 已知坑）
 * ---------------------------------------------------------------- */

function verifyPrFilter() {
  const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();
  const mock = [
    { number: 1, updated_at: iso(200), pull_request: null },
    { number: 2, updated_at: iso(1), pull_request: null },
    { number: 3, updated_at: iso(200), pull_request: {} },
  ];
  const result = scoreImmunity(mock, { open_issues_count: 10 }, new Date());
  check('scoreImmunity 剔除 pull_request 条目', result.open === 2, `open=${result.open}（期望 2；未剔除会是 3）`);
  check('scoreImmunity 僵尸占比按剔除后计算', result.score === 50, `score=${result.score}（期望 50；未剔除会算成 33.3）`);
  console.log('\n[2] /issues 混入 PR 的排除验证（3 条 mock：2 个 issue + 1 个 PR）');
  console.log(`  输入 3 条 → 参与统计 ${result.open} 条，僵尸 ${result.stale} 条，得分 ${fixed(result.score)}`);
}

/* ---------------------------------------------------------------- *
 * [3] 四仓库实拉 + 基线比对
 * ---------------------------------------------------------------- */

async function verifyRepos() {
  const results = [];
  for (const expected of BASELINE) {
    const { bundle, fromFixture } = await getBundle(expected.slug);
    const report = analyze(bundle);
    // 确定性（AC-05）：同一份数据连续算两次，六项分数必须逐位相同
    const again = analyze(bundle);
    const identical = VITAL_ORDER.every((key) => report.scores[key] === again.scores[key]);
    check(`${expected.slug} 连续两次计算一致`, identical, JSON.stringify(report.scores));
    results.push({ expected, bundle, report, fromFixture });
  }

  console.log('\n[3] 真实 API 取数 + 六项体征 + 健康分');
  const head = ['仓库', '健康分', ...VITAL_ORDER.map((key) => VITAL_NAMES[key])];
  const align = ['left', 'right', ...VITAL_ORDER.map(() => 'right')];
  const rows = [{ cells: head, align }];
  const diffRows = [{ cells: ['仓库', '总分差', '等级', ...VITAL_ORDER], align: ['left', 'right', 'left', ...VITAL_ORDER.map(() => 'right')] }];
  const widths = [22, 8, 7, 7, 8, 7, 7, 7];
  const diffWidths = [22, 8, 20, 7, 7, 8, 7, 7, 7];

  for (const { expected, report } of results) {
    rows.push({ cells: [expected.slug, report.health, ...VITAL_ORDER.map((k) => fixed(report.scores[k]))], align });

    const healthDelta = report.health === null ? null : report.health - expected.health;
    const diffs = VITAL_ORDER.map((key) => {
      const got = report.scores[key];
      if (typeof got !== 'number') return '—';
      const delta = Math.round((got - expected.scores[key]) * 10) / 10;
      return delta === 0 ? '0' : signed(delta);
    });
    diffRows.push({
      cells: [
        expected.slug,
        healthDelta === null ? '—' : signed(healthDelta),
        `${report.level.label}${report.level.label === expected.level ? '' : `（基线 ${expected.level}）`}`,
        ...diffs,
      ],
      align: ['left', 'right', 'left', ...VITAL_ORDER.map(() => 'right')],
    });

    check(`${expected.slug} 等级为「${expected.level}」`, report.level.label === expected.level, report.level.label);
    check(
      `${expected.slug} 总分偏差 ≤ ${FAIL_AT}`,
      healthDelta !== null && Math.abs(healthDelta) <= FAIL_AT,
      `实测 ${report.health} vs 基线 ${expected.health}（差 ${healthDelta}）`,
    );
    for (const key of VITAL_ORDER) {
      const got = report.scores[key];
      const delta = typeof got === 'number' ? Math.abs(got - expected.scores[key]) : Infinity;
      check(`${expected.slug} ${key} 偏差 ≤ ${FAIL_AT}`, delta <= FAIL_AT, `实测 ${got} vs 基线 ${expected.scores[key]}`);
    }
  }
  console.log(table(rows, widths));
  console.log(`\n  基线比对（实测 vs SPEC §6.5，判定阈值 ${FAIL_AT} 分）`);
  console.log(table(diffRows, diffWidths));

  console.log('\n  明细与文案抽查');
  printRepoDetails(results);
  return results;
}

/* ---------------------------------------------------------------- *
 * [4] 归档仓库专项（AC-06）
 * ---------------------------------------------------------------- */

function verifyArchived(results) {
  const target = results.find((item) => item.expected.slug === 'angular/angular.js');
  const archived = target?.bundle?.repo?.archived === true;
  check('angular/angular.js archived === true', archived, String(archived));
  check('angular/angular.js 等级 = 临床死亡', target?.report.level.label === '临床死亡', String(target?.report.level.label));
  check('angular/angular.js 健康分 ≤ 20', (target?.report.health ?? 999) <= 20, String(target?.report.health));
  for (const item of BASELINE) {
    if (item.slug === 'angular/angular.js') continue;
    const row = results.find((entry) => entry.expected.slug === item.slug);
    check(`${item.slug} 未归档`, row?.bundle?.repo?.archived === false, String(row?.bundle?.repo?.archived));
  }
  console.log('\n[4] 归档仓库专项');
  console.log(
    `  angular/angular.js archived=${archived} · health=${target?.report.health} · level=${target?.report.level.label} · 心跳=${target?.report.scores.heartbeat} · 遗嘱=${target?.report.scores.legacy}`,
  );
}

/* ---------------------------------------------------------------- *
 * [5] 降级路径：数据源失败不得被当成 0 分或 100 分
 * ---------------------------------------------------------------- */

function verifyDegrade(results) {
  const sample = results[0];
  const broken = { ...sample.bundle, issues: null, flags: { ...sample.bundle.flags, issuesFailed: true } };
  const report = analyze(broken);
  const immunity = report.vitals.find((item) => item.key === 'immunity');
  check('issues 失败 → 免疫项 score 为 null', immunity.score === null, String(immunity.score));
  check('issues 失败 → 免疫项进入 degraded', report.degraded.includes('immunity'), JSON.stringify(report.degraded));
  check('issues 失败 → 免疫项有效权重归零', immunity.effectiveWeight === 0, String(immunity.effectiveWeight));
  check('issues 失败 → 免疫项不展示伪造数值', immunity.value === null, String(immunity.value));
  check('issues 失败 → 健康分仍可算出', report.health !== null, String(report.health));
  const delta = report.health === null ? NaN : report.health - sample.report.health;
  console.log('\n[5] 降级路径：issues 取数失败后的权重归一化');
  console.log(
    `  正常 health=${sample.report.health}（免疫 ${sample.report.scores.immunity}）→ 故障 health=${report.health}（免疫 ${immunity.score}，有效权重 ${immunity.effectiveWeight}）`,
  );
  console.log(`  其余五项权重由 0.85 归一化到 1.0，健康分偏移 ${signed(delta)}，免疫项既未当成 0 分也未当成 100 分`);
}


/* ---------------------------------------------------------------- *
 * 汇总
 * ---------------------------------------------------------------- */

async function main() {
  console.log('Code ICU · 数据层回归验证');
  console.log('模块：src/js/{config,github,http,cache,vitals,copy,metrics}.js');
  console.log(
    `Token：${TOKEN ? '已提供（5000 次/小时）' : '未提供（60 次/小时，5 请求/仓库）'} · 夹具缓存：${FRESH ? '已忽略' : '15 分钟内复用'}`,
  );
  console.log(`运行时刻：${new Date().toISOString()}`);

  verifyParse();
  verifySafeUrl();
  verifyPrFilter();
  const results = await verifyRepos();
  verifyArchived(results);
  verifyDegrade(results);
  await verifyCache();

  const failed = checks.filter((item) => !item.ok);
  console.log('\n[7] 断言汇总');
  console.log(`  共 ${checks.length} 项断言，通过 ${checks.length - failed.length} 项，失败 ${failed.length} 项`);
  for (const item of failed) console.log(`  FAIL · ${item.name} → ${item.detail}`);
  console.log(failed.length ? '\n结论：FAIL（存在超阈值偏差或断言失败）' : '\n结论：PASS（全部断言通过，基线可复现）');
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error('\n验证脚本异常终止：', error);
  process.exit(2);
});
