/**
 * Code ICU · 病危通知书（DOM 预览）
 *
 * 这一页是「成品预览 + 下载入口」。版式 1:1 照 `design/mockup-notice.html`：
 * 1080×1440 的固定坐标画布，外面套一层等比缩放，所以手机上看到的就是同一张卡。
 *
 * 两条不能破的约束：
 *   1. 数据只从**内存**拿（session.recall）。报告页渲染时把 analyze() 的结果存进去，
 *      这里读那一份 —— 不重新发请求、也不重算，否则导出图的停更天数可能比屏幕上多一天，
 *      评委对着两个数字就能发现。深链直接进来时退回本地快照（零请求）；都没有才请人先体检。
 *   2. 文案与 Canvas 导出共用 `copy.js` 的 `noticeCopy()`，一处改两处变，图与屏幕不可能不同。
 * @module views/notice
 */

import { LEVEL_EN } from '../config.js';
import { breathSpanUnit, noticeCopy } from '../copy.js';
import { vitalTone } from '../metrics.js';
import { esc, icon, toast } from '../dom.js';
import { navigate, reportPath } from '../router.js';
import { recall } from '../session.js';
import { loadSnapshot } from '../data/snapshots.js';
import { tracePathD } from '../components/ecg.js';
import { exportNoticePng } from '../share/notice-card.js';
import { topbar } from './home.js';

/**
 * 画一张 1080×1440 的通知书（绝对定位，坐标与 design-spec §10.2 一一对应）。
 * @param {object} result
 * @returns {string} HTML
 */
function posterHtml(result) {
  const copy = noticeCopy(result);
  const vitals = result.vitals ?? [];
  const breathing = vitals.find((item) => item.key === 'breathing')?.detail ?? {};
  const health = typeof result.health === 'number' ? result.health : null;
  const level = result.level ?? {};
  const tone = `var(--level-${level.tone ?? 'dead'})`;

  const field = (left, top, width, label, value, mono) => `<div class="cell" style="left:${left}px;top:${top}px;width:${width}px">
        <span class="ck">${esc(label)}</span>
        <span class="cv${mono ? ' mono' : ''}">${esc(value)}</span>
      </div>`;

  const rows = vitals
    .map((vital, index) => {
      const score = typeof vital.score === 'number' ? vital.score : null;
      // 弃权有两种（SPEC §6.0）：项目太年轻「样本不足」，或这次没取到数。
      // 通知书也要说清是哪一种 —— 用户很可能拿自己刚建的仓库来导出。
      const insufficient = vital.detail?.insufficient === true;
      // 0 分不补假填充：轨道空着 + 一个 0.0，就是"没有生命体征"最准确的画法
      const width = score && score > 0 ? (250 * score) / 100 : 0;
      const color = score && score > 0 ? `var(--level-${vitalTone(score)})` : 'transparent';
      const tail =
        score !== null ? score.toFixed(1) : insufficient ? '样本不足' : '—';
      return `<div class="vrow" style="top:${516 + index * 44}px">
          <span class="vn">${esc(vital.label)}</span>
          <span class="vtrack"></span>
          <span class="vfill" style="width:${width}px;background:${color}"></span>
          <span class="vs${insufficient ? ' is-note' : ' num'}">${tail}</span>
        </div>`;
    })
    .join('');

  return `<div class="poster" id="poster" role="img"
      aria-label="${esc(copy.patient)} 病危通知书：健康分 ${health ?? '无法计算'}，等级 ${esc(level.label ?? '未知')}，病案号 ${esc(copy.caseNo)}">
      <div class="frame" aria-hidden="true"></div>

      <div class="org">代码急诊科</div>
      <div class="no">NO. ${esc(copy.caseNo)}</div>
      <div class="rule1" aria-hidden="true"></div>
      <div class="rule2" aria-hidden="true"></div>

      <div class="kicker">CRITICAL CONDITION NOTICE</div>
      <div class="title">病危通知书</div>
      <p class="lede">兹将下列仓库经六项生命体征检查后的结果，通知如下：</p>

      <div class="tbl">
        <div class="vl" aria-hidden="true"></div>
        <div class="hl hl1" aria-hidden="true"></div>
        <div class="hl hl2" aria-hidden="true"></div>
        ${field(20, 10, 430, '患者 / PATIENT', copy.patient, true)}
        ${field(484, 10, 430, '送检时间 / SAMPLED', copy.sampled, true)}
        ${field(20, 62, 430, '病案号 / CASE NO.', copy.caseNo, true)}
        ${field(484, 62, 430, '主治 / ATTENDING', '自动分诊系统 v1.0', false)}
        ${field(20, 110, 888, '主诉 / CHIEF COMPLAINT', copy.complaint, false)}
      </div>

      <div class="lbl lbl-score">健康分 / SCORE</div>
      <div class="score num">${health === null ? '—' : health}</div>
      <div class="den num">/100</div>
      <div class="chip" style="color:${tone};border-color:${tone}">${esc(level.label ?? '—')} · ${LEVEL_EN[level.level] ?? 'N/A'}</div>

      <div class="lbl lbl-vitals">六项体征 / VITALS</div>
      ${rows}

      <div class="strip">
        <svg viewBox="0 0 720 208" preserveAspectRatio="none" aria-hidden="true">
          <path d="${tracePathD(breathing.monthly)}" vector-effect="non-scaling-stroke"/>
        </svg>
        <span class="rd">${Number.isFinite(breathing.total) ? breathing.total : 0} / ${esc(breathSpanUnit(breathing.windowMonths))}</span>
      </div>

      <div class="lbl lbl-concl">诊断结论 / CONCLUSION</div>
      <div class="concl">${esc(copy.conclusion[0])}<br>${esc(copy.conclusion[1])}</div>
      <div class="advice">${esc(copy.treatment)}</div>

      <div class="sign s1"><span class="k">ISSUED BY</span><span class="v">代码急诊科 · 自动分诊系统</span></div>
      <div class="sign s2"><span class="k">DATE</span><span class="v">${esc(copy.issuedOn)}</span></div>

      <div class="lbl lbl-remarks">备注 / REMARKS</div>
      <div class="remarks">${esc(copy.remarks[0])}<br>${esc(copy.remarks[1])}</div>

      <div class="stampbox">
        <svg viewBox="0 0 210 210" width="180" height="180" aria-hidden="true">
          <g fill="none" class="stamp-ring">
            <circle cx="105" cy="105" r="99" stroke-width="6"/>
            <circle cx="105" cy="105" r="58" stroke-width="1.6"/>
          </g>
          <defs>
            <path id="stampArcTop" d="M 29,105 A 76,76 0 0,1 181,105"/>
            <path id="stampArcBot" d="M 25,105 A 80,80 0 0,0 185,105"/>
          </defs>
          <!--
            dy 不能省：<textPath> 把**基线**放在弧线上，字会整体朝外探半个字号，
            上弧五个字的墨迹一直戳到 r=81，外环内沿在 82 —— 视觉上就是字骑在环线上。
            Canvas 版用的是 textBaseline='middle'（**字心**落在弧上），所以导出图是干净的，
            两边不是一个章。这里把基线往内挪半个 em（0.38em = (ascent-descent)/2），
            让 DOM 版与 Canvas 版对齐；取值 9.5 / 5.7 = 0.38 × 字号。
            ⚠️ dy 必须挂在 <text> 上：挂在 <textPath> 上 Chrome 不认（实测与不设同结果）。
          -->
          <text class="stamp-top" dy="9.5"><textPath href="#stampArcTop" startOffset="50%" text-anchor="middle">代码急诊科</textPath></text>
          <text class="stamp-bot" dy="5.7"><textPath href="#stampArcBot" startOffset="50%" text-anchor="middle">诊断专用章</textPath></text>
          <path class="stamp-star" d="M105 63 L114.87 91.41 L144.95 92.02 L120.98 110.19 L129.69 138.97 L105 121.8 L80.31 138.97 L89.02 110.19 L65.05 92.02 L95.13 91.41 Z"/>
        </svg>
      </div>

      <div class="foot-rule" aria-hidden="true"></div>
      <div class="foot1">本通知书由 GitHub 公开 API 数据自动生成，不构成代码审查意见，也不构成医疗建议。</div>
      <div class="foot2">CODE ICU · v1.0 · NO. ${esc(copy.caseNo)} · 1 / 1</div>
    </div>`;
}

/**
 * 页面骨架（不含事件）。
 * @param {object} result
 * @returns {string}
 */
function pageHtml(result) {
  const copy = noticeCopy(result);
  const banner = result.isSnapshot
    ? `<div class="snapbar">${icon('flask-conical')}
        <p><strong>示例数据</strong> · 采集于 <span class="num">${esc(copy.sampled)}</span>。
        这张通知书不会再发任何请求。</p></div>`
    : '';

  return `${topbar(
    '病危通知书',
    `<a class="top-action" href="#/">${icon('house')}回首页</a>
        <button class="top-action" type="button" data-act="back">${icon('arrow-right')}返回报告</button>`,
    'top-actions',
    ` / NO. ${copy.caseNo}`,
  )}
  <main class="wrap notice">
    <div class="notice-bar">
      <p class="notice-note">下面就是导出的那张图，尺寸 <span class="num">1080 × 1440</span>，可直接发朋友圈。
      ${banner ? '' : '点「下载 PNG」立刻出图。'}</p>
      <div class="notice-acts">
        <button class="btn btn-primary" type="button" data-act="download">${icon('download')}下载 PNG</button>
        <button class="btn btn-ghost" type="button" data-act="back">${icon('arrow-right')}返回报告</button>
      </div>
    </div>
    ${banner}
    <div class="poster-box">${posterHtml(result)}</div>
    <p class="notice-foot">导出的 PNG 与上面这张图同源同文案；数值来自同一次体检结果，不重新计算。</p>
  </main>`;
}

/**
 * 没有病历可开时的兜底：不白屏，也不偷偷替用户发一次请求。
 * @param {HTMLElement} container
 * @param {string} slug
 * @returns {string}
 */
function missingHtml(slug) {
  return `${topbar('病危通知书 / 无病历', '<span class="label">NOTICE</span>')}
  <main class="wrap notice">
    <div class="page-head">
      <span class="label">NO RECORD</span>
      <h1>这张通知书还没有病历</h1>
      <p>病危通知书要用体检结果才能开。先给 <span class="num">${esc(slug)}</span> 做一次体检，回来就能导出。</p>
    </div>
    <div class="notice-missing">
      <button class="btn btn-primary" type="button" data-act="report">${icon('stethoscope')}先做体检</button>
      <a class="btn btn-ghost" href="#/">${icon('arrow-right')}回首页</a>
    </div>
  </main>`;
}

/**
 * 渲染通知书页。
 * @param {HTMLElement} container
 * @param {{owner: string, repo: string, slug: string}} ctx
 * @returns {{destroy: () => void}}
 */
export function render(container, ctx) {
  const slug = ctx.slug;
  const controller = new AbortController();
  const { signal } = controller;
  /** @type {ResizeObserver|null} */
  let observer = null;

  // 只读内存；深链进来才退到本地快照（快照本身就是 analyze() 的结果，不发请求）
  const result = recall(slug) ?? loadSnapshot(slug);
  container.innerHTML = result ? pageHtml(result) : missingHtml(slug);
  container.querySelectorAll('[data-act="back"]').forEach((node) => {
    node.addEventListener('click', () => navigate(reportPath(slug)), { signal });
  });
  container.querySelector('[data-act="report"]')?.addEventListener('click', () => navigate(reportPath(slug)), { signal });

  const box = container.querySelector('.poster-box');
  const poster = container.querySelector('.poster');
  if (box && poster) {
    const fit = () => {
      const width = box.clientWidth || 1080;
      poster.style.transform = `scale(${width / 1080})`;
    };
    fit(); // 先同步设一次，避免首帧按 1080px 原尺寸闪一下
    observer = new ResizeObserver(fit);
    observer.observe(box);
  }

  const download = container.querySelector('[data-act="download"]');
  download?.addEventListener(
    'click',
    async () => {
      if (!result || download.disabled) return;
      const label = download.innerHTML;
      download.disabled = true;
      download.innerHTML = `${icon('loader', 'ic', 'ic-spin')}正在出图`;
      try {
        const { filename } = await exportNoticePng(result);
        toast(`已导出 ${filename}`);
      } catch (error) {
        // 导出失败必须给出能照做的下一步，不能只说"出错了"
        toast(`导出失败：${error.message}，换 Chrome 或 Safari 再试`);
      } finally {
        download.disabled = false;
        download.innerHTML = label;
      }
    },
    { signal },
  );

  return {
    destroy() {
      controller.abort();
      observer?.disconnect();
      observer = null;
    },
  };
}
