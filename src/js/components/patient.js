/**
 * Code ICU · 患者档案
 *
 * 报告第一屏：这是谁、多大年纪、多少人关注、多久没动。
 * 头像用 owner 首字母的方块，不加载 GitHub 的头像图 —— 一张 40KB 的 PNG 换不来信息量，
 * 而多一个跨域请求就多一处断网时开天窗的地方。
 * @module components/patient
 */

import { esc, fmtDate, fmtDateTime, icon, num, safeUrl, stripEmoji } from '../dom.js';

/**
 * @param {object} result analyze() 或 loadSnapshot() 的返回值
 * @returns {string} HTML
 */
export function patientSection(result) {
  const { repo, fetchedAt } = result;
  const owner = repo.owner?.login ?? (result.slug ?? '').split('/')[0] ?? '';
  const initials = owner.slice(0, 2).toUpperCase() || '??';
  const fetched = fetchedAt ? fmtDateTime(fetchedAt).slice(5, 16) : '—';
  // 渲染层清洗（SPEC §8.2）：数据层保留 API 原文，这里剥掉 emoji 再把连续空格压平。
  // request/request 的官方简介以一个泳者表情开头（U+1F3CA U+1F3FE），后面才是
  // "Simplified HTTP request client."。不清洗的话泳者会出现在病历抬头旁边。
  const desc = stripEmoji(repo.description) || '这个仓库没有写简介。';

  // 项目年龄是读懂后面所有分数的前提（SPEC §6.0）：不写「建仓 2 个月」，
  // 用户就无法理解为什么免疫项是「样本不足」、为什么呼吸只统计了两个月。
  // 不足 12 个月按月说（体检语义），满 12 个月改说年（一年 30.44 天，与 ageMonthsOf 同口径）。
  const ageMonths = result.ageMonths;
  const ageLabel =
    typeof ageMonths === 'number' && Number.isFinite(ageMonths)
      ? ageMonths < 12
        ? `${Math.round(ageMonths * 10) / 10} 个月`
        : `${(ageMonths / 12).toFixed(1).replace(/\.0$/, '')} 年`
      : '读不到建仓时间';

  // 三个可点元素（SPEC §8.4）：头像、用户名 → owner 的 GitHub 主页；项目名 → 仓库主页。
  // URL 一律过 safeUrl()：它们来自 API，不能不校验就塞进 href。
  const ownerUrl = safeUrl(repo.owner?.html_url);
  const repoUrl = safeUrl(repo.html_url);
  // 头像图加载失败时（断网 / 头像被删）回落成首字母色块，跟设计稿一致。
  const avatarUrl = safeUrl(repo.owner?.avatar_url, 'avatars.githubusercontent.com');
  const avatarInner = avatarUrl
    ? `<img src="${esc(avatarUrl)}" alt="" loading="lazy" decoding="async"
         onerror="this.remove()">`
    : '';
  const avatar = ownerUrl
    ? `<a class="avatar avatar-link" href="${esc(ownerUrl)}" target="_blank" rel="noopener noreferrer"
         title="在 GitHub 上查看 ${esc(owner)}">${avatarInner}<span>${esc(initials)}</span></a>`
    : `<div class="avatar">${avatarInner}<span>${esc(initials)}</span></div>`;

  const ownerNode = ownerUrl
    ? `<a class="p-owner p-link" href="${esc(ownerUrl)}" target="_blank" rel="noopener noreferrer"
         title="在 GitHub 上查看 ${esc(owner)}">${esc(owner)}</a>`
    : `<div class="p-owner">${esc(owner)}</div>`;

  const repoName = esc(repo.name ?? result.slug ?? '');
  const nameNode = repoUrl
    ? `<a class="p-name p-link" href="${esc(repoUrl)}" target="_blank" rel="noopener noreferrer"
         title="在 GitHub 上查看 ${esc(repo.full_name ?? repoName)}">${repoName}</a>`
    : `<div class="p-name">${repoName}</div>`;

  const meta = [
    ['star', 'STARS', num(repo.stargazers_count), false],
    ['git-fork', 'FORKS', num(repo.forks_count), false],
    ['circle-dot', 'OPEN ISSUES', num(repo.open_issues_count), false],
    ['code-2', 'LANGUAGE', repo.language ?? '未标注', false],
    ['scale', 'LICENSE', repo.license?.spdx_id ?? '无许可证', false],
    ['calendar-clock', 'LAST COMMIT', fmtDate(repo.pushed_at), false],
    // 独占一行的第 7 格：六格网格的尾巴留空比塞满更好看，也把「年龄」从事实清单里拎出来
    ['clock', '建仓 / CREATED', ageLabel, true],
  ]
    .map(
      ([ic, key, value, wide]) => `<div class="meta-item${wide ? ' meta-wide' : ''}">
          ${icon(ic)}
          <div><div class="meta-k">${key}</div><div class="meta-v">${esc(value)}</div></div>
        </div>`,
    )
    .join('');

  return `<section class="sheet">
      <div class="sheet-head">
        <span class="label">患者档案 / PATIENT FILE</span>
        <span class="num">抓取于 ${fetched}</span>
      </div>
      <div class="patient">
        ${avatar}
        <div class="p-id">
          ${ownerNode}
          ${nameNode}
          <p class="p-desc">${esc(desc)}</p>
        </div>
      </div>
      <div class="meta-grid">${meta}</div>
    </section>`;
}
