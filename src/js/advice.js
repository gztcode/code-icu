/**
 * Code ICU · 治疗建议
 *
 * 建议不是模板文案，是从六项读数里长出来的：哪一项拖后腿、拖到多少分、
 * 把它拉到目标分之后健康分会变成几分——最后这个数字用 computeHealth 现场重算，
 * 不是画饼。所以「免疫从 40.6 拉到 70，健康分能到 88」这句话是可以被验算的。
 * @module advice
 */

import { computeHealth } from './metrics.js';
import { esc, num } from './dom.js';

/** 各项建议里「如果这一项做到几分」的目标值，全部取分档表上的整数台阶 */
const TARGET = { heartbeat: 95, breathing: 85, busFactor: 85, metabolism: 85, immunity: 70, legacy: 100 };

/**
 * 假设某一项做到目标分后，健康分会变成多少（权重不变，其余项不动）。
 * @param {object} result
 * @param {string} key
 * @returns {number|null}
 */
function healthIf(result, key) {
  const scores = { ...result.scores, [key]: TARGET[key] };
  return computeHealth(scores);
}

/**
 * 「如果这一项做到 X 分」这句话。目标分已经达到就不说。
 * @param {object} result
 * @param {object} vital
 * @returns {string}
 */
function liftSentence(result, vital) {
  const target = TARGET[vital.key];
  if (typeof vital.score !== 'number' || vital.score >= target) return '';
  const next = healthIf(result, vital.key);
  if (next === null) return '';
  return ` 这一项做到 ${target} 分，按同样权重算，健康分会从 ${result.health} 变成 ${next}。`;
}

/**
 * 按体征生成候选建议。顺序即优先级，report 取前三条。
 * @param {object} result
 * @returns {Array<{pri: 'P0'|'P1'|'P2', title: string, body: string}>}
 */
export function adviceList(result) {
  const { vitals, health } = result;
  const get = (key) => vitals.find((item) => item.key === key);
  /** @type {Array<{pri: 'P0'|'P1'|'P2', title: string, body: string}>} */
  const out = [];

  const heartbeat = get('heartbeat');
  const breathing = get('breathing');
  const bus = get('busFactor');
  const metabolism = get('metabolism');
  const immunity = get('immunity');
  const legacy = get('legacy');

  // P0：项目事实上已经停摆，先说实话
  if (heartbeat && (heartbeat.detail.archived || heartbeat.detail.days > 365)) {
    out.push({
      pri: 'P0',
      title: heartbeat.detail.archived ? '仓库已归档，别再当成在维护的项目' : `已经 ${num(heartbeat.detail.days)} 天没有提交`,
      body:
        '心跳 0 分，这是六项里唯一没法靠流程补救的一项——要么有人回来接着写，要么把仓库标记为 archived，' +
        '让下游一眼知道它不会再有更新。让一个停更的项目看起来还在维护，比停更本身更危险。',
    });
  }
  if (breathing && breathing.detail.total === 0) {
    out.push({
      pri: 'P0',
      title: '近 12 个月零提交，README 与现状已经对不上',
      body:
        '呼吸 0 分。一个一年没有任何提交的仓库，README 里任何「持续维护」的表述都是误导。' +
        '把状态说明挪到文档第一屏，比继续留着 issue 模板和 PR 欢迎语更诚实。',
    });
  }

  // P1：单项明显拖后腿，但改得动
  if (immunity && typeof immunity.score === 'number' && immunity.score < 70 && immunity.detail.open > 0) {
    const pct = (immunity.detail.staleRatio * 100).toFixed(1);
    out.push({
      pri: 'P1',
      title: `把 ${num(immunity.detail.stale)} 条僵尸 issue 清一轮`,
      body:
        `${num(immunity.detail.stale)} 条超过 90 天没人动，占了 ${pct}%。这是六项里最能靠流程改掉的一项：` +
        '给陈旧的批量打上 <code>status:stale</code>，重复的直接关，剩下的标注在等谁回复。' +
        `${liftSentence(result, immunity)}`,
    });
  }
  if (bus && typeof bus.score === 'number' && bus.score < 70 && bus.detail.total > 0) {
    out.push({
      pri: 'P1',
      title: `别让 ${esc(bus.detail.topAuthor ?? '一个人')} 一个人扛 ${(bus.detail.maxShare * 100).toFixed(1)}% 的提交`,
      body:
        `${num(bus.detail.authors)} 位作者，最高产的那位占了 ${(bus.detail.maxShare * 100).toFixed(1)}%。` +
        '这个数字靠「人多」是压不下去的，得靠制度：加一份 <code>CODEOWNERS</code>，把核心目录绑定到具体的人。' +
        `${liftSentence(result, bus)}`,
    });
  }

  // P2：可以改，但影响面小
  if (metabolism && metabolism.detail.days !== null && metabolism.detail.days > 180) {
    out.push({
      pri: 'P2',
      title: `已经 ${num(metabolism.detail.days)} 天没有发版`,
      body:
        '代谢拖慢不会立刻出事，但它让下游没法判断自己用的是哪一版。' +
        '哪怕只是把当前主干打一个 tag、写两行变更说明，也比不发声强。' +
        `${liftSentence(result, metabolism)}`,
    });
  }
  if (legacy && typeof legacy.score === 'number' && legacy.score < 100) {
    const missing = (legacy.detail.items ?? [])
      .filter((item) => !item.hit && item.label !== '仓库已归档')
      .map((item) => item.label);
    if (missing.length) {
      out.push({
        pri: 'P2',
        title: `README 缺${esc(missing.slice(0, 2).join('、'))}`,
        body:
          `${esc(legacy.diagnosis)}。遗嘱这一项是六项里最难造假的：章节类加分只认标题行，` +
          '正文里随便提一句 install 不算。补三个小标题就能拿满，性价比最高。' +
          `${liftSentence(result, legacy)}`,
      });
    }
  }

  // 已经健康的项目：给一条「别再刷分」的逆向建议，比空着或者编一条凑数诚实
  if (typeof health === 'number' && health >= 85) {
    out.push({
      pri: 'P2',
      title: '心跳和呼吸都不缺，别再为了刷分加量',
      body:
        `健康分 ${num(health)}，提交节奏与发版节奏都在满分区间。继续堆提交的边际收益接近零，` +
        '真正的风险反而在别处：把支持窗口、EOL 日期和升级路径写进 <code>README</code>，' +
        '比多发两个 patch 更能减少下游的恐慌。',
    });
  }

  if (out.length === 0) {
    out.push({
      pri: 'P2',
      title: '没有哪一项单独拖后腿，先把结论复制下来留档',
      body:
        `健康分 ${num(health)}，六项里没有明显短板，也没有一条能靠一次动作改出大分差的地方。` +
        '下一步值得做的是盯趋势：三个月后再体检一次，比较同一项的分数走向，比看单次分数更有意义。',
    });
  }

  const rank = { P0: 0, P1: 1, P2: 2 };
  return out.sort((a, b) => rank[a.pri] - rank[b.pri]).slice(0, 3);
}

/**
 * 建议区右上角那句备注。用等级判词，不用「有 3 条建议」这种空话。
 * @param {number} count
 * @param {object} level classify() 的返回值
 * @returns {string}
 */
export function adviceNote(count, level) {
  const note = {
    healthy: '无需住院',
    clinic: '门诊随访即可',
    ward: '建议住院观察',
    icu: '需进 ICU 监护',
    dead: '已无抢救价值',
    unknown: '数据不足',
  }[level?.level] ?? '';
  return `${count} 条 · ${note}`;
}
