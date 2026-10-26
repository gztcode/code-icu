/**
 * Code ICU · 体检报告
 *
 * 这一页是产品本体，其他三个视图都是它的入口和兜底。内部是一个状态机：
 *   loading（并行取数，进度走真实 onStep）→ ok（渲染报告）/ error（四种异常态之一）
 *
 * 三条硬规矩：
 *   1. 报告里**所有数值都来自 analyze(bundle)** 或快照，一个字都不硬编码；
 *   2. 示例仓库默认读快照，零请求零等待，必须标注「示例数据 · 采集于 X」；
 *   3. 任何失败路径都不白屏：本地有快照就先给快照，没有才进异常态。
 * @module views/report
 */

import { TOKEN_KEY } from '../config.js';
import { readToken, writeToken } from '../cache.js';
import { analyze } from '../metrics.js';
import { fetchBySlug, NotFoundError, RateLimitError, TokenInvalidError } from '../github.js';
import { loadSnapshot } from '../data/snapshots.js';
import { esc, fmtCaseNo, fmtDateTime, fmtDate, icon, toast } from '../dom.js';
import { navigate, noticePath, reportPath } from '../router.js';
import { remember } from '../session.js';
import { monthTicks } from '../components/ecg.js';
import { mountFigure } from '../components/ecg-screen.js';
import { patientSection } from '../components/patient.js';
import { monitorFigure } from '../components/monitor.js';
import { renderScore } from '../components/score-ring.js';
import { vitalCard } from '../components/vital-card.js';
import { renderHistory } from '../components/timeline.js';
import { adviceList, adviceNote } from '../advice.js';
import { topbar } from './home.js';
import { render as renderLoading } from './loading.js';
import { render as renderError } from './error.js';

/* ------------------------------------------------------------------ *
 * 1. 六项体征 / 病史 / 治疗建议（患者档案与监护屏各自独立成组件）
 * ------------------------------------------------------------------ */

/** @param {object} result */
function vitalsSection(result) {
  const failed = result.failed ?? result.degraded ?? [];
  const insufficient = result.insufficient ?? [];
  // 右上角小字要说清「为什么不是六项」：取数失败该重试，样本不足重试也没用
  const note = failed.length
    ? `${failed.length} 项取数失败 · 权重已重新归一化`
    : insufficient.length
      ? `${insufficient.length} 项样本不足 · 权重已重新归一化`
      : '六项齐全 · 权重合计 100%';

  // 年龄归一化提示（SPEC §6.0）：中性说明不是警告条，新项目不是病
  const ageMonths = result.ageMonths;
  const ageNote =
    typeof ageMonths === 'number' && Number.isFinite(ageMonths)
      ? ageMonths < 12
        ? `项目建仓 ${Math.round(ageMonths * 10) / 10} 个月，呼吸与依赖度已按实际存在时长归一化；不足 90 天的体征按「样本不足」处理。`
        : ''
      : '读不到建仓时间，六项按成熟项目的口径计算。';

  return `<section class="vitals">
      <div class="sec-h">
        <h2>六项体征</h2>
        <span class="num">${note}</span>
      </div>
      ${ageNote ? `<p class="vital-note">${icon('clock')}<span>${esc(ageNote)}</span></p>` : ''}
      <div class="vital-list">${result.vitals.map(vitalCard).join('')}</div>
    </section>`;
}

/** @param {object} result */
function adviceSection(result) {
  const list = adviceList(result);
  const items = list
    .map(
      (item) => `<div class="ad">
        <span class="pri ${item.pri.toLowerCase()}">${item.pri}</span>
        <div>
          <h3 class="ad-title">${item.title}</h3>
          <p class="ad-body">${item.body}</p>
        </div>
      </div>`,
    )
    .join('');
  return `<section class="advice">
      <div class="sec-h">
        <h2>治疗建议</h2>
        <span class="num">${esc(adviceNote(list.length, result.level))}</span>
      </div>
      <div class="ad-list">${items}</div>
    </section>`;
}

/* ------------------------------------------------------------------ *
 * 4. 组装
 * ------------------------------------------------------------------ */

/**
 * analyze() 的返回值不带 slug（它只关心数据），快照带。统一在这里取。
 * @param {object} result
 * @returns {string}
 */
const slugOf = (result) => result.slug ?? result.repo?.full_name ?? '';

/**
 * 拼出整页 HTML（不含事件）。
 * @param {object} result
 * @param {{snapshot: boolean, reason?: Error}} options
 * @returns {string}
 */
function pageHtml(result, options) {
  const { repo, fetchedAt } = result;
  // 病案号由 created_at 派生（SPEC §8.2）。与通知书同一口径，同一仓库两处编号必然一致。
  const chartNo = fmtCaseNo(repo.created_at);

  const banner = options.snapshot
    ? `<div class="snapbar">
        ${icon('flask-conical')}
        <p><strong>示例数据</strong> · 采集于 <span class="num">${esc(fetchedAt ? fmtDateTime(fetchedAt) : '—')}</span>。
        这份报告不会发任何请求，也不消耗你的限流额度。${options.reason ? `（实时取数失败：${esc(options.reason.message)}）` : ''}</p>
        <button class="btn btn-sm btn-ghost" type="button" data-act="live">看实时数据</button>
      </div>`
    : '';

  // 只对「这次真没取到」的项弹重试条。样本不足的项重试一万次也一样，
  // 给个重试按钮等于骗用户点，年龄的事交给体征列表上方那句中性说明。
  const failed = result.failed ?? result.degraded ?? [];
  const degradedBar = failed.length
    ? `<div class="snapbar">
        ${icon('gauge')}
        <p>${failed.length} 项数据这次没取到，<strong>已弃权</strong>，不计入总分也不会当成 0 分：
        ${esc(failed.map((key) => result.vitals.find((v) => v.key === key)?.label ?? key).join('、'))}</p>
        <button class="btn btn-sm btn-ghost" type="button" data-act="refresh">重试</button>
      </div>`
    : '';

  return `${topbar(
    options.snapshot ? '示例报告' : '体检报告',
    `<a class="top-action" href="#/">${icon('house')}回首页</a>
        <button class="top-action" type="button" data-act="refresh">${icon('rotate-ccw')}重新体检</button>`,
    'top-actions',
    ` / 病案号 ${chartNo}`,
  )}
  <main class="wrap report">
    ${banner}${degradedBar}
    ${patientSection(result)}
    ${renderScore(result)}
    ${monitorFigure(result)}
    ${vitalsSection(result)}
    ${renderHistory(result, new Date(result.analyzedAt ?? Date.now()))}
    ${adviceSection(result)}
    <div class="actions">
      <button class="btn btn-primary" type="button" data-act="notice">${icon('download')}导出病危通知书</button>
      <div class="actions-row">
        <button class="btn btn-ghost" type="button" data-act="refresh">${icon('rotate-ccw')}重新体检</button>
        <button class="btn btn-ghost" type="button" data-act="copy">${icon('copy')}复制结论</button>
      </div>
    </div>
    <footer class="foot">
      <span class="num">病案号 ${esc(chartNo)}${fetchedAt ? ` · 抓取于 ${esc(fmtDate(fetchedAt))}` : ''}</span>
      <span>数据来源 GitHub REST API · 结论由公开数据自动生成，不构成代码审查意见。</span>
    </footer>
  </main>`;
}

/** 当前实例，给不想持有返回值的调用方兜底 */
let active = null;

/**
 * 卸载报告页。重复调用安全。
 * @returns {void}
 */
export function destroy() {
  active?.destroy?.();
  active = null;
}

/**
 * 渲染报告页（含 loading / error 状态机）。
 * @param {HTMLElement} container
 * @param {{owner: string, repo: string, slug: string, mode?: string}} ctx
 * @returns {{destroy: () => void}}
 */
export function render(container, ctx) {
  const slug = ctx.slug;
  const controller = new AbortController();
  const { signal } = controller;
  let loading = null;
  let figure = null;
  let disposed = false;

  const cleanup = () => {
    loading?.destroy?.();
    loading = null;
    figure?.destroy?.();
    figure = null;
  };

  /** @param {object} result @param {{snapshot: boolean, reason?: Error}} options */
  const showReport = (result, options) => {
    if (disposed) return;
    cleanup();
    // 把这一份结果交给通知书页（含快照标记）：导出必须与屏幕上刚看到的报告逐位一致，
    // 所以那边只读内存，不重新取数、也不重算。
    remember(slugOf(result), result);
    container.innerHTML = pageHtml(result, options);
    figure = mountFigure(container, {
      monthly: result.vitals.find((item) => item.key === 'breathing')?.detail.monthly ?? [],
      total: result.vitals.find((item) => item.key === 'breathing')?.detail.total ?? 0,
      at: result.fetchedAt ?? Date.now(),
      span: `${monthTicks(result.fetchedAt ?? Date.now())[0]?.ym} → ${monthTicks(result.fetchedAt ?? Date.now())[11]?.ym}`,
    });
    wire(result);
  };

  /** @param {Error} error */
  const variantOf = (error) => {
    if (error instanceof NotFoundError) return 'notFound';
    if (error instanceof RateLimitError) return 'rate';
    if (error instanceof TokenInvalidError) return 'token';
    return 'network';
  };

  const showError = (error) => {
    if (disposed) return;
    cleanup();
    container.innerHTML = '';
    loading = renderError(container, {
      variant: variantOf(error),
      error,
      slug,
      onRetry: () => run(true),
      onHome: () => navigate('#/'),
      onClearToken: () => {
        writeToken(TOKEN_KEY, '');
        run(true);
      },
    });
  };

  /** @param {boolean} force 是否绕过缓存（点「重新体检」时强制拉新数据） */
  const run = async (force) => {
    if (disposed) return;
    cleanup();
    container.innerHTML = '';
    loading = renderLoading(container, { slug, onCancel: () => navigate('#/') });
    try {
      const bundle = await fetchBySlug(slug, {
        token: readToken(TOKEN_KEY) ?? '',
        force,
        onStep: (info) => loading?.markStep?.(info),
      });
      if (disposed) return;
      showReport(analyze(bundle), { snapshot: false });
    } catch (error) {
      if (disposed) return;
      const fallback = loadSnapshot(slug);
      // 本地有快照就先给快照：断网时也比白屏强，但必须标明是示例数据
      if (fallback && variantOf(error) !== 'rate') showReport(fallback, { snapshot: true, reason: error });
      else showError(error);
    }
  };

  /** @param {object} result */
  const wire = (result) => {
    const copyText = () =>
      `${slugOf(result)} 健康分 ${result.health}/100（${result.level.label}）。${result.vitals
        .filter((item) => item.score !== null)
        .map((item) => `${item.label} ${item.score}`)
        .join(' · ')}`;

    container.querySelectorAll('[data-act]').forEach((button) => {
      button.addEventListener(
        'click',
        () => {
          const act = button.dataset.act;
          if (act === 'refresh') run(true);
          else if (act === 'live') navigate(reportPath(slug, 'live'));
          else if (act === 'notice') navigate(noticePath(slug));
          else if (act === 'copy') {
            // 不用 async handler：剪贴板被拒时必须是可捕获的 reject，而不是未处理的 Promise
            navigator.clipboard.writeText(copyText()).then(
              () => toast('结论已复制'),
              () => toast('浏览器不让复制，可以先手动选中分数'),
            );
          }
        },
        { signal },
      );
    });
  };

  const snapshot = ctx.mode === 'live' ? null : loadSnapshot(slug);
  if (snapshot) showReport(snapshot, { snapshot: true });
  else run(false);

  active = {
    destroy() {
      disposed = true;
      cleanup();
      controller.abort();
    },
  };
  return active;
}
