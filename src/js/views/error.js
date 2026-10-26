/**
 * Code ICU · 异常态
 *
 * 一个组件四种参数。规则只有一条：必须说清三件事——出了什么事、为什么、现在能做什么。
 * 永远不显示裸的 "Error"。技术信息用等宽字体照原样贴出，让人能复制去搜。
 *
 * 四种：
 *   notFound  404，名字拼错或私有仓库
 *   rate      403 且额度为 0，带重置倒计时与 Token 引导
 *   token     401，本机存的 Token 失效
 *   network   请求没发出去（断网 / 代理 / 公司网络）
 * @module views/error
 */

import { esc, fmtCountdown, fmtTime, icon } from '../dom.js';
import { topbar } from './home.js';

/** 四种变体的静态部分。copy / tech / actions 里允许出现本文件自己的 HTML（无外部数据未转义） */
const VARIANTS = {
  notFound: {
    head: '病例 A · 仓库不存在',
    num: 'HTTP 404',
    tone: 'c-404',
    icon: 'file-question',
    title: '查无此院',
    code: 'NOT FOUND',
    copy:
      'GitHub 说这个地址上没有仓库。两种可能：<strong>名字拼错了</strong>，或者它是<strong>私有仓库</strong>。' +
      '私有仓库我们永远读不到，这不是故障，是设计。',
  },
  rate: {
    head: '病例 B · 触发限流',
    num: 'HTTP 403 · RATE LIMIT',
    tone: 'c-403',
    icon: 'gauge',
    title: 'GitHub 把门关了',
    code: 'RATE LIMIT EXCEEDED',
    copy:
      '未登录的请求每小时只有 <strong>60 次</strong>，这台机器上的额度已经用完了。' +
      '额度会自动重置，不用刷新页面，回来再点一次就行。填一个自己的 Token 可以立刻把额度提到每小时 5000 次。',
  },
  token: {
    head: '病例 B2 · 凭据失效',
    num: 'HTTP 401',
    tone: 'c-403',
    icon: 'file-key',
    title: 'Token 过期或被撤销了',
    code: 'BAD CREDENTIALS',
    copy:
      '浏览器里存的那个 Token 已经不被 GitHub 认可：可能过期了，也可能在 GitHub 上被删掉了。' +
      '清掉它就能回到未登录状态继续体检，只是额度会回到每小时 60 次。',
  },
  network: {
    head: '病例 C · 网络失败',
    num: 'NETWORK ERROR',
    tone: 'c-net',
    icon: 'wifi-off',
    title: '请求没有发出去',
    code: 'FAILED TO FETCH',
    copy:
      '浏览器在拿到第一个字节之前就断了。常见原因：<strong>断网</strong>、' +
      '<strong>代理或 VPN</strong> 拦了 api.github.com、或者你所在的网络不允许访问 GitHub。',
  },
};

/**
 * @param {keyof VARIANTS} variant
 * @param {any} error
 * @param {string} slug
 * @returns {string}
 */
function techBlock(variant, error, slug) {
  const line = `GET <b>/repos/${esc(slug)}</b>`;
  if (variant === 'notFound') return `${line} → 404 Not Found<br>message: "Not Found"`;
  if (variant === 'rate') {
    const at = error?.resetAt instanceof Date ? error.resetAt : null;
    const left = at ? fmtCountdown(at.getTime() - Date.now()) : '未知';
    return `${line} → 403 Forbidden<br>X-RateLimit-Remaining: <b>0 / 60</b> · 重置倒计时 <b id="reset-left">${left}</b>`;
  }
  if (variant === 'token') return `${line} → 401 Unauthorized<br>message: "Bad credentials"`;
  return `TypeError: <b>Failed to fetch</b><br>已发往 api.github.com · 重试 2 次（800ms / 2000ms）后仍然失败`;
}

/**
 * @param {string} label
 * @param {string} ic
 * @param {'primary'|'ghost'} kind
 * @param {string} id
 * @returns {string}
 */
const action = (label, ic, kind, id) =>
  `<button class="btn btn-${kind}" type="button" data-act="${id}">${icon(ic)}${label}</button>`;

/**
 * 每种变体的动作区：主按钮永远是「现在最可能有效的那一步」。
 * @param {keyof VARIANTS} variant
 * @param {string} slug
 * @returns {string}
 */
function actions(variant, slug) {
  const demo = '<a class="btn btn-ghost" href="#/">' + icon('arrow-right') + '看示例病例</a>';
  if (variant === 'notFound') {
    return action('改一下地址再试', 'stethoscope', 'primary', 'home') + demo;
  }
  if (variant === 'rate') {
    return (
      demo +
      action('重新试一次', 'rotate-ccw', 'ghost', 'retry') +
      action('填个 Token 提额度', 'file-key', 'ghost', 'home')
    );
  }
  if (variant === 'token') {
    return action('清除 Token 并重试', 'rotate-ccw', 'primary', 'clear') + demo;
  }
  const probe = `<a class="btn btn-ghost" href="https://api.github.com/repos/${esc(slug)}" target="_blank" rel="noreferrer noopener">${icon('external-link')}测一下通不通</a>`;
  return action('重新体检', 'rotate-ccw', 'primary', 'retry') + demo + probe;
}

/** 当前实例，给不想持有返回值的调用方兜底 */
let active = null;

/**
 * 卸载异常页。重复调用安全。
 * @returns {void}
 */
export function destroy() {
  active?.destroy?.();
  active = null;
}

/**
 * 渲染异常页。
 * @param {HTMLElement} container
 * @param {{
 *   variant?: keyof VARIANTS, error?: any, slug: string, back?: string,
 *   onRetry?: () => void, onHome?: () => void, onClearToken?: () => void,
 * }} ctx
 * @returns {{destroy: () => void}}
 */
export function render(container, ctx) {
  const variant = ctx.variant && VARIANTS[ctx.variant] ? ctx.variant : 'network';
  const view = VARIANTS[variant];
  const slug = ctx.slug || '—';
  const controller = new AbortController();
  const { signal } = controller;

  container.innerHTML = `${topbar('异常处置 / FAULT HANDLING', '')}
  <main class="wrap narrow">
    <div class="page-head">
      <span class="label">FAULT · 读不到数据</span>
      <h1>这一次没体检成功</h1>
      <p>${esc(slug)} 的数据没拿到。下面是确切原因和现在能做的事。</p>
    </div>

    <section class="err">
      <div class="err-head">
        <span class="label">${view.head}</span>
        <span class="num">${view.num}</span>
      </div>
      <div class="err-body">
        <div class="err-title">
          <div class="e-icon ${view.tone}">${icon(view.icon, 'ic-24')}</div>
          <div>
            <h2>${esc(view.title)}</h2>
            <div class="err-code">${view.code}</div>
          </div>
        </div>
        <p class="err-copy">${view.copy}</p>
        <div class="tech">${techBlock(variant, ctx.error, slug)}</div>
        <div class="err-act">${actions(variant, slug)}</div>
      </div>
    </section>

    <footer class="page-foot">
      共同规则：错误必须说清三件事——<b style="color:var(--fg-2);font-weight:510">出了什么事、为什么、现在能做什么</b>。
      所有失败路径都不留白屏。
    </footer>
  </main>`;

  container.querySelectorAll('[data-act]').forEach((button) => {
    button.addEventListener(
      'click',
      () => {
        const act = button.dataset.act;
        if (act === 'retry' && ctx.onRetry) ctx.onRetry();
        else if (act === 'home' && ctx.onHome) ctx.onHome();
        else if (act === 'clear' && ctx.onClearToken) ctx.onClearToken();
      },
      { signal },
    );
  });

  // 限流页的倒计时必须真的在走，否则「额度几点回来」这句话就是假的
  let timer = 0;
  const resetAt = ctx.error?.resetAt instanceof Date ? ctx.error.resetAt : null;
  if (variant === 'rate' && resetAt) {
    timer = setInterval(() => {
      const node = container.querySelector('#reset-left');
      const left = resetAt.getTime() - Date.now();
      if (node) node.textContent = fmtCountdown(left);
      const copy = container.querySelector('.err-copy');
      if (copy && left <= 0) {
        clearInterval(timer);
        copy.innerHTML = '额度已经重置了。<strong>直接点重新试一次</strong>就行，不用刷新页面。';
      }
    }, 1000);
    const copy = container.querySelector('.err-copy');
    if (copy) {
      copy.innerHTML = copy.innerHTML.replace(
        '额度会自动重置',
        `额度会在 <strong>${fmtTime(resetAt.toISOString())}</strong> 自动重置`,
      );
    }
  }

  active = {
    destroy() {
      clearInterval(timer);
      controller.abort();
    },
  };
  return active;
}
