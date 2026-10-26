/**
 * Code ICU · ECG 几何
 *
 * 全页的视觉记忆点。12 个月的提交数画成 12 个心搏，**不是折线图也不是柱状图**：
 * 折线图一出现，这个产品就退化成 BI 面板了。
 *
 * 几何算法来自 design-spec §9.4（P 波 → QRS 复合波 → T 波），一个 beatWidth 内完成一次心搏。
 * 本文件只做「数据 → 路径」，不碰 DOM 也不碰 Canvas，同一套几何供三处渲染：
 *   1. 报告页 Canvas（ecg-screen.js）
 *   2. 体检中扫描条的 SVG（本文件 `stripSvg`）
 *   3. 下一单的病危通知书 Canvas（`beatOps` 换成 ctx 调用即可，坐标系已参数化）
 *
 * 提交数为 0 的月份**不画心搏**，退化成一个等电位平台段。整年全 0 就是一条平直线 ——
 * 这是「临床死亡」唯一的正确画法，也是 request/request 这个主推案例的画面。
 * @module components/ecg
 */

/** 一年 12 个月 = 12 拍 */
export const BEAT_COUNT = 12;

/**
 * 一次心搏的转折点，`[x 比例, y 偏移比例]`，y 为负表示向上。
 * x 比例相对 beatWidth，y 比例相对振幅 amp。数值按 design-spec §9.4 换算成比例。
 * @type {Array<Array<number|string>>}
 */
const BEAT_SHAPE = [
  ['q', 0.068, -0.13, 0.136, 0], // P 波（房性去极化）
  ['l', 0.222, 0],
  ['l', 0.298, 0.16], // Q
  ['l', 0.383, -1], // R 主峰
  ['l', 0.469, 0.3], // S
  ['l', 0.545, 0],
  ['l', 0.613, 0],
  ['q', 0.682, -0.26, 0.767, 0], // T 波（室性复极化）
  ['l', 1, 0],
];

/** 保留两位小数，路径字符串不需要更高精度 */
const round = (value) => Math.round(value * 100) / 100;

/**
 * 由实际画布尺寸推导绘制布局。所有尺寸都是比例的，所以同一套算法既能在 375px 手机上画，
 * 也能在 1080px 的导出卡上画。
 *
 * `base` 的位置不是拍脑袋的 0.8：S 波要往下扎 0.3×amp，下面还得留一行月份刻度。
 * 把这两条加起来回代，解出 base 的上界 —— 否则小画布上波形会压着月份数字走。
 * @param {number} cssWidth
 * @param {number} cssHeight
 * @returns {{width: number, height: number, edge: number, base: number, amp: number, beatWidth: number}}
 */
export function layoutMetrics(cssWidth, cssHeight) {
  const width = Math.max(160, Math.round(cssWidth));
  const height = Math.max(120, Math.round(cssHeight));
  const edge = Math.max(8, Math.round(width * 0.012));
  const top = Math.max(18, Math.round(height * 0.15)); // 给峰上读数留位置
  const tick = 22; // 底部月份刻度带（字号 + 余量）
  const base = Math.round(Math.min(height * 0.8, (height - tick + top * 0.24) / 1.24));
  const amp = Math.max(10, (base - top) * 0.8);
  return { width, height, edge, base, amp, beatWidth: (width - edge * 2) / BEAT_COUNT };
}

/**
 * 生成一次心搏的绘制指令（画布与 SVG 两种渲染共用同一份几何）。
 * @param {number} x 本拍起点
 * @param {number} amp 本拍振幅（0 表示这一拍没有提交，退化为平台段）
 * @param {number} base 等电位线 y
 * @param {number} beatWidth 一拍宽度
 * @returns {Array<Array<number|string>>}
 */
export function beatOps(x, amp, base, beatWidth) {
  if (!amp) return [['l', x + beatWidth, base]];
  return BEAT_SHAPE.map((op) => {
    const scaled = op.slice(1).map((value, i) => (i % 2 === 0 ? x + beatWidth * Number(value) : base + amp * Number(value)));
    return [op[0], ...scaled];
  });
}

/**
 * 一次心搏 → SVG path 的 `d` 段（不含起始 M）。
 * @param {number} x
 * @param {number} amp
 * @param {number} base
 * @param {number} beatWidth
 * @returns {string}
 */
export function beatPathD(x, amp, base, beatWidth) {
  return beatOps(x, amp, base, beatWidth)
    .map((op) =>
      op[0] === 'q'
        ? `Q${round(op[1])} ${round(op[2])} ${round(op[3])} ${round(op[4])}`
        : `L${round(op[1])} ${round(op[2])}`,
    )
    .join(' ');
}

/**
 * 把 12 个月提交数换算成每拍的几何参数。峰值那一拍正好顶到满振幅。
 * @param {number[]} monthly 长度 12 的提交数
 * @param {{edge: number, base: number, amp: number, beatWidth: number}} layout
 * @returns {Array<{index: number, value: number, x: number, amp: number, peak: boolean}>}
 */
export function geometry(monthly, layout) {
  const values = Array.from({ length: BEAT_COUNT }, (_, i) => Number(monthly?.[i]) || 0);
  const max = Math.max(1, ...values);
  return values.map((value, index) => ({
    index,
    value,
    x: layout.edge + layout.beatWidth * index,
    amp: value === 0 ? 0 : (value / max) * layout.amp,
    peak: value > 0 && value === max,
  }));
}

/**
 * 月份刻度：11 个月前 → 当月。`ym` 给图注用（`2026-04`），`label` 给画布轴用（`04`）。
 * @param {string|Date} at 参照时刻
 * @returns {Array<{label: string, ym: string, index: number}>}
 */
export function monthTicks(at) {
  const base = at instanceof Date ? at : new Date(at || Date.now());
  const anchor = Number.isNaN(base.getTime()) ? new Date() : base;
  return Array.from({ length: BEAT_COUNT }, (_, i) => {
    const date = new Date(anchor.getFullYear(), anchor.getMonth() - (BEAT_COUNT - 1 - i), 1);
    const pad = (n) => String(n).padStart(2, '0');
    return { label: pad(date.getMonth() + 1), ym: `${date.getFullYear()}-${pad(date.getMonth() + 1)}`, index: i };
  });
}

/**
 * 监护条里的平线（12 个月提交全为 0）定稿折线，坐标在 720×208 的局部空间。
 * 取自 design-spec §10.2 第 34 条：不是 y 完全相等的死线，而是带 ±1.5 单位基线漂移的等电位线。
 * 真实的监护仪在没有心搏时也是这样的；一条数学上完美的直线反而像占位图。
 * @type {Array<[number, number]>}
 */
export const FLAT_TRACE = [
  [8, 104], [60, 103.1], [120, 105.2], [180, 104.5], [240, 103.2], [300, 104.8], [360, 103.4],
  [420, 104.6], [480, 103], [540, 104.9], [600, 103.6], [660, 104.4], [712, 104],
];

/**
 * 通知书监护条的局部布局：基线取 104，与平线定稿折线的基线**同一个值** ——
 * 这样"一年零提交"的等电位线和"一年 96 次提交"的心搏都长在同一条基线上，
 * 换一个仓库不会发现波形整体上下跳了一格。
 * 振幅 72 是回推出来的：R 峰到 32、S 谷到 125.6，上下都留出余量，不贴边。
 */
const STRIP_LAYOUT = { width: 720, height: 208, edge: 8, base: 104, amp: 72, beatWidth: (720 - 16) / BEAT_COUNT };

/**
 * 一年的提交记录 → 一组绘制指令（`['m']` 起笔，之后 `['l']` / `['q']`），坐标在 720×208 空间。
 *
 * 这是「通知书 DOM 预览」与「通知书 Canvas 导出」共用的唯一几何来源：
 * 两边各画一遍，形状必然一致，不会出现"预览有心搏、导出变平线"这类对不上。
 * 12 个月全 0 时退化成 FLAT_TRACE 那条带漂移的等电位线。
 * @param {number[]|undefined} monthly 长度 12 的提交数
 * @returns {Array<Array<number|string>>}
 */
export function traceOps(monthly) {
  const values = Array.from({ length: BEAT_COUNT }, (_, i) => Number(monthly?.[i]) || 0);
  if (values.every((value) => !value)) {
    return [
      ['m', FLAT_TRACE[0][0], FLAT_TRACE[0][1]],
      ...FLAT_TRACE.slice(1).map(([x, y]) => ['l', x, y]),
    ];
  }
  const beats = geometry(values, STRIP_LAYOUT);
  const ops = [['m', beats[0].x, STRIP_LAYOUT.base]];
  for (const beat of beats) ops.push(...beatOps(beat.x, beat.amp, STRIP_LAYOUT.base, STRIP_LAYOUT.beatWidth));
  return ops;
}

/**
 * 同 `traceOps`，但直接产出 SVG 的 `d` 字符串（通知书的 DOM 预览用）。
 * @param {number[]|undefined} monthly
 * @returns {string}
 */
export function tracePathD(monthly) {
  return traceOps(monthly)
    .map((op) =>
      op[0] === 'm'
        ? `M${op[1]} ${op[2]}`
        : op[0] === 'q'
          ? `Q${round(op[1])} ${round(op[2])} ${round(op[3])} ${round(op[4])}`
          : `L${round(op[1])} ${round(op[2])}`,
    )
    .join(' ');
}

/**
 * 体检中扫描条用的 SVG：一条 2 倍宽、可无缝左移的连续波形（装饰性，aria-hidden）。
 * 高度写死 208 与 viewBox 一致，靠 CSS 拉满容器 + `preserveAspectRatio="none"`。
 * @returns {string}
 */
export function stripSvg() {
  const width = 720;
  const height = 208;
  const layout = layoutMetrics(width, height);
  const pattern = [0.42, 0.66, 0.3, 0.88, 0.55, 0.74, 0.38, 0.92, 0.48, 0.7, 0.34, 0.6];
  const beatWidth = width / BEAT_COUNT;
  const segs = [];
  for (let copy = 0; copy < 2; copy += 1) {
    for (let i = 0; i < BEAT_COUNT; i += 1) {
      segs.push(beatPathD(copy * width + i * beatWidth, pattern[i] * layout.amp, layout.base, beatWidth));
    }
  }
  return `<svg class="strip" viewBox="0 0 ${width * 2} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 ${layout.base} ${segs.join(' ')}" vector-effect="non-scaling-stroke"/>
    </svg>`;
}

/**
 * 首页标题下那道 26px 高的小心电图。直接从 design/mockup-home.html 取的定稿路径，
 * 只有一拍的振幅足够大，避免和大标题抢注意力。
 */
export const HERO_SIGNATURE = `<svg class="ecg-signature" viewBox="0 0 400 26" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 18 L188 18 L192 22 L196 4 L200 24 L204 18 L212 18 Q216 13 220 18 L400 18"/>
    </svg>`;
