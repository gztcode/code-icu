/**
 * Code ICU · 病危通知书 Canvas 手绘（1080×1440）
 *
 * 严格按照 design-spec §10.2 的 48 条绘制表逐条执行，坐标一律照抄，不做"优化"。
 * 三条会让导出翻车的硬要求，在这里的实现位置：
 *
 *   1. 字体。`renderNotice` 先 `awaitFonts()`（type.js）再落笔。只等 `document.fonts.ready`
 *      不够：没人在页面上用 700 字重的 Martian Mono，这份 webfont 就不在排队里，
 *      ready 立刻 resolve，160px 的健康分改用 fallback 字体，整张卡坐标全错位。
 *   2. 不加载任何远程图片。头像位不画 GitHub 头像：跨域图片会把 canvas 变成 tainted，
 *      `toBlob` 直接抛 SecurityError。这张卡里一个 `drawImage` 都没有。
 *   3. 印章逐字旋转。见 stamp.js（Canvas 没有 textPath）。
 *
 * 尺寸：画布就是 1080×1440 **设备像素**，不乘 devicePixelRatio。乘了在 Retina 上会导出
 * 2160×2880，而交付要求是"恰好 1080×1440 像素"。所有坐标都在这个 1080×1440 的空间里，
 * 因此也不需要 `ctx.scale(DPR, DPR)`。
 *
 * 颜色全部读自 CSS 变量（type.js 的 `tokens()`），文件里没有一个裸 hex。
 * @module share/notice-card
 */

import { LEVEL_EN } from '../config.js';
import { breathSpanUnit, noticeCopy } from '../copy.js';
import { vitalTone } from '../metrics.js';
import { fmtDate } from '../dom.js';
import { traceOps } from '../components/ecg.js';
import { drawStamp } from './stamp.js';
import { awaitFonts, DISP, fill, MONO, SERIF, tokens } from './type.js';

/** 成品尺寸，就是交付尺寸 */
const W = 1080;
const H = 1440;

/** 监护条的位置与尺寸（§10.2 第 33 条） */
const STRIP = { x: 76, y: 800, w: 928, h: 58 };

/**
 * 把 720×208 的心电几何映射进监护条（928×58）。
 *
 * 不用 `ctx.scale(928/720, 58/208)`：非等比缩放会把 2px 的描边按方向压成不同粗细，
 * 垂直段细、水平段粗。改成对坐标点做线性映射、线宽留在成品空间里，笔画才均匀。
 * 几何本身来自 ecg.js 的 `traceOps`，与 DOM 预览共用一份，形状不可能对不上。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[]|undefined} monthly 12 个月提交数
 * @param {Record<string, any>} t Token
 * @returns {void}
 */
function drawTrace(ctx, monthly, t) {
  const sx = STRIP.w / 720;
  const sy = STRIP.h / 208;
  const px = (x) => STRIP.x + x * sx;
  const py = (y) => STRIP.y + y * sy;

  ctx.save();
  ctx.strokeStyle = t.trace;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const op of traceOps(monthly)) {
    if (op[0] === 'm') ctx.moveTo(px(op[1]), py(op[2]));
    else if (op[0] === 'q') ctx.quadraticCurveTo(px(op[1]), py(op[2]), px(op[3]), py(op[4]));
    else ctx.lineTo(px(op[1]), py(op[2]));
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * 画整张卡。调用前字体必须已经到位（renderNotice 负责）。
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} result analyze() 或 loadSnapshot() 的返回值
 * @returns {void}
 */
export function paintNotice(ctx, result) {
  const copy = noticeCopy(result);
  const t = tokens();
  const vitals = result?.vitals ?? [];
  const breathing = vitals.find((item) => item.key === 'breathing')?.detail ?? {};
  const commits = Number.isFinite(breathing.total) ? breathing.total : 0;
  const health = typeof result?.health === 'number' ? result.health : null;
  const level = result?.level ?? {};
  const chipColor = t.levels[level.tone] ?? t.levels.dead;

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  // 1-3 底纸 / 纸质横线 / 内框
  ctx.fillStyle = t.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = t.rule;
  for (let y = 39; y < H; y += 40) ctx.fillRect(0, y, W, 1);
  ctx.strokeStyle = t.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(36.5, 36.5, 1006, 1366);

  // 4-10 红头与标题
  fill(ctx, '代码急诊科', 76, 64, { font: `600 24px ${DISP}`, color: t.alarm, spacing: 10 });
  fill(ctx, `NO. ${copy.caseNo}`, 1004, 70, { font: `500 13px ${MONO}`, color: t.meta, spacing: 0.5, align: 'right' });
  ctx.fillStyle = t.alarm;
  ctx.fillRect(76, 104, 928, 3);
  ctx.fillRect(76, 111, 928, 1);
  fill(ctx, 'CRITICAL CONDITION NOTICE', 540, 146, {
    font: `500 12px ${MONO}`, color: t.alarm, spacing: 7, align: 'center',
  });
  fill(ctx, '病危通知书', 540, 182, { font: `500 60px ${SERIF}`, color: t.fg, spacing: 20, align: 'center' });
  fill(ctx, '兹将下列仓库经六项生命体征检查后的结果，通知如下：', 76, 266, {
    font: `400 17px ${DISP}`, color: t.muted,
  });

  // 11-13 患者信息表的外框与虚线
  ctx.strokeStyle = t.border;
  ctx.strokeRect(76.5, 310.5, 927, 163);
  ctx.strokeStyle = t.dash;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(540, 310);
  ctx.lineTo(540, 414);
  ctx.stroke();
  for (const y of [362, 414]) {
    ctx.beginPath();
    ctx.moveTo(76, y);
    ctx.lineTo(1004, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // 14-23 五格：表头 + 值（表格只有三行，第 3 行的表头在 420）
  const field = (x, labelY, label, valueY, value, font) => {
    fill(ctx, label, x, labelY, { font: `500 11px ${MONO}`, color: t.meta, spacing: 2 });
    fill(ctx, value, x, valueY, { font, color: t.fg });
  };
  field(96, 320, '患者 / PATIENT', 339, copy.patient, `500 17px ${MONO}`);
  field(560, 320, '送检时间 / SAMPLED', 339, copy.sampled, `500 17px ${MONO}`);
  field(96, 372, '病案号 / CASE NO.', 391, copy.caseNo, `500 17px ${MONO}`);
  field(560, 372, '主治 / ATTENDING', 391, '自动分诊系统 v1.0', `400 18px ${DISP}`);
  field(96, 420, '主诉 / CHIEF COMPLAINT', 439, copy.complaint, `400 18px ${DISP}`);

  // 24-27 健康分、分母、等级章
  fill(ctx, '健康分 / SCORE', 76, 490, { font: `500 11px ${MONO}`, color: t.meta, spacing: 2 });
  ctx.textBaseline = 'alphabetic';
  fill(ctx, health === null ? '—' : String(health), 76, 655, { font: `700 160px ${MONO}`, color: t.fg, spacing: -6 });
  ctx.textBaseline = 'top';
  fill(ctx, '/100', 292, 638, { font: `500 20px ${MONO}`, color: t.meta });
  ctx.strokeStyle = chipColor;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(76.5, 706.5, 172, 38);
  fill(ctx, `${level.label ?? '—'} · ${LEVEL_EN[level.level] ?? 'N/A'}`, 162, 716, {
    font: `500 13px ${MONO}`, color: chipColor, spacing: 2, align: 'center',
  });

  // 28-32 六项体征
  fill(ctx, '六项体征 / VITALS', 500, 490, { font: `500 11px ${MONO}`, color: t.meta, spacing: 2 });
  vitals.forEach((vital, index) => {
    const top = 516 + index * 44;
    const score = typeof vital.score === 'number' ? vital.score : null;
    const insufficient = vital.detail?.insufficient === true;
    fill(ctx, vital.label, 500, top + 14, { font: `400 15px ${DISP}`, color: t.fg });
    ctx.fillStyle = t.inset;
    ctx.fillRect(650, top + 19, 250, 5);
    // 0 分不补假填充：一条空轨道 + 一个 0.0，就是"没有生命体征"最准确的画法
    if (score !== null && score > 0) {
      ctx.fillStyle = t.vital(vitalTone(score));
      ctx.fillRect(650, top + 19, (250 * score) / 100, 5);
    }
    // 弃权项右边不能是「—」：读者分不清是没测还是缺数。与 DOM 版同源，都说「样本不足」。
    if (score === null && insufficient) {
      fill(ctx, '样本不足', 1004, top + 13, { font: `400 12px ${DISP}`, color: t.meta, align: 'right' });
    } else {
      fill(ctx, score === null ? '—' : score.toFixed(1), 1004, top + 12, {
        font: `500 14px ${MONO}`, color: t.fg2, align: 'right',
      });
    }
  });

  // 33-35 监护条 / 波形 / 年读数
  ctx.fillStyle = t.monitorBg;
  ctx.fillRect(STRIP.x, STRIP.y, STRIP.w, STRIP.h);
  drawTrace(ctx, breathing.monthly, t);
  // 单位跟着统计窗口走：15 天的仓库写「/ 年」等于把 8 次提交说成 8 次/年
  fill(ctx, `${commits} / ${breathSpanUnit(breathing.windowMonths)}`, 992, 808, {
    font: `500 9px ${MONO}`, color: t.monitorAlarm, align: 'right',
  });

  // 36-39 结论与治疗
  fill(ctx, '诊断结论 / CONCLUSION', 76, 878, { font: `500 11px ${MONO}`, color: t.meta, spacing: 2 });
  fill(ctx, copy.conclusion[0], 76, 898, { font: `510 32px ${DISP}`, color: t.fg });
  fill(ctx, copy.conclusion[1], 76, 946, { font: `510 32px ${DISP}`, color: t.fg });
  fill(ctx, copy.treatment, 76, 1018, { font: `400 17px ${DISP}`, color: t.muted });

  // 40-41 备注（右边界 596，印章左边界 606，不打架）
  fill(ctx, '备注 / REMARKS', 76, 1116, { font: `500 11px ${MONO}`, color: t.meta, spacing: 2 });
  copy.remarks.forEach((line, index) => {
    fill(ctx, line, 76, 1140 + index * 24, { font: `400 15px ${DISP}`, color: t.muted });
  });

  // 42-45 落款
  fill(ctx, 'ISSUED BY', 1004, 1116, { font: `500 11px ${MONO}`, color: t.meta, spacing: 2, align: 'right' });
  fill(ctx, '代码急诊科 · 自动分诊系统', 1004, 1138, { font: `400 17px ${DISP}`, color: t.fg2, align: 'right' });
  fill(ctx, 'DATE', 1004, 1166, { font: `500 11px ${MONO}`, color: t.meta, spacing: 2, align: 'right' });
  fill(ctx, copy.issuedOn, 1004, 1188, { font: `400 17px ${DISP}`, color: t.fg2, align: 'right' });

  // 46-48 页脚
  ctx.strokeStyle = t.dash;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(76, 1300);
  ctx.lineTo(1004, 1300);
  ctx.stroke();
  ctx.setLineDash([]);
  fill(ctx, '本通知书由 GitHub 公开 API 数据自动生成，不构成代码审查意见，也不构成医疗建议。', 76, 1322, {
    font: `400 12px ${DISP}`, color: t.meta,
  });
  fill(ctx, `CODE ICU · v1.0 · NO. ${copy.caseNo} · 1 / 1`, 76, 1348, {
    font: `500 11px ${MONO}`, color: t.meta,
  });

  // 49 印章，最后画
  drawStamp(ctx, t.stamp);
}

/**
 * 把通知书画到给定 canvas 上（尺寸即成品尺寸）。
 * @param {object} result
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderNotice(result, canvas) {
  await awaitFonts();
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('这个浏览器没有 Canvas 2D，换 Chrome / Safari / Firefox 再试');
  paintNotice(ctx, result);
  return canvas;
}

/**
 * 导出文件名：`code-icu-{owner}-{repo}-{YYYYMMDD}.png`。
 * 日期取通知书的签发日（与卡上 DATE 同一字段），不是"下载那一刻"，避免同一张卡两个日期。
 * @param {object} result
 * @returns {string}
 */
export function noticeFileName(result) {
  const slug = result?.slug ?? result?.repo?.full_name ?? 'unknown/repo';
  const [owner, repo] = slug.split('/');
  const date = (fmtDate(result?.fetchedAt ?? result?.analyzedAt) || '').replace(/-/g, '') || '00000000';
  return `code-icu-${owner}-${repo}-${date}.png`;
}

/**
 * 导出 PNG 并触发下载。返回 Blob 与文件名，方便测试直接落盘核对尺寸。
 * @param {object} result
 * @returns {Promise<{blob: Blob, filename: string, canvas: HTMLCanvasElement}>}
 */
export async function exportNoticePng(result) {
  const canvas = document.createElement('canvas');
  await renderNotice(result, canvas);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('导出失败：canvas 没有产出 PNG'))), 'image/png');
  });
  const filename = noticeFileName(result);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 下载已经交给浏览器，URL 可以回收了（留一拍给 Safari 缓冲）
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { blob, filename, canvas };
}
