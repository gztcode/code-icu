/**
 * Code ICU · 装配层
 *
 * 只做三件事：挂载、订阅路由、在切换时销毁上一个视图。
 * 零业务逻辑——所有判断都在视图和指标层里，这里出错就说明分层漏了。
 *
 * 视图契约：`render(container, ctx)` 返回 `{ destroy }`。切路由必须调用 destroy，
 * 否则 Canvas 的 ResizeObserver、loading 的秒表和全局 listener 会一直挂着。
 * @module main
 */

import { onChange, parseHash } from './router.js';
import { render as renderHome } from './views/home.js';
import { render as renderReport } from './views/report.js';
import { render as renderNotice } from './views/notice.js';

const app = /** @type {HTMLElement} */ (document.getElementById('app'));

/**
 * 把 `--bg` Token 写进 theme-color，避免在 index.html 里硬编码色值。
 * 样式表先于 module 脚本解析，这里读到的已是最终值。
 */
function paintThemeColor() {
  const meta = document.getElementById('theme-color');
  if (!meta) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (bg) meta.setAttribute('content', bg);
}

/** @type {{destroy?: () => void}|null} */
let current = null;

/**
 * 兜底：装配层自己抛异常时也必须有一句话在页面上，绝不白屏。
 * @param {Error} error
 */
function fallback(error) {
  app.innerHTML = `<main class="wrap">
      <div class="page-head">
        <span class="label">RENDER FAILED</span>
        <h1>这一页没能渲染出来</h1>
        <p>页面脚本报了个错，这通常意味着浏览器版本太旧（本页需要支持 ES Module 的浏览器）。</p>
      </div>
      <div class="err"><div class="err-body"><div class="tech">${String(error?.message ?? error)}</div>
        <div class="err-act"><a class="btn btn-primary" href="#/">回到首页</a></div>
      </div></div>
    </main>`;
}

function paint() {
  current?.destroy?.();
  current = null;

  const route = parseHash();
  try {
    if (route.name === 'report') {
      document.title = `${route.slug} 体检报告 · Code ICU`;
      current = renderReport(app, route);
    } else if (route.name === 'notice') {
      document.title = `${route.slug} 病危通知书 · Code ICU`;
      current = renderNotice(app, route);
    } else {
      document.title = 'Code ICU · 给你的仓库做一次全身检查';
      current = renderHome(app, {});
    }
  } catch (error) {
    fallback(error);
    return;
  }
  globalThis.scrollTo({ top: 0, behavior: 'auto' });
}

onChange(paint);
paintThemeColor();
paint();
