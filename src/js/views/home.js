/**
 * Code ICU · 首页（门诊登记）
 *
 * 这一页只有一件事要做：让人在两秒内明白要输入什么，并且愿意输。
 * 所以顺序是「一句话说清这是什么」→「一个输入框」→「三个现成病例」→「六项体征是什么」→「隐私」，
 * 后面三块全部可折叠或可跳过，不挡主路径。
 *
 * 三个示例按钮读的是 fetch 时代固化的快照（data/snapshots.js），零请求零等待：
 * 用户点下去必须立刻看到结果，加载动画留给真正需要拉数据的仓库。
 * @module views/home
 */

import { DEMO_REPOS, TOKEN_KEY } from '../config.js';
import { PRIVACY_NOTE } from '../copy.js';
import { demoCases } from '../data/snapshots.js';
import { HERO_SIGNATURE } from '../components/ecg.js';
import { esc, icon, toast } from '../dom.js';
import { readToken, writeToken } from '../cache.js';
import { parseRepoInput } from '../github.js';
import { navigate, reportPath } from '../router.js';

/** 「六项体征是什么」折叠区的内容：一项一行，讲清测什么、怎么掉分 */
const VITALS_HELP = [
  ['heart-pulse', '心跳', 'HEART RATE', '距最后一次提交多久。7 天以内满分，之后按天往下扣，停更超过一年就只剩个位数。'],
  ['wind', '呼吸频率', 'RESPIRATION', '近 12 个月提交密度，再加一层「最近半年 vs 前半年」的趋势修正。衰退的项目会先在这里掉分。'],
  ['user-round', '单人依赖度', 'BUS FACTOR', '近 12 个月提交里，占比最高的那个人占多少。越高，这个人一走科室就停摆。'],
  ['repeat-2', '代谢', 'METABOLISM', '多久没发版。30 天内有版本是满分，两年没版本只剩 15 分。完全不发版的项目给 45 分——不发版不等于有病。'],
  ['shield-check', '免疫', 'IMMUNITY', '未关闭 issue 里，挂了 90 天以上没人动的占多少；再按积压总量（50 / 200 / 500 条）分级扣分。'],
  ['scroll-text', '遗嘱', 'WILL', '许可证加 README 的完整度：存在、字数过一千五、有安装段、有使用段、有许可段、有状态徽章，七个计分点。仓库一归档直接清零。'],
];

/**
 * 全站共用的顶栏。首页放表单号，报告页放病案号，加载页放秒表。
 * @param {string} sub 品牌副标题（页面身份，窄屏也必须完整显示）
 * @param {string} [right] 右侧 HTML
 * @param {string} [slot] 右侧槽位的类名，默认 'chart-no'（竖排两行标签）
 * @param {string} [meta] 副标题后的编号等次要信息，窄屏隐藏（主体区另有完整版）
 * @returns {string}
 */
export function topbar(sub, right = '<span class="label">表单</span><span class="num">CY-01 入院登记</span>', slot = 'chart-no', meta = '') {
  // 品牌是回首页的入口 —— 报告页和通知书页没有别的路能回到首页，
  // 顶栏左上角必须是一个真链接（不能只是 div），否则用户在二级页就走不出去了。
  //
  // slot 是右侧槽位的类名：默认 'chart-no' 是竖排的两行标签（首页的表单号），
  // 放操作按钮时要传 'top-actions' —— 横排一行，两个按钮并排不叠成竖列。
  //
  // sub 与 meta 分开：窄屏下两个按钮横排会挤掉副标题，而「体检报告 / 病危通知书」
  // 是页面身份、必须留着，编号（病案号 / NO.）在主体区另有完整版，可以让位。
  return `<header class="topbar">
      <div class="wrap topbar-in">
        <a class="brand brand-home" href="#/" aria-label="CODE ICU 首页">
          <span class="brand-bar" aria-hidden="true"></span>
          <div style="min-width:0">
            <div class="brand-name">CODE ICU</div>
            <div class="brand-sub"><span class="brand-sub-identity">${esc(sub)}</span>${meta ? `<span class="brand-sub-meta">${esc(meta)}</span>` : ''}</div>
          </div>
        </a>
        <div class="${slot}">${right}</div>
      </div>
    </header>`;
}

/** 当前挂在页面上的实例。main.js 直接用 render 的返回值，这个变量是给「不想持有实例」的调用方兜底用的 */
let active = null;

/**
 * 卸载首页。重复调用安全。
 * @returns {void}
 */
export function destroy() {
  active?.destroy?.();
  active = null;
}

/**
 * 渲染首页。
 * @param {HTMLElement} container 挂载点
 * @param {{toast?: (message: string) => void}} [ctx]
 * @returns {{destroy: () => void}}
 */
export function render(container, ctx = {}) {
  const notify = ctx.toast ?? toast;
  const controller = new AbortController();
  const { signal } = controller;
  const savedToken = readToken(TOKEN_KEY) ?? '';

  const cases = demoCases()
    .map(
      (item) => `<button class="case" type="button" data-slug="${esc(item.slug)}">
        <span class="case-main">
          <span class="case-repo num">${esc(item.slug)}</span>
          <span class="case-desc">${esc(item.tag)}</span>
        </span>
        <span class="case-side">
          <span class="case-score num" style="color:var(--level-${item.level.tone})">${item.health}</span>
          <span class="chip c-${item.level.tone}">${esc(item.level.label)}</span>
          ${icon('arrow-right', 'ic', 'chev')}
        </span>
      </button>`,
    )
    .join('');

  const helpItems = VITALS_HELP.map(
    ([ic, name, en, desc]) => `<li class="vit-item">
          ${icon(ic, 'ic-20')}
          <div>
            <div class="vit-name">${name}<span class="vit-en">${en}</span></div>
            <p class="vit-desc">${desc}</p>
          </div>
        </li>`,
  ).join('');

  container.innerHTML = `${topbar()}
  <main class="wrap">
    <section class="hero">
      <span class="label">REPO ADMISSION · 门诊登记</span>
      <h1>给你的仓库<br>做一次全身检查</h1>
      <p class="lede">
        读取 GitHub 公开数据，量六项生命体征，算一个 0-100 的健康分。
        分数掉到一定程度，这个页面会直接告诉你不要接入了。
      </p>
      ${HERO_SIGNATURE}
    </section>

    <section class="sheet" aria-labelledby="sheet-title">
      <div class="sheet-head">
        <span class="label" id="sheet-title">患者信息 / PATIENT</span>
        <span class="num">字段 01</span>
      </div>
      <form class="sheet-body" id="intake" novalidate>
        <label class="field-label" for="repo">仓库地址 <span class="en">REPOSITORY</span></label>
        <div class="input-row">
          <div class="input-shell" id="repo-shell">
            <span class="input-prefix" aria-hidden="true">github.com/</span>
            <input id="repo" type="text" inputmode="url" spellcheck="false" autocomplete="off"
                   placeholder="expressjs/express" aria-describedby="repo-hint repo-error">
          </div>
          <button class="btn btn-primary" type="submit">${icon('stethoscope')}开始体检</button>
        </div>
        <p class="hint" id="repo-hint">
          支持 <code>owner/repo</code> 或完整链接。私有仓库读不到，那是好事：说明你的代码还没开源。
        </p>
        <p class="field-error" id="repo-error" role="alert"></p>

        <details class="token" id="token-box">
          <summary>${icon('lock')}<a class="token-link" href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">GitHub Token</a>？填上可以避免限流（选填，只存在本机）</summary>
          <div class="token-box">
            <div class="input-shell">
              <input id="token" type="password" spellcheck="false" autocomplete="off"
                     placeholder="ghp_… 或 github_pat_…" value="${esc(savedToken)}" aria-label="GitHub Token">
            </div>
            <p class="token-state" id="token-state">${savedToken ? '已保存在本机浏览器，可在体检时提速到 5000 次/小时' : '未填写 · 未登录状态每小时 60 次请求'}</p>
            <p class="token-help">
              还没有？<a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">去 GitHub 账号设置里生成一个</a>。
              选 <code>Generate new token (classic)</code>，勾 <code>public_repo</code> 就够了——我们只读公开仓库的数据，不会碰你的私有仓库。
              Token 只存在这台电脑的浏览器里，不上传、不经过任何服务器。
            </p>
          </div>
        </details>
      </form>
    </section>

    <section class="examples">
      <div class="sec-head">
        <h2>或者，直接看现成的病例</h2>
        <p class="sec-sub">三份预制病历，点一下立刻出结果——用的是真实采集数据，不是截图，也不消耗你的限流额度。</p>
      </div>
      <div class="case-list">${cases}</div>
    </section>

    <details class="doc">
      <summary>
        <span class="sum-left">${icon('clipboard-list', 'ic-20')}什么是六项体征</span>
        <span class="sum-right"><span class="label">展开</span>${icon('chevron-down', 'ic', 'chev')}</span>
      </summary>
      <div class="doc-body"><ol class="vit-list">${helpItems}</ol></div>
    </details>

    <aside class="privacy">
      ${icon('lock', 'ic-20')}
      <p><strong>数据不出你的浏览器。</strong>${esc(PRIVACY_NOTE)}</p>
    </aside>

    <footer class="foot">
      <span class="num">CODE ICU · 数据来源 GitHub REST API</span>
      <span>本工具不构成医疗建议，也不构成代码审查结论。</span>
    </footer>
  </main>`;

  const form = container.querySelector('#intake');
  const input = container.querySelector('#repo');
  const shell = container.querySelector('#repo-shell');
  const error = container.querySelector('#repo-error');
  const tokenInput = container.querySelector('#token');
  const tokenState = container.querySelector('#token-state');

  /** @param {string} message */
  const fail = (message) => {
    error.textContent = message;
    error.classList.add('on');
    shell.classList.add('is-error');
    input.focus();
  };

  const clearError = () => {
    error.textContent = '';
    error.classList.remove('on');
    shell.classList.remove('is-error');
  };

  form?.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      const parsed = parseRepoInput(input.value);
      if (!parsed) {
        // 非法地址就地提示，绝不发请求（一次体检 5 个请求，不能浪费在拼错的地址上）
        fail('这不是一个仓库地址。要写成 owner/repo，例如 expressjs/express，也可以直接粘完整链接。');
        return;
      }
      clearError();
      navigate(reportPath(`${parsed.owner}/${parsed.repo}`));
    },
    { signal },
  );

  input?.addEventListener('input', clearError, { signal });

  container.querySelectorAll('.case').forEach((button) => {
    button.addEventListener(
      'click',
      () => navigate(reportPath(button.dataset.slug ?? '')),
      { signal },
    );
  });

  // summary 里的链接点它要去 GitHub，不该顺带把折叠面板展开或收起。
  // 用 stopPropagation 截断冒泡即可：链接自身的默认行为（新标签打开）不受影响。
  container.querySelectorAll('#token-box a').forEach((link) => {
    link.addEventListener('click', (event) => event.stopPropagation(), { signal });
  });

  tokenInput?.addEventListener(
    'change',
    () => {
      const value = tokenInput.value.trim();
      writeToken(TOKEN_KEY, value);
      if (tokenState) {
        tokenState.textContent = value
          ? '已保存在本机浏览器，可在体检时提速到 5000 次/小时'
          : '未填写 · 未登录状态每小时 60 次请求';
      }
      notify(value ? 'Token 已存到本机' : 'Token 已清除');
    },
    { signal },
  );

  active = {
    destroy() {
      controller.abort();
    },
  };
  return active;
}
