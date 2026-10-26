/**
 * Code ICU · 示例仓库快照
 *
 * 由 `node tests/build-snapshots.mjs` 从真实 GitHub API 夹具生成，**不要手改数字**。
 * 三个示例按钮和断网兜底都读这里：零请求、零等待、不消耗限流额度。
 *
 * 每条快照是 analyze() 的完整结果，只剔除了静态字段（label / weight / formula），
 * 读取时由 loadSnapshot 从 config.js / copy.js 补齐 —— 改文案不需要重新生成快照。
 * `fetchedAt` 是数据采集时刻，页面必须标注「示例数据 · 采集于 X」。
 *
 * 基线校验：tests/build-snapshots.mjs 生成时断言 health 与 DEMO_REPOS.expectHealth 一致。
 * @module data/snapshots
 */

import { VITAL_LABELS, WEIGHTS } from '../config.js';
import { FORMULAS } from '../copy.js';

/** @type {Array<object>} */
export const SNAPSHOTS = [
  {
    slug: "expressjs/express",
    tag: "健康的对照样本",
    expectHealth: 87,
    fetchedAt: "2026-10-26T06:56:40.777Z",
    health: 87,
    level: {"level":"healthy","label":"健康","tone":"healthy","summary":"各项体征平稳，可放心接入"},
    remainingDays: 314,
    daysSincePush: 2,
    repo: {"full_name":"expressjs/express","name":"express","description":"Fast, unopinionated, minimalist web framework for node.","html_url":"https://github.com/expressjs/express","language":"JavaScript","default_branch":"master","stargazers_count":69581,"forks_count":25273,"open_issues_count":253,"pushed_at":"2026-10-23T21:21:08Z","created_at":"2009-06-26T18:56:01Z","archived":false,"owner":{"login":"expressjs","html_url":"https://github.com/expressjs","avatar_url":"https://avatars.githubusercontent.com/u/5658226?v=4"},"license":{"spdx_id":"MIT"}},
    timeline: {"createdAt":"2009-06-26T18:56:01Z","lastCommitAt":"2026-10-23T21:21:08Z","lastReleaseAt":"2026-10-09T12:50:31Z","lastReleaseTag":"v5.3.0"},
    readmeDeprecated: false,
    scores: {"heartbeat":100,"breathing":80,"busFactor":97.3,"metabolism":100,"immunity":40.6,"legacy":100},
    vitals: [
      {"key":"heartbeat","score":100,"value":2,"unit":"天未提交","diagnosis":"最近一次提交在 2 天前，心跳强劲且规律","detail":{"score":100,"days":2,"archived":false}},
      {"key":"breathing","score":80,"value":96,"unit":"次/年","diagnosis":"近 12 个月提交 96 次，前后半年节奏一致，呼吸平稳","detail":{"score":80,"monthly":[9,9,15,11,5,4,6,7,5,5,10,10],"capped":false,"last6":43,"prev6":53,"trend":0,"total":96,"ratio":0.81,"windowMonths":12,"expected":120}},
      {"key":"busFactor","score":97.3,"value":12,"unit":"%单人提交","diagnosis":"43 位作者分担，单人最高只有 12%，后备力量充足","detail":{"score":97.3,"authors":43,"total":59,"maxShare":0.11864406779661017,"topAuthor":"bjohansebas","topCount":7,"bonus":8,"tolerance":1}},
      {"key":"metabolism","score":100,"value":16,"unit":"天未发版","diagnosis":"最新版本 v5.3.0 发布于 16 天前，代谢旺盛","detail":{"score":100,"days":16,"base":100,"bonus":10,"recentCount":6,"tag":"v5.3.0"}},
      {"key":"immunity","score":40.6,"value":51,"unit":"%僵尸","diagnosis":"抽样 35 个未关闭 issue，其中 51% 已成僵尸，响应能力下滑，另有 253 个待处理项积压","detail":{"score":40.6,"open":35,"stale":18,"staleRatio":0.5142857142857142,"backlog":253,"penalty":-8,"base":48.6,"insufficient":false}},
      {"key":"legacy","score":100,"value":10372,"unit":"字","diagnosis":"许可证、README、安装与使用说明齐备，后事交代得很清楚","detail":{"score":100,"items":[{"label":"许可证","points":40,"hit":true},{"label":"README","points":15,"hit":true},{"label":"README 超过 1500 字","points":10,"hit":true},{"label":"安装说明","points":10,"hit":true},{"label":"使用说明","points":10,"hit":true},{"label":"许可声明","points":10,"hit":true},{"label":"状态徽章","points":5,"hit":true},{"label":"仓库已归档","points":0,"hit":false}],"raw":100,"chars":10372,"floored":false}},
    ],
  },
  {
    slug: "moment/moment",
    tag: "中年危机",
    expectHealth: 69,
    fetchedAt: "2026-10-26T06:56:45.196Z",
    health: 69,
    level: {"level":"ward","label":"住院观察","tone":"ward","summary":"多项体征恶化，接手前需评估成本"},
    remainingDays: 230,
    daysSincePush: 17,
    repo: {"full_name":"moment/moment","name":"moment","description":"Parse, validate, manipulate, and display dates in javascript.","html_url":"https://github.com/moment/moment","language":"JavaScript","default_branch":"develop","stargazers_count":47884,"forks_count":6973,"open_issues_count":60,"pushed_at":"2026-10-08T16:26:56Z","created_at":"2011-03-01T02:46:06Z","archived":false,"owner":{"login":"moment","html_url":"https://github.com/moment","avatar_url":"https://avatars.githubusercontent.com/u/4129662?v=4"},"license":{"spdx_id":"MIT"}},
    timeline: {"createdAt":"2011-03-01T02:46:06Z","lastCommitAt":"2026-10-08T16:26:56Z","lastReleaseAt":"2026-09-15T01:10:04Z","lastReleaseTag":"2.31.0"},
    readmeDeprecated: false,
    scores: {"heartbeat":95.7,"breathing":66.7,"busFactor":53.7,"metabolism":89,"immunity":23.2,"legacy":90},
    vitals: [
      {"key":"heartbeat","score":95.7,"value":17,"unit":"天未提交","diagnosis":"最近一次提交在 17 天前，编译节奏正常","detail":{"score":95.7,"days":17,"archived":false}},
      {"key":"breathing","score":66.7,"value":68,"unit":"次/年","diagnosis":"近 12 个月提交 68 次，且后半年比前半年更活跃，呼吸在加深","detail":{"score":66.7,"monthly":[0,0,0,0,0,0,0,0,7,44,15,2],"capped":false,"last6":68,"prev6":0,"trend":10,"total":68,"ratio":null,"windowMonths":12,"expected":120}},
      {"key":"busFactor","score":53.7,"value":60,"unit":"%单人提交","diagnosis":"最高产的 mattjohnsonpint 占 60% 的提交，作者结构偏集中","detail":{"score":53.7,"authors":21,"total":68,"maxShare":0.6029411764705882,"topAuthor":"mattjohnsonpint","topCount":41,"bonus":8,"tolerance":1}},
      {"key":"metabolism","score":89,"value":41,"unit":"天未发版","diagnosis":"最新版本 2.31.0 发布于 41 天前，发版节奏正常","detail":{"score":89,"days":41,"base":85,"bonus":4,"recentCount":2,"tag":"2.31.0"}},
      {"key":"immunity","score":23.2,"value":74,"unit":"%僵尸","diagnosis":"抽样 42 个未关闭 issue，其中 74% 已成僵尸，响应能力下滑，另有 60 个待处理项积压","detail":{"score":23.2,"open":42,"stale":31,"staleRatio":0.7380952380952381,"backlog":60,"penalty":-3,"base":26.2,"insufficient":false}},
      {"key":"legacy","score":90,"value":3715,"unit":"字","diagnosis":"缺使用说明，交接给下一个人时会卡在这里","detail":{"score":90,"items":[{"label":"许可证","points":40,"hit":true},{"label":"README","points":15,"hit":true},{"label":"README 超过 1500 字","points":10,"hit":true},{"label":"安装说明","points":10,"hit":true},{"label":"使用说明","points":0,"hit":false},{"label":"许可声明","points":10,"hit":true},{"label":"状态徽章","points":5,"hit":true},{"label":"仓库已归档","points":0,"hit":false}],"raw":90,"chars":3715,"floored":false}},
    ],
  },
  {
    slug: "request/request",
    tag: "已经凉了很久",
    expectHealth: 16,
    fetchedAt: "2026-10-26T06:56:49.636Z",
    health: 16,
    level: {"level":"dead","label":"临床死亡","tone":"dead","summary":"已无生命体征，仅作史料"},
    remainingDays: 11,
    daysSincePush: 803,
    repo: {"full_name":"request/request","name":"request","description":"🏊🏾 Simplified HTTP request client.","html_url":"https://github.com/request/request","language":"JavaScript","default_branch":"master","stargazers_count":25487,"forks_count":3135,"open_issues_count":145,"pushed_at":"2024-08-14T00:09:41Z","created_at":"2011-01-23T01:25:14Z","archived":false,"owner":{"login":"request","html_url":"https://github.com/request","avatar_url":"https://avatars.githubusercontent.com/u/730467?v=4"},"license":{"spdx_id":"Apache-2.0"}},
    timeline: {"createdAt":"2011-01-23T01:25:14Z","lastCommitAt":"2024-08-14T00:09:41Z","lastReleaseAt":null,"lastReleaseTag":null},
    readmeDeprecated: true,
    scores: {"heartbeat":0,"breathing":0,"busFactor":20,"metabolism":45,"immunity":0,"legacy":70},
    vitals: [
      {"key":"heartbeat","score":0,"value":803,"unit":"天未提交","diagnosis":"已经 803 天没有提交，心跳停止","detail":{"score":0,"days":803,"archived":false}},
      {"key":"breathing","score":0,"value":0,"unit":"次/年","diagnosis":"近 12 个月零提交，呼吸完全停止","detail":{"score":0,"monthly":[0,0,0,0,0,0,0,0,0,0,0,0],"capped":false,"last6":0,"prev6":0,"trend":-10,"total":0,"ratio":null,"windowMonths":12,"expected":120}},
      {"key":"busFactor","score":20,"value":0,"unit":"%单人提交","diagnosis":"近 12 个月无人提交，这段代码已经没有主人在管","detail":{"score":20,"authors":0,"total":0,"maxShare":0,"topAuthor":null,"topCount":0,"bonus":0,"tolerance":1}},
      {"key":"metabolism","score":45,"value":null,"unit":"天未发版","diagnosis":"从未发布过正式版本，这一项按无记录折算","detail":{"score":45,"days":null,"base":45,"bonus":0,"recentCount":0,"tag":null,"youngExempt":false}},
      {"key":"immunity","score":0,"value":98,"unit":"%僵尸","diagnosis":"抽样 92 个未关闭 issue，其中 98% 超过 90 天无人响应，问题在腐烂，另有 145 个待处理项积压","detail":{"score":0,"open":92,"stale":90,"staleRatio":0.9782608695652174,"backlog":145,"penalty":-3,"base":2.2,"insufficient":false}},
      {"key":"legacy","score":70,"value":46374,"unit":"字","diagnosis":"缺安装说明、使用说明，交接给下一个人时会卡在这里","detail":{"score":70,"items":[{"label":"许可证","points":40,"hit":true},{"label":"README","points":15,"hit":true},{"label":"README 超过 1500 字","points":10,"hit":true},{"label":"安装说明","points":0,"hit":false},{"label":"使用说明","points":0,"hit":false},{"label":"许可声明","points":0,"hit":false},{"label":"状态徽章","points":5,"hit":true},{"label":"仓库已归档","points":0,"hit":false}],"raw":70,"chars":46374,"floored":false}},
    ],
  },
];

/**
 * 按 slug 取一份原始快照。
 * @param {string} slug `owner/repo`
 * @returns {object|undefined}
 */
export function findSnapshot(slug) {
  return SNAPSHOTS.find((item) => item.slug === slug);
}

/**
 * 取一份可直接渲染的体检结果：结构与 analyze() 的返回值完全相同，
 * 只是 label / weight / formula 这些静态字段从数据层现场补齐。
 * @param {string} slug `owner/repo`
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
