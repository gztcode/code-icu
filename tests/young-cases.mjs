/**
 * Code ICU · 年轻项目年龄归一化的正式回归（SPEC §6.0）
 *
 * 守四件容易悄悄坏掉的事：
 *   1. 五个锚点的分数不许漂，误差 >1 分即缺陷；
 *   2. `ageMonths` 真的从 analyze() 传到了六个打分函数 —— 漏传一个就悄悄退回旧口径；
 *   3. 「样本不足」与「数据缺失」在页面上是两句话，不许合并（合并会让用户以为 API 挂了）；
 *   4. 成熟项目的分数一分不动。
 *
 * 用法（需要 8081 端口上有 tests/serve.mjs）：
 *   node tests/serve.mjs 8081 && node tests/young-cases.mjs
 */

import { chromium } from 'playwright';
import { analyze, computeHealth } from '../src/js/metrics.js';
import { loadSnapshot } from '../src/js/data/snapshots.js';
import { vitalCard } from '../src/js/components/vital-card.js';
import { renderScore } from '../src/js/components/score-ring.js';
import { patientSection } from '../src/js/components/patient.js';
import {
  DAY,
  FULL_README,
  MID_README,
  NOW,
  THIN_README,
  issueSet,
  mkCommits,
  monthsAgo,
  reportOf,
} from './young-fixtures.mjs';

const BASE = 'http://127.0.0.1:8081/';
const GH = '**/api.github.com/**';

let pass = 0;
let fail = 0;

function check(name, cond, extra = '') {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}${extra ? `  (${extra})` : ''}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${extra ? `  (${extra})` : ''}`);
  }
}

/* ---------------- 1. 五个锚点 ---------------- */

console.log('[1] 五个锚点（误差 >1 分即缺陷）');

const CASES = [
  {
    name: '开源 2 个月 / 40 次 / 1 人 / 未发版',
    spec: { months: 2, commits: mkCommits(40, { solo: 1 }, 60) },
    health: 86,
    scores: { heartbeat: 100, breathing: 100, busFactor: 68.5, metabolism: 70, immunity: null, legacy: 75 },
  },
  {
    name: '开源 3 个月 / 60 次 / 2 人 / 未发版',
    spec: { months: 3, commits: mkCommits(60, { a: 0.7, b: 0.3 }, 90), issues: issueSet(4, 10) },
    health: 90,
    scores: { heartbeat: 100, breathing: 100, busFactor: 78, metabolism: 70, immunity: 100, legacy: 75 },
  },
  {
    name: '开源 6 个月 / 120 次 / 3 人 / 已发版',
    spec: {
      months: 6,
      commits: mkCommits(120, { a: 0.5, b: 0.3, c: 0.2 }, 180),
      releases: [{ published_at: new Date(NOW.getTime() - 20 * DAY).toISOString(), tag_name: 'v0.1.0' }],
      issues: issueSet(6, 15),
      readme: FULL_README,
    },
    health: 96,
    scores: { heartbeat: 100, breathing: 100, busFactor: 77.5, metabolism: 100, immunity: 100, legacy: 100 },
  },
  {
    name: '开源 2 周 / 8 次 / 1 人 / README 极简',
    spec: { months: 0.5, commits: mkCommits(8, { solo: 1 }, 14), readme: THIN_README },
    // 需求单写的是 88，但那是算错的，反证见 [2]
    health: 80,
    scores: { heartbeat: 100, breathing: null, busFactor: 68.5, metabolism: 70, immunity: null, legacy: 60 },
  },
];

const REPORTS = CASES.map((item) => ({ ...item, report: reportOf(item.spec) }));

for (const item of REPORTS) {
  const got = item.report.scores;
  for (const [key, want] of Object.entries(item.scores)) {
    const actual = got[key];
    check(
      `${item.name} · ${key} = ${want ?? '弃权'}`,
      want === null ? actual === null : Math.abs(actual - want) <= 1,
      `实际 ${actual ?? '弃权'}`,
    );
  }
  check(`${item.name} · 总分 = ${item.health}`, Math.abs(item.report.health - item.health) <= 1, `实际 ${item.report.health}`);
}

/* ---------------- 2. 「88 不可达」的反证 ---------------- */

console.log('\n[2] 2 周那个锚点：88 在数学上不成立');
{
  const c = REPORTS[3].report;
  const perfect = computeHealth({ heartbeat: 100, breathing: 100, busFactor: 68.5, metabolism: 70, immunity: 100, legacy: 60 });
  check('六项全开也到不了 88', perfect < 88, `遗嘱固定 60 时总分上限 ${perfect}`);
  check('因此 C 的总分只能是 80', c.health === 80, `实际 ${c.health}`);
  check('总分与分项自洽（computeHealth 复算一致）', computeHealth(c.scores) === c.health);
}

/* ---------------- 3. 语义断言 ---------------- */

console.log('\n[3] 语义断言');
{
  const c = REPORTS[3].report;
  const v = Object.fromEntries(c.vitals.map((x) => [x.key, x]));
  check('ageMonths < 1 → 呼吸弃权', c.ageMonths < 1 && v.breathing.score === null, `ageMonths=${c.ageMonths}`);
  check('呼吸弃权时 insufficient 为真', v.breathing.detail.insufficient === true);
  check('呼吸弃权仍报真实提交数（不是 0）', v.breathing.detail.total === 8, `total=${v.breathing.detail.total}`);
  check('呼吸弃权项不展示主数值', v.breathing.value === null);
  check('ageMonths < 3 → 免疫弃权且 insufficient', v.immunity.detail.insufficient === true);
  check('ageDays < 30 → 不推演寿命', c.ageDays < 30 && c.remainingDays === null, `ageDays=${c.ageDays}`);
  check('弃权被正确分成两类', c.insufficient.length === 2 && c.failed.length === 0, `insufficient=${c.insufficient.join(',')}`);

  const a = Object.fromEntries(REPORTS[0].report.vitals.map((x) => [x.key, x]));
  check('README 拿到 75 的项不触发保底（只保底不封顶）', a.legacy.detail.raw === 75 && a.legacy.detail.floored === false, `raw=${a.legacy.detail.raw}`);
  check('README 极简（raw 55）→ 保底 60', v.legacy.detail.raw === 55 && v.legacy.detail.floored === true && v.legacy.score === 60, `raw=${v.legacy.detail.raw}`);
  check('呼吸单位随窗口缩放（不是「次/年」）', a.breathing.unit === '次/2 个月', `unit=${a.breathing.unit}`);
  check('依赖度带年龄宽容系数（拉到下限 0.35）', a.busFactor.detail.tolerance === 0.35);

  const b = Object.fromEntries(REPORTS[2].report.vitals.map((x) => [x.key, x]));
  check('6 个月项目免疫正常计分', b.immunity.score === 100);
  check('6 个月项目遗嘱无保底', b.legacy.detail.floored === false);
  check('6 个月项目宽容系数按 6/12 打折', b.busFactor.detail.tolerance === 0.5);
}

/* ---------------- 4. 成熟项目一分不动 ---------------- */

console.log('\n[4] 成熟项目不受影响');
{
  const repo = {
    full_name: 'old/proj',
    name: 'proj',
    owner: { login: 'old' },
    created_at: monthsAgo(60),
    pushed_at: new Date(NOW.getTime() - 2 * DAY).toISOString(),
    open_issues_count: 30,
    archived: false,
    license: { spdx_id: 'MIT' },
  };
  const bundle = {
    repo,
    commits: mkCommits(100, { a: 0.5, b: 0.3, c: 0.2 }, 300),
    releases: [{ published_at: new Date(NOW.getTime() - 15 * DAY).toISOString(), tag_name: 'v5' }],
    issues: issueSet(30, 200),
    readme: FULL_README,
    flags: {},
    fetchedAt: NOW.toISOString(),
  };
  const withAge = analyze(bundle, { now: NOW });
  const noAge = analyze({ ...bundle, repo: { ...repo, created_at: null } }, { now: NOW });
  check('建仓 5 年：六项与旧口径逐位相同', JSON.stringify(withAge.scores) === JSON.stringify(noAge.scores), `${withAge.health} vs ${noAge.health}`);
  check('读不到 created_at 时 ageMonths 为 null', noAge.ageMonths === null);

  // 示例快照是「已算好的结果」（loadSnapshot 返回的就是 analyze 的返回值形状），
  // 不能再喂回 analyze。这里守的是「快照没被算法变更顺手重算过」，
  // 真正的「线上重拉一遍还是这个数」在 tests/verify.mjs [3] 里跑，那边才碰网络。
  const BASE_TABLE = {
    'expressjs/express': [87, { heartbeat: 100, breathing: 80, busFactor: 97.3, metabolism: 100, immunity: 40.6, legacy: 100 }],
    'moment/moment': [69, { heartbeat: 95.7, breathing: 66.7, busFactor: 53.7, metabolism: 89, immunity: 23.2, legacy: 90 }],
    'request/request': [16, { heartbeat: 0, breathing: 0, busFactor: 20, metabolism: 45, immunity: 0, legacy: 70 }],
  };
  for (const [slug, [want, wantScores]] of Object.entries(BASE_TABLE)) {
    const snap = loadSnapshot(slug);
    check(`示例快照 ${slug} 健康分 = ${want}`, snap?.health === want, `实际 ${snap?.health}`);
    const same = Object.entries(wantScores).every(([key, value]) => snap?.scores?.[key] === value);
    check(`示例快照 ${slug} 六项与基线逐位一致`, same, JSON.stringify(snap?.scores ?? null));
    check(`示例快照 ${slug} 总分与六项自洽`, computeHealth(snap.scores) === snap.health);
  }
}

/* ---------------- 5. 组件级渲染 ---------------- */

console.log('\n[5] 组件渲染（纯函数，不开浏览器）');
{
  const c = REPORTS[3].report;
  const immunity = c.vitals.find((x) => x.key === 'immunity');
  const html = vitalCard(immunity);
  check('免疫弃权卡写「样本不足」', html.includes('样本不足'));
  check('免疫弃权卡不写「数据缺失」', !html.includes('数据缺失'));
  check('免疫弃权卡分数仍是破折号', html.includes('>—</b>'));
  check('免疫弃权卡没有假进度条', !html.includes('<i class="on"></i>'));
  check('免疫弃权卡写清为什么弃权', html.includes('不可能存在'));
  check('免疫弃权卡权重显示 0%', html.includes('权重 0%'));

  const failedHtml = vitalCard({
    ...immunity,
    score: null,
    effectiveWeight: 0,
    // diagnosis 也要换成失败分支的说法，否则卡里还留着「样本不足」四个字
    diagnosis: '这一次没取到 issue 数据，无法判断免疫状态，已弃权',
    detail: { score: null, open: 0, stale: 0, staleRatio: 0, backlog: 0, penalty: 0, base: 0 },
  });
  check('取数失败卡写「数据缺失」', failedHtml.includes('数据缺失'));
  check('取数失败卡不写「样本不足」', !failedHtml.includes('样本不足'));

  const scoreHtml = renderScore(c);
  check('健康分卡说「样本不足而弃权」', scoreHtml.includes('项因建仓时间太短、样本不足而弃权'));
  check('健康分卡不把样本不足说成取数失败', !scoreHtml.includes('取数失败已弃权'));
  check('寿命推演为 null 时给出原因', scoreHtml.includes('建仓不足 30 天，样本太短，暂不推演。'));
  check('公式说明仍保留且注明不是预言', scoreHtml.includes('不是预言') && scoreHtml.includes('1/(1+停更天数/180)'));

  const patientHtml = patientSection(c);
  check('患者档案显示建仓年龄', patientHtml.includes('建仓 / CREATED') && patientHtml.includes('0.5 个月'));
  check('建仓年龄独占网格一行', patientHtml.includes('meta-item meta-wide'));
}

/* ---------------- 6. 真页面 ---------------- */

console.log('\n[6] 真页面（Playwright 伪造 GitHub 响应，零真实网络）');
{
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1200, height: 1600 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  const wall = new Date();
  const commits = mkCommits(8, { solo: 1 }, 14, wall);
  await page.route(GH, (route) => {
    const url = route.request().url();
    if (/\/commits\?/.test(url)) return route.fulfill({ json: commits });
    if (/\/releases\?/.test(url)) return route.fulfill({ json: [] });
    if (/\/issues\?/.test(url)) return route.fulfill({ json: [] });
    // README 用 500 而不是 404：404 在契约里是「仓库确实没有 README」，
    // 500 才是「这一次没取到」，正好验证两种弃权在同一页上不打架。
    if (/\/readme$/.test(url)) return route.fulfill({ status: 500, json: { message: 'boom' } });
    if (/\/repos\/young\/proj$/.test(url)) {
      return route.fulfill({
        json: {
          full_name: 'young/proj',
          name: 'proj',
          owner: { login: 'young' },
          description: '一个刚起步的库',
          language: 'TypeScript',
          stargazers_count: 12,
          forks_count: 2,
          open_issues_count: 0,
          created_at: monthsAgo(0.5, wall),
          pushed_at: wall.toISOString(),
          archived: false,
          license: { spdx_id: 'MIT' },
          default_branch: 'main',
        },
      });
    }
    return route.fulfill({ status: 404, json: { message: 'Not Found' } });
  });

  await page.goto('about:blank');
  await page.goto(`${BASE}#/r/young/proj`, { waitUntil: 'load' });
  await page.waitForSelector('#vital-immunity', { timeout: 20000 });

  const text = (selector) => page.evaluate((sel) => document.querySelector(sel)?.innerText ?? '', selector);
  const immunityCard = await text('#vital-immunity');
  const legacyCard = await text('#vital-legacy');
  check('页面免疫项写「样本不足」', immunityCard.includes('样本不足'));
  check('页面免疫项不写「数据缺失」', !immunityCard.includes('数据缺失'));
  check('同页遗嘱项写「数据缺失」（取数失败）', legacyCard.includes('数据缺失'));
  check('遗嘱项没被误说成样本不足', !legacyCard.includes('样本不足'));

  const note = await text('.vital-note');
  check('体征列表上方有年龄归一化说明', note.includes('已按实际存在时长归一化'), note.slice(0, 30));
  check('说明是中性提示不是警告条', await page.evaluate(() => !!document.querySelector('.vital-note .ic')));
  const ageCell = await text('.meta-item.meta-wide .meta-v');
  check('患者档案显示「0.5 个月」', ageCell === '0.5 个月', ageCell);

  const prognosis = await page.evaluate(() =>
    [...document.querySelectorAll('.prognosis .pg-note')].map((n) => n.innerText).join(' | '),
  );
  check('预后区说清为什么不推演', prognosis.includes('建仓不足 30 天'), prognosis.slice(0, 40));

  await page.setViewportSize({ width: 375, height: 812 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('375 无横向滚动', overflow <= 0, `溢出 ${overflow}px`);
  check('无 JS 报错', errors.length === 0, errors.join(' / '));

  await browser.close();
}

console.log(`\n合计 ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exitCode = 1;
