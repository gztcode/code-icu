/**
 * Code ICU · 体检中
 *
 * 进度必须是真的。5 个请求是**并行**发出的，所以 5 行同时转圈、谁先回来谁先变绿——
 * 这比「第 3/5 步」那种催眠式顺序动画更诚实，也顺便让人看懂一次体检打了几个请求。
 * 每行的 API 路径照原样贴出（带真实 slug），这是「数据从哪来」的证据。
 * @module views/loading
 */

import { FETCH_STEPS } from '../config.js';
import { esc, fmtStopwatch, icon } from '../dom.js';
import { stripSvg } from '../components/ecg.js';
import { topbar } from './home.js';

/** 行的四种状态 → 圆点里放什么、右侧读数写什么 */
const DOT = {
  pending: (index) => `<span class="num">${String(index + 1).padStart(2, '0')}</span>`,
  running: () => icon('loader', 'ic', 'ic-spin'),
  done: () => icon('check'),
  failed: () => icon('x'),
};

/** 当前实例，给不想持有返回值的调用方兜底 */
let active = null;

/**
 * 卸载体检中页面。重复调用安全。
 * @returns {void}
 */
export function destroy() {
  active?.destroy?.();
  active = null;
}

/**
 * 渲染体检中页面。
 * @param {HTMLElement} container
 * @param {{slug: string, onCancel?: () => void}} ctx
 * @returns {{destroy: () => void, markStep: (info: object) => void, failAll: (error: Error) => void}}
 */
export function render(container, ctx) {
  const { slug } = ctx;
  const controller = new AbortController();
  const { signal } = controller;
  const startedAt = Date.now();

  /** @type {Record<string, {status: string, ms: number, summary: string}>} */
  const state = {};
  for (const step of FETCH_STEPS) state[step.key] = { status: 'running', ms: 0, summary: '' };

  const rows = FETCH_STEPS.map((step, index) => {
    const api = step.path.replace('{slug}', slug);
    return `<div class="step running" data-step="${step.key}">
        <div class="s-dot">${DOT.running()}</div>
        <div class="s-main">
          <div class="s-name">${esc(step.label)}</div>
          <div class="s-api">GET ${esc(api)}</div>
        </div>
        <div class="s-out">取数中</div>
      </div>`;
  }).join('');

  container.innerHTML = `${topbar('检查中 / IN PROGRESS', '<span class="timer num" id="timer">00:00.0</span>')}
  <main class="wrap narrow">
    <div class="page-head">
      <span class="label">SCANNING · 正在体检</span>
      <h1 class="repo">${esc(slug)}</h1>
      <p>已推上检查床。5 组公开数据并行发出，谁先回来谁先出结果，采集完自动出报告。别关标签页。</p>
    </div>

    <div class="lead">${stripSvg()}<div class="lead-mask"></div><div class="lead-now"></div>
      <div class="lead-tag"><i aria-hidden="true"></i>SCANNING</div>
      <div class="lead-hr">LEAD II · 25 mm/s</div>
    </div>

    <div class="steps" id="steps" role="status" aria-live="polite">${rows}</div>

    <div class="bar-wrap">
      <div class="bar-track"><div class="bar-fill" id="bar"></div></div>
      <div class="bar-meta">
        <span id="bar-text">已完成 0 / ${FETCH_STEPS.length}</span>
        <span id="bar-pct">0%</span>
      </div>
    </div>

    <div class="flow-actions">
      <button class="btn btn-ghost" type="button" id="cancel">${icon('x')}取消检查</button>
    </div>

    <footer class="page-foot">
      如果某一行超过 15 秒还没回来，多半是 GitHub 限流了。可以等一下，或者先看一份现成病例。
    </footer>
  </main>`;

  const timer = container.querySelector('#timer');
  const bar = container.querySelector('#bar');
  const barText = container.querySelector('#bar-text');
  const barPct = container.querySelector('#bar-pct');

  const tick = setInterval(() => {
    if (timer) timer.textContent = fmtStopwatch(Date.now() - startedAt);
  }, 100);

  const counts = () => {
    const values = Object.values(state);
    return {
      done: values.filter((item) => item.status !== 'running' && item.status !== 'pending').length,
      total: FETCH_STEPS.length,
    };
  };

  const paintBar = () => {
    const { done, total } = counts();
    const pct = Math.round((done / total) * 100);
    if (bar) bar.style.width = `${pct}%`;
    if (barText) barText.textContent = `已完成 ${done} / ${total}`;
    if (barPct) barPct.textContent = `${pct}%`;
  };

  /**
   * 推进一格。onStep 里调用的就是这个。
   * @param {{key: string, ok: boolean, ms: number, summary: string, error: Error|null}} info
   * @returns {void}
   */
  const markStep = (info) => {
    const current = state[info.key];
    if (!current) return;
    current.status = info.ok ? 'done' : 'failed';
    current.ms = info.ms;
    current.summary = info.summary;
    const row = container.querySelector(`[data-step="${info.key}"]`);
    if (row) {
      row.classList.remove('running');
      row.classList.add(current.status);
      const dot = row.querySelector('.s-dot');
      if (dot) dot.innerHTML = DOT[current.status]();
      const out = row.querySelector('.s-out');
      if (out) out.textContent = info.ok ? `${info.ms}ms · ${info.summary}` : `${info.ms}ms · ${info.summary}`;
    }
    paintBar();
  };

  /**
   * 整体失败时把还没回来的行标红，避免页面停在「5 个圈在转」的状态。
   * @param {Error} error
   * @returns {void}
   */
  const failAll = () => {
    for (const [key, value] of Object.entries(state)) {
      if (value.status === 'running') {
        value.status = 'failed';
        const row = container.querySelector(`[data-step="${key}"]`);
        if (row) {
          row.classList.remove('running');
          row.classList.add('failed');
          const dot = row.querySelector('.s-dot');
          if (dot) dot.innerHTML = DOT.failed();
          const out = row.querySelector('.s-out');
          if (out) out.textContent = '中断';
        }
      }
    }
    paintBar();
  };

  container.querySelector('#cancel')?.addEventListener(
    'click',
    () => {
      if (ctx.onCancel) ctx.onCancel();
    },
    { signal },
  );

  active = {
    markStep,
    failAll,
    destroy() {
      clearInterval(tick);
      controller.abort();
    },
  };
  return active;
}
