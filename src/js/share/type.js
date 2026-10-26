/**
 * Code ICU · Canvas 排版基建
 *
 * 两件事：从 CSS 变量读 Token（画布里禁止裸 hex），以及带字距的 `fillText`。
 *
 * 为什么不直接用 `ctx.letterSpacing`：它到 Chrome 99 / Safari 17 才有，而且会在末尾多留
 * 一个字距，居中和右对齐都得再减回去。导出图是要被逐像素看的东西，不如自己按字符推进——
 * 这样 DOM 的 `letter-spacing` 与画布上每一条 `fillText` 的落点严格同源，也和字号无关。
 *
 * 字体栈只能写字面量：`ctx.font` 的简写语法不认 `var(--font-mono)`。
 * 下面三个常量与 tokens.css 的 `--font-mono / --font-display / --font-serif-alt` 逐项对应，
 * 改 Token 时必须同步改这里（颜色不需要，颜色一律从变量读）。
 * @module share/type
 */

export const MONO = '"Martian Mono", "SF Mono", "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
export const DISP =
  '"Archivo", "PingFang SC", "Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", system-ui, sans-serif';
export const SERIF = '"Songti SC", "Source Han Serif SC", "Noto Serif SC", serif';

/**
 * 读取设计 Token 的计算值。缺变量时返回空串，让画布自己报错而不是静默画成黑色。
 * @returns {Record<string, any>}
 */
export function tokens() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  /** 五档等级色：只给总健康分与病危徽章用 */
  const levels = {
    healthy: v('--level-healthy'),
    clinic: v('--level-clinic'),
    ward: v('--level-ward'),
    icu: v('--level-icu'),
    dead: v('--level-dead'),
  };
  /** 三档状态色：只给单项体征用（SPEC §8.1），永不返回 clinic / ward */
  const status = { healthy: levels.healthy, icu: levels.icu, dead: levels.dead };
  return {
    paper: v('--bg'),
    rule: v('--paper-rule'),
    border: v('--border'),
    dash: v('--border-dash'),
    fg: v('--fg'),
    fg2: v('--fg-2'),
    muted: v('--muted'),
    meta: v('--meta'),
    alarm: v('--alarm'),
    inset: v('--surface-inset'),
    stamp: v('--stamp'),
    monitorBg: v('--monitor-bg'),
    trace: v('--monitor-trace'),
    monitorAlarm: v('--monitor-alarm'),
    levels,
    /** @param {'healthy'|'icu'|'dead'|null} tone */
    vital: (tone) => status[tone] ?? v('--meta'),
  };
}

/**
 * 量一段带字距的文字宽度。
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} str
 * @param {string} font
 * @param {number} [spacing]
 * @returns {number}
 */
export function measure(ctx, str, font, spacing = 0) {
  ctx.font = font;
  const chars = [...String(str ?? '')];
  if (!spacing) return ctx.measureText(String(str ?? '')).width;
  return chars.reduce((sum, ch, i) => sum + ctx.measureText(ch).width + (i < chars.length - 1 ? spacing : 0), 0);
}

/**
 * 画一段文字（支持字距与左/中/右对齐），返回实际宽度。
 * 逐字符绘制只在有字距时启用：没有字距就走原生 `fillText`，保留拉丁文的正常连字。
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} str
 * @param {number} x
 * @param {number} y
 * @param {{font: string, color: string, spacing?: number, align?: 'left'|'center'|'right'}} style
 * @returns {number} 实际宽度
 */
export function fill(ctx, str, x, y, { font, color, spacing = 0, align = 'left' }) {
  const text = String(str ?? '');
  const width = measure(ctx, text, font, spacing);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  let cursor = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
  if (!spacing) {
    ctx.fillText(text, cursor, y);
    return width;
  }
  const chars = [...text];
  chars.forEach((ch, i) => {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + (i < chars.length - 1 ? spacing : 0);
  });
  return width;
}

/** 通知书用到的所有字重/字号组合，逐个显式加载（见 awaitFonts 的注释） */
const FACES = [
  '400 12px', '400 15px', '400 17px', '400 18px', '510 18px', '510 32px',
  '600 24px', '500 9px', '500 11px', '500 13px', '500 14px', '500 20px', '700 160px',
];

/**
 * 等字体真的到位。
 *
 * 只 `await document.fonts.ready` 是不够的：它等的是**当前已在排队**的字体。
 * 报告页与通知书页都没有 700 字重的 Martian Mono 在页面上，这份 webfont 就没人触发，
 * `fonts.ready` 会立刻 resolve，然后 160px 的健康分用 fallback 字体画出来 ——
 * 预览看不出问题（预览用已加载字体），只有导出的 PNG 里坐标全错。
 * 所以先按实际用到的字号/字重逐个 `fonts.load()`，再等一次 ready 兜底。
 * @returns {Promise<void>}
 */
export async function awaitFonts() {
  const sample = 'ABCabc0123456789代码急诊科诊断专用章病危通知书';
  const requests = [
    ...FACES.map((face) => `${face} ${MONO}`),
    ...FACES.map((face) => `${face} ${DISP}`),
    `500 60px ${SERIF}`,
  ];
  await Promise.all(requests.map((request) => document.fonts.load(request, sample).catch(() => [])));
  await document.fonts.ready;
}
