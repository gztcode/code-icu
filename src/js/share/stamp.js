/**
 * Code ICU · 诊断专用章（Canvas 版）
 *
 * design-spec §10.3 要求逐字绕圆旋转（Canvas 没有 `textPath`），但那一版示例代码的角度
 * 约定是错的：它把 `centerDeg` 当成"从左侧起算"，传 -90 会把「代码急诊科」排到章的**左边缘**
 * 并整体旋转 -90°，传 +90 则排到右边缘；下弧还会被翻转 180°。而 `mockup-notice.html`
 * 用的是 `<textPath>`，上弧在正上方、下弧在正下方且字都是正的 —— 验收以 HTML 版为准，
 * 所以这里按 HTML 版的几何重写：
 *
 *   · 统一用「从正上方起、顺时针」的角度 θ；
 *   · 上弧：字头朝外（旋转 θ），字符从左到右 = θ 递增；
 *   · 下弧：字头朝圆心（旋转 θ − 180°），字符从左到右 = θ 递减，字不会倒过来。
 *
 * 章的外框是 (606,1042) 起、180×180，所以**章心是 (696,1132)**，不是 §10.3 代码里写的
 * (786,1132) —— 786 是这个外框的右边界，把 translate 写到右边界上会让整枚章右移 90px，
 * 正好压住落款「代码急诊科 · 自动分诊系统」（该行左边界 804）。以 `mockup-notice.html`
 * 的 HTML 版为准：那里 `left:606; width:180` 居中的就是 696。
 *
 * 位置本身不能挪：左边界 606 不压「备注」正文（其文字右边界约 451，容器 596），
 * 右边界 786 不压落款文字（左边界 804）。
 * @module share/stamp
 */

/** 章心局部坐标（内部一律按 210×210 画，再整体缩放到 180） */
const CX = 105;
const CY = 105;

/** 字的正上方是 -y，所以 θ 从正上方顺时针量的坐标是 (sinθ, −cosθ) */
const project = (deg, radius) => {
  const rad = (deg * Math.PI) / 180;
  return [CX + Math.sin(rad) * radius, CY - Math.cos(rad) * radius];
};

/**
 * 沿圆弧排一行字。
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {{radius: number, top: boolean, weight: number, fontSize: number, family: string, spacing: number}} style
 * @returns {void}
 */
function arcRow(ctx, text, { radius, top, weight, fontSize, family, spacing }) {
  ctx.font = `${weight} ${fontSize}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...text];
  // 每字占的角度 = 弧长（字号 + 字距）÷ 半径，折成度
  const step = (360 / (Math.PI * 2 * radius)) * (fontSize + spacing);
  const half = (step * (chars.length - 1)) / 2;
  chars.forEach((char, index) => {
    const offset = -half + index * step;
    const deg = top ? offset : 180 - offset;
    const [x, y] = project(deg, radius);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(((top ? deg : deg - 180) * Math.PI) / 180);
    ctx.fillText(char, 0, 0);
    ctx.restore();
  });
}

/**
 * 画一枚章。必须在所有正文之后调用（印泥压在铅字上）。
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} stampColor 印章色（读自 `--stamp`，禁止裸 hex）
 * @returns {void}
 */
export function drawStamp(ctx, stampColor) {
  const sans = '"PingFang SC", "Noto Sans SC", sans-serif';
  ctx.save();
  ctx.globalCompositeOperation = 'multiply'; // 模拟印泥压在铅字上
  ctx.globalAlpha = 0.9;
  ctx.translate(696, 1132);
  ctx.rotate((-9 * Math.PI) / 180);
  ctx.scale(180 / 210, 180 / 210);
  ctx.translate(-CX, -CY);
  ctx.strokeStyle = stampColor;
  ctx.fillStyle = stampColor;

  // 外圈 / 内圈
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(CX, CY, 99, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(CX, CY, 58, 0, Math.PI * 2);
  ctx.stroke();

  // 五角星：外接 r=42 的十个顶点，内接 r=16.8
  const points = [
    [105, 63], [114.87, 91.41], [144.95, 92.02], [120.98, 110.19], [129.69, 138.97],
    [105, 121.8], [80.31, 138.97], [89.02, 110.19], [65.05, 92.02], [95.13, 91.41],
  ];
  ctx.beginPath();
  points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();

  arcRow(ctx, '代码急诊科', { radius: 76, top: true, weight: 600, fontSize: 25, family: sans, spacing: 6 });
  arcRow(ctx, '诊断专用章', { radius: 80, top: false, weight: 500, fontSize: 15, family: sans, spacing: 3 });
  ctx.restore();
}
