#!/usr/bin/env node
/**
 * Code ICU · 图标 sprite 同步工具
 *
 * 唯一可信来源是 src/index.html 里 `@icon-sprite` 之间那段内联 `<symbol>`。
 * 本脚本做两件事：
 *   node tests/build-icons.mjs          把内联 sprite 同步到 assets/icons.svg（独立可预览的 SVG 文件）
 *   node tests/build-icons.mjs --check  只校验两者一致，不一致就退 1（给自测当门禁用）
 *
 * 为什么 sprite 必须内联在 HTML 里：`<use href="#id">` 引用同文档的 symbol 在所有目标浏览器里
 * 都是同步可用的；外部文件引用（`icons.svg#id`）在 Safari 上有加载时序问题，会闪一下再出现。
 * @module tests/build-icons
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const INDEX = path.join(ROOT, 'src', 'index.html');
const SPRITE = path.join(ROOT, 'assets', 'icons.svg');
const MARKER = '<!-- @icon-sprite:symbols -->';

/**
 * 取出 index.html 里两个标记之间的完整 sprite 块。
 * @param {string} html
 * @returns {{ block: string, symbols: string[] }}
 */
function extract(html) {
  const start = html.indexOf('@icon-sprite:start');
  const end = html.indexOf('@icon-sprite:end');
  if (start < 0 || end < 0) throw new Error('index.html 缺少 @icon-sprite 标记');
  const block = html.slice(html.indexOf('<svg', start), html.lastIndexOf('</svg>', end) + 6);
  const symbols = block.match(/<symbol id="i-[^"]+"[\s\S]*?<\/symbol>/g) ?? [];
  return { block, symbols };
}

/**
 * 组装独立的 assets/icons.svg。
 * @param {string[]} symbols
 * @returns {string}
 */
function standalone(symbols) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Code ICU 图标 sprite · Lucide v1.61.0（ISC）
  24×24 网格 / 1.5 描边 / fill:none / 颜色继承 currentColor。
  本文件由 tests/build-icons.mjs 从 src/index.html 生成，不要手改。
  运行时不引用这个文件（sprite 已内联进 index.html），它只用于预览与第三方工具取图。
-->
<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
${symbols.join('\n')}
</svg>
`;
}

async function main() {
  const check = process.argv.includes('--check');
  const html = await readFile(INDEX, 'utf8');
  const { symbols } = extract(html);
  if (symbols.length === 0) throw new Error(`index.html 的 sprite 里没有 symbol（占位标记 ${MARKER} 是否还在？）`);

  const duplicate = symbols.map((s) => s.match(/id="([^"]+)"/)[1]).filter((id, i, all) => all.indexOf(id) !== i);
  if (duplicate.length) throw new Error(`sprite 里有重复 id：${[...new Set(duplicate)].join(', ')}`);

  const next = standalone(symbols);
  let prev = '';
  try {
    prev = await readFile(SPRITE, 'utf8');
  } catch {
    prev = '';
  }

  if (check) {
    if (prev !== next) throw new Error('assets/icons.svg 与 index.html 内联 sprite 不一致，请跑 node tests/build-icons.mjs');
    console.log(`图标 sprite 一致：${symbols.length} 枚 symbol`);
    return;
  }
  await writeFile(SPRITE, next, 'utf8');
  console.log(`已同步 assets/icons.svg（${symbols.length} 枚 symbol，${next.length} 字节）`);
}

main().catch((error) => {
  console.error(`图标同步失败：${error.message}`);
  process.exit(1);
});
