/**
 * Code ICU · 病史时间轴
 *
 * 病历的最后一页总是「既往史」。这里只放四个真实日期/区间，全部来自 API 字段或由它们算出的量，
 * 一个都不编：谁在什么时候推的、什么时候发的版、这一年怎么干的活、哪天建的档。
 * @module components/timeline
 */

import { esc, fmtDate, num } from '../dom.js';

/**
 * 建档至今有多久。用自然年月差，不用「几百天」—— 十七年四个月比 6330 天更有体感。
 * @param {string|null} createdAt
 * @param {Date} now
 * @returns {string}
 */
function projectAge(createdAt, now) {
  if (!createdAt) return '';
  const start = new Date(createdAt);
  if (Number.isNaN(start.getTime())) return '';
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `项目年龄 ${rest} 个月`;
  return `项目年龄 ${years} 年${rest ? ` ${rest} 个月` : ''}`;
}

/**
 * 渲染病史区块。
 * @param {object} result analyze() 或 loadSnapshot() 的返回值
 * @param {Date} [now]
 * @returns {string} HTML
 */
export function renderHistory(result, now = new Date()) {
  const { timeline, vitals } = result;
  const detail = (key) => vitals.find((item) => item.key === key)?.detail ?? {};
  const breathing = detail('breathing');
  const bus = detail('busFactor');
  const metabolism = detail('metabolism');

  /** @type {Array<{date: string, label: string, desc: string, now?: boolean}>} */
  const items = [];

  if (timeline.lastCommitAt) {
    const days = detail('heartbeat').days;
    const tone =
      days <= 7 ? '人还在，而且手很稳' : days <= 90 ? '还在动，只是慢下来了' : '这个仓库已经很久没人碰了';
    items.push({
      date: fmtDate(timeline.lastCommitAt),
      label: '最近一次提交',
      desc: `推送到默认分支。距今 ${num(days)} 天，${tone}。`,
      now: true,
    });
  }

  if (timeline.lastReleaseAt) {
    items.push({
      date: fmtDate(timeline.lastReleaseAt),
      label: '最近一次发版',
      desc: `${timeline.lastReleaseTag ?? '无版本号'}。近 12 个月共 ${num(metabolism.recentCount ?? 0)} 个版本。`,
    });
  } else {
    items.push({ date: '从未', label: '发版记录', desc: '这个仓库从来没有发布过正式版本，代谢只能按中性分计。' });
  }

  const emptyMonths = (breathing.monthly ?? []).filter((n) => n === 0).length;
  items.push({
    date: '近 12 个月',
    label: '工作量分布',
    desc: `${num(breathing.total)} 次提交，${num(bus.authors)} 位作者。单人最高占比 ${(bus.maxShare * 100).toFixed(1)}%，${
      emptyMonths === 0 ? '没有任何一个月是空心的' : `其中 ${emptyMonths} 个月一次提交都没有`
    }。`,
  });

  if (timeline.createdAt) {
    items.push({
      date: fmtDate(timeline.createdAt),
      label: '建档',
      desc: `第一次提交。${projectAge(timeline.createdAt, now)}。`,
    });
  }

  const from = timeline.createdAt ? fmtDate(timeline.createdAt).slice(0, 4) : '—';
  const to = String(now.getFullYear());

  return `<section class="history">
      <div class="sec-h">
        <h2>病史</h2>
        <span class="num">${from} → ${to}</span>
      </div>
      <ul class="tl">
        ${items
          .map(
            (item) => `<li${item.now ? ' class="now"' : ''}>
          <div><span class="tl-date">${esc(item.date)}</span><span class="tl-label">${esc(item.label)}</span></div>
          <p class="tl-desc">${esc(item.desc)}</p>
        </li>`,
          )
          .join('')}
      </ul>
    </section>`;
}
