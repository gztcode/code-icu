#!/usr/bin/env node
/**
 * Code ICU · 示例快照生成器
 *
 * 把 tests/.cache 里的真实 API 夹具跑一遍 analyze()，固化成 src/js/data/snapshots.js。
 * 三个示例按钮和断网兜底都读这份快照：零请求、零等待、零额度消耗。
 *
 * 用法：node tests/build-snapshots.mjs
 * 前置：node tests/verify.mjs 跑过一次（会写 tests/.cache）
 *
 * 只保留视图渲染真正需要的字段：静态的 label / weight / formula 不落盘，
 * 由数据层（config.js / copy.js）在读取时补齐，改文案不需要重新生成快照。
 * @module tests/build-snapshots
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEMO_REPOS } from '../src/js/config.js';
import { analyze } from '../src/js/metrics.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE_DIR = path.join(ROOT, 'tests', '.cache');
const OUT = path.join(ROOT, 'src', 'js', 'data', 'snapshots.js');

/** 患者档案卡要展示的仓库字段（与 http.trimRepo 同名） */
const REPO_FIELDS = [
  'full_name', 'name', 'description', 'html_url', 'language', 'default_branch',
  'stargazers_count', 'forks_count', 'open_issues_count', 'pushed_at', 'created_at', 'archived',
];

/** @param {string} slug */
const fixturePath = (slug) => path.join(CACHE_DIR, `${slug.replace(/[^\w.-]+/g, '_')}.json`);

/** @param {{owner: string}} owner @param {object} repo */
function pickRepo(repo) {
  const out = {};
  for (const key of REPO_FIELDS) out[key] = repo?.[key] ?? null;
  out.owner = {
    login: repo?.owner?.login ?? null,
    html_url: repo?.owner?.html_url ?? null,
    avatar_url: repo?.owner?.avatar_url ?? null,
  };
  out.license = repo?.license ? { spdx_id: repo.license.spdx_id ?? null } : null;
  return out;
}

/** @param {object} report */
function compact(report) {
  return {
    health: report.health,
    level: report.level,
    remainingDays: report.remainingDays,
    daysSincePush: report.daysSincePush,
    repo: pickRepo(report.repo),
    timeline: report.timeline,
    /** README 第一屏是否自述废弃。通知书的主诉要用它，快照不带上就只剩「零提交」一句。 */
    readmeDeprecated: report.readmeDeprecated,
    scores: report.scores,
    vitals: report.vitals.map((vital) => ({
      key: vital.key,
      score: vital.score,
      value: vital.value,
      unit: vital.unit,
      diagnosis: vital.diagnosis,
      detail: vital.detail,
    })),
  };
}

/** @param {unknown} value */
const inline = (value) => JSON.stringify(value);

/** @param {object} snapshot */
function emit(snapshot) {
  const lines = ['  {'];
  lines.push(`    slug: ${inline(snapshot.slug)},`);
  lines.push(`    tag: ${inline(snapshot.tag)},`);
  lines.push(`    expectHealth: ${snapshot.expectHealth},`);
  lines.push(`    fetchedAt: ${inline(snapshot.fetchedAt)},`);
  lines.push(`    health: ${snapshot.health},`);
  lines.push(`    level: ${inline(snapshot.level)},`);
  lines.push(`    remainingDays: ${snapshot.remainingDays},`);
  lines.push(`    daysSincePush: ${snapshot.daysSincePush},`);
  lines.push(`    repo: ${inline(snapshot.repo)},`);
  lines.push(`    timeline: ${inline(snapshot.timeline)},`);
  lines.push(`    readmeDeprecated: ${inline(snapshot.readmeDeprecated)},`);
  lines.push(`    scores: ${inline(snapshot.scores)},`);
  lines.push('    vitals: [');
  for (const vital of snapshot.vitals) lines.push(`      ${inline(vital)},`);
  lines.push('    ],');
  lines.push('  },');
  return lines.join('\n');
}

async function main() {
  const snapshots = [];
  for (const demo of DEMO_REPOS) {
    const raw = await readFile(fixturePath(demo.slug), 'utf8');
    const bundle = JSON.parse(raw);
    // 用采集时刻当参照时间：同一条夹具无论哪天重跑，快照数字都完全一致
    const report = analyze(bundle, { now: new Date(bundle.fetchedAt) });
    if (report.health !== demo.expectHealth) {
      throw new Error(
        `快照分数与基线不符：${demo.slug} 实算 ${report.health}，基线 ${demo.expectHealth}。` +
          `请先跑 node tests/verify.mjs --fresh 更新夹具。`,
      );
    }
    snapshots.push({ slug: demo.slug, tag: demo.tag, expectHealth: demo.expectHealth, fetchedAt: bundle.fetchedAt, ...compact(report) });
    console.log(`  ${demo.slug.padEnd(20)} health=${report.health}  ${report.level.label}`);
  }

  const header = `/**
 * Code ICU · 示例仓库快照
 *
 * 由 \`node tests/build-snapshots.mjs\` 从真实 GitHub API 夹具生成，**不要手改数字**。
 * 三个示例按钮和断网兜底都读这里：零请求、零等待、不消耗限流额度。
 *
 * 每条快照是 analyze() 的完整结果，只剔除了静态字段（label / weight / formula），
 * 读取时由 loadSnapshot 从 config.js / copy.js 补齐 —— 改文案不需要重新生成快照。
 * \`fetchedAt\` 是数据采集时刻，页面必须标注「示例数据 · 采集于 X」。
 *
 * 基线校验：tests/build-snapshots.mjs 生成时断言 health 与 DEMO_REPOS.expectHealth 一致。
 * @module data/snapshots
 */

import { VITAL_LABELS, WEIGHTS } from '../config.js';
import { FORMULAS } from '../copy.js';

`;

  const footer = `
/**
 * 按 slug 取一份原始快照。
 * @param {string} slug \`owner/repo\`
 * @returns {object|undefined}
 */
export function findSnapshot(slug) {
  return SNAPSHOTS.find((item) => item.slug === slug);
}

/**
 * 取一份可直接渲染的体检结果：结构与 analyze() 的返回值完全相同，
 * 只是 label / weight / formula 这些静态字段从数据层现场补齐。
 * @param {string} slug \`owner/repo\`
 * @returns {object|null} 无此快照时返回 null
 */
export function loadSnapshot(slug) {
  const raw = findSnapshot(slug);
  if (!raw) return null;
  const presentWeight = Object.keys(WEIGHTS).reduce(
    (sum, key) => (raw.scores[key] === null ? sum : sum + WEIGHTS[key]),
    0,
  );
  return {
    ...raw,
    isSnapshot: true,
    analyzedAt: raw.fetchedAt,
    vitals: raw.vitals.map((vital) => ({
      ...vital,
      label: VITAL_LABELS[vital.key],
      weight: WEIGHTS[vital.key],
      effectiveWeight:
        presentWeight > 0 && vital.score !== null
          ? Math.round((WEIGHTS[vital.key] / presentWeight) * 1000) / 1000
          : 0,
      formula: FORMULAS[vital.key],
    })),
  };
}

/**
 * 首页三个示例按钮的清单。
 * @returns {Array<{slug: string, tag: string, health: number|null, level: object}>}
 */
export function demoCases() {
  return SNAPSHOTS.map((item) => ({ slug: item.slug, tag: item.tag, health: item.health, level: item.level }));
}
`;

  const body = `/** @type {Array<object>} */\nexport const SNAPSHOTS = [\n${snapshots.map(emit).join('\n')}\n];\n`;
  await writeFile(OUT, header + body + footer, 'utf8');
  console.log(`\n已写入 ${path.relative(ROOT, OUT)}（${snapshots.length} 条快照）`);
}

main().catch((error) => {
  console.error('生成失败：', error.message);
  process.exit(1);
});
