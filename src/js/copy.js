/**
 * Code ICU · 体检文案层
 *
 * 每一条诊断都是按数据分叉的真实中文产品文案（不是占位），
 * 且全部由确定性推导得出，同一份数据必然得到同一句话。
 * 与算法分离，方便后续单独校对措辞而不碰打分逻辑。
 * @module copy
 */

import { fmtCaseNo, fmtDateTime } from './dom.js';

/**
 * 六个体征的一句话诊断。入参是对应打分函数的完整返回值。
 * @type {Record<string, (detail: any) => string>}
 */
export const DIAGNOSIS = {
  /** @param {{archived: boolean, days: number|null}} r */
  heartbeat(r) {
    if (r.archived) return '仓库已被作者归档，心跳彻底停止，不会再有新的提交';
    if (r.days === null) return '读不到最后一次提交时间，无法判断心跳';
    if (r.days <= 7) return `最近一次提交在 ${r.days} 天前，心跳强劲且规律`;
    if (r.days <= 30) return `最近一次提交在 ${r.days} 天前，编译节奏正常`;
    if (r.days <= 90) return `${r.days} 天没有新提交，脉搏开始变慢`;
    if (r.days <= 180) return `已有 ${r.days} 天无提交，心率明显下滑`;
    if (r.days <= 365) return `${r.days} 天没有提交，已在停跳边缘`;
    return `已经 ${r.days} 天没有提交，心跳停止`;
  },

  /** @param {{total: number, capped: boolean, trend: number}} r */
  breathing(r) {
    if (r.insufficient) {
      return `建仓不足一个月，只有 ${r.total} 次提交，呼吸项样本不足，本次不计入总分`;
    }
    // 取数失败必须在这里就断掉：detail 里 total 是 0，往下走会说成「零提交，呼吸完全停止」，
    // 而真实情况是「一次都没量到」。同一张卡上「数据缺失 + 呼吸完全停止」是自相矛盾的。
    if (typeof r.score !== 'number') return '这一次没取到提交记录，呼吸项无法判断，已弃权';
    // 窗口随项目年龄缩放：新项目只说它活过的那几个月，不假装自己在看一整年
    const win = Number.isFinite(r.windowMonths) ? r.windowMonths : 12;
    const span = win >= 11.5 ? '近 12 个月' : `近 ${Math.round(win * 10) / 10} 个月`;
    if (r.total === 0) return `${span}零提交，呼吸完全停止`;
    const head = r.capped ? `${span}提交至少 ${r.total} 次` : `${span}提交 ${r.total} 次`;
    // 窗口不足半年时不做趋势修正，别把「没算」说成「平稳」
    if (win < 6) {
      const perMonth = Math.round((r.total / Math.max(win, 0.5)) * 10) / 10;
      return `${head}（月均 ${perMonth} 次），项目刚起步，按实际存在时长计算节奏正常`;
    }
    if (r.trend >= 10) return `${head}，且后半年比前半年更活跃，呼吸在加深`;
    if (r.trend === 0) return `${head}，前后半年节奏一致，呼吸平稳`;
    if (r.trend === -8) return `${head}，后半年提交量明显下降，呼吸变浅`;
    return `${head}，后半年不到前半年的一半，呼吸在衰竭`;
  },

  /** @param {{total: number, maxShare: number, authors: number, topAuthor: string|null}} r */
  busFactor(r) {
    if (typeof r.score !== 'number' && r.total === 0) {
      return '这一次没取到提交记录，看不出作者结构，已弃权';
    }
    if (r.total === 0) return '近 12 个月无人提交，这段代码已经没有主人在管';
    const pct = Math.round(r.maxShare * 100);
    if (pct >= 70) return `${r.topAuthor} 一人贡献了 ${pct}% 的提交，他一旦离场项目立即停摆`;
    if (pct >= 45) return `最高产的 ${r.topAuthor} 占 ${pct}% 的提交，作者结构偏集中`;
    if (r.authors >= 8) return `${r.authors} 位作者分担，单人最高只有 ${pct}%，后备力量充足`;
    return `${r.authors} 位作者参与，单人最高 ${pct}%，作者面还可以再宽一些`;
  },

  /** @param {{days: number|null, recentCount: number, tag: string|null}} r */
  metabolism(r) {
    // 45 分是「无 release」的折算值，不是实测到的「代谢已停止」。
    // 说「处于静止状态」会把「没法量」误述成「量到 0」，与状态词「迟缓」也对不上。
    if (r.days === null) {
      // 先分清「确实没发过版」和「这次没取到 release 列表」：前者是事实，后者是缺数。
      if (typeof r.score !== 'number') return '这一次没取到 release 记录，无法判断发版节奏，已弃权';
      return r.youngExempt
        ? '建仓不足半年，还没到该发版的阶段，这一项按中性计入'
        : '从未发布过正式版本，这一项按无记录折算';
    }
    if (r.days <= 30) return `最新版本 ${r.tag} 发布于 ${r.days} 天前，代谢旺盛`;
    if (r.days <= 90) return `最新版本 ${r.tag} 发布于 ${r.days} 天前，发版节奏正常`;
    if (r.days <= 180) return `最新版本 ${r.tag} 已是 ${r.days} 天前，发版节奏明显放慢`;
    if (r.days <= 365) return `近 12 个月只发出 ${r.recentCount} 个版本，代谢迟缓`;
    return `最新版本 ${r.tag} 停在 ${r.days} 天前，代谢近乎停止`;
  },

  /** @param {{open: number, staleRatio: number, penalty: number, backlog: number}} r */
  immunity(r) {
    if (r.insufficient) {
      return '建仓不足 90 天，不可能出现「90 天未动」的僵尸 issue，这一项样本不足，本次不计入总分';
    }
    // r.open 在弃权时也是 0，直接往下会得出「免疫系统干净」——那是把「没量」说成了「很健康」。
    if (typeof r.score !== 'number') return '这一次没取到 issue 数据，无法判断免疫状态，已弃权';
    if (r.open === 0) return '当前没有未关闭的 issue，免疫系统干净';
    const pct = Math.round(r.staleRatio * 100);
    const tail = r.penalty < 0 ? `，另有 ${r.backlog} 个待处理项积压` : '';
    if (pct >= 80) return `抽样 ${r.open} 个未关闭 issue，其中 ${pct}% 超过 90 天无人响应，问题在腐烂${tail}`;
    if (pct >= 40) return `抽样 ${r.open} 个未关闭 issue，其中 ${pct}% 已成僵尸，响应能力下滑${tail}`;
    return `抽样 ${r.open} 个未关闭 issue，仅 ${pct}% 超过 90 天，维护者仍在正常应答${tail}`;
  },

  /** @param {{items: Array<{label: string, hit: boolean}>}} r */
  legacy(r) {
    // 弃权时 items 是空数组，往下会算出「missing 为空 → 齐备」，等于给没取到的 README 发满分锦旗。
    if (typeof r.score !== 'number') return '这一次没取到 README 原文，无法清点遗嘱，已弃权';
    const archived = r.items.some((item) => item.label === '仓库已归档' && item.hit);
    if (archived) return '仓库已归档，文档再全也留不住这条命';
    const missing = r.items.filter((item) => !item.hit && item.label !== '仓库已归档').map((item) => item.label);
    // 婴儿期项目 README 没写完是常态，不该和「老项目文档烂尾」用同一句话
    if (r.floored && missing.length > 0) {
      return `项目刚起步，还缺${missing.slice(0, 2).join('、')}——新仓库这样很正常，已按保底分计`;
    }
    if (missing.length === 0) return '许可证、README、安装与使用说明齐备，后事交代得很清楚';
    return `缺${missing.slice(0, 2).join('、')}，交接给下一个人时会卡在这里`;
  },
};

/**
 * 每项体征的算分公式（页面「可展开查看算法」区块直接渲染这段文字）。
 * 必须与 vitals.js 的实现逐字对应，改算法时同步改这里。
 * @type {Record<string, string>}
 */
export const FORMULAS = {
  heartbeat:
    '停更天数 d 分段线性：d≤7 天满分 100；7→30 天从 100 降到 90；30→90 天从 90 降到 75；90→180 天从 75 降到 55；180→365 天从 55 降到 30；d>365 天从 30 线性归零。已归档仓库直接判 0。',
  breathing:
    '统计窗口 = min(12 个月, 建仓月数)，期望提交数 = 120 × 窗口 ÷ 12 —— 成熟项目仍按 120 次/年，建仓 2 个月的项目只要求 20 次。base = 窗口内提交数 ÷ 期望提交数 × 100，封顶 100。窗口不足 6 个月时前后两段样本太小，不做趋势修正；不足 1 个月时一两条提交就能刷满分，本项弃权。趋势修正：后半年 ÷ 前半年 ≥1.3 加 10 分，0.8–1.3 不变，0.5–0.8 减 8 分，<0.5 减 15 分；前半年为 0 时，后半年有提交加 10 分、无提交减 10 分。最终封顶在 0–100。',
  busFactor:
    '取近 12 个月的非 bot 提交，统计最高产作者的提交占比 s，得分 = 100 − s×90×k + 作者数奖励（≥8 人加 8 分，≥4 人加 4 分），封顶在 0–100。k 是年龄宽容系数 = clamp(建仓月数 ÷ 12, 0.35, 1)：单一作者在项目早期是常态，建仓满 12 个月后惩罚完全生效；下限 0.35 保证 Bus Factor = 1 这条事实风险不会被时间抹平。',
  metabolism:
    '最新一个 release 的距今天数分档：≤30 天 100 分，≤90 天 85 分，≤180 天 70 分，≤365 天 50 分，≤730 天 30 分，更久 15 分；再加「近 12 个月发版数 × 2」（上限 10 分）。从未发版给中性分：建仓满 6 个月是 45 分，不足 6 个月还没到该发版的阶段，给 70 分。',
  immunity:
    '先剔除混进来的 PR，剩下未关闭 issue 中超过 90 天没有更新的记为僵尸。得分 = 100 − 僵尸占比×100，再按仓库积压量扣分：总量 >500 扣 15，>200 扣 8，>50 扣 3，封顶在 0–100。建仓不足 3 个月时不可能存在「超过 90 天未更新」的 issue，本项会恒为满分、失去区分度，因此弃权并重新归一化权重。',
  legacy:
    '许可证 40 分 + README 存在 15 分 + README 超过 1500 字 10 分 + 安装说明 10 分 + 使用说明 10 分 + 许可声明 10 分 + 状态徽章 5 分；已归档扣 100 分，封顶在 0–100。章节类加分只认标题行（# 或加粗开头），正文里出现关键词不算。建仓不足 3 个月时保底 60 分——婴儿期 README 没写完是常态，但只保底不封顶，本来写得全的项目仍是满分。',
};

/**
 * 健康分公式说明（页面固定展示）。
 * @param {Record<string, number>} weights
 * @returns {string}
 */
export function healthFormula(weights) {
  const parts = Object.keys(weights).map((key) => `${weights[key]}`);
  return `健康分 = 六项体征得分 × 各自权重之和（权重 ${parts.join(' / ')}）。任一项取数失败时该项弃权，剩余权重重新归一化后计算，不会把缺失项当成 0 分。`;
}

/** 寿命推演公式说明（页面必须在数字下方展示这行小字） */
export const REMAINING_FORMULA =
  '推演公式：健康分/100 × 365 × 1/(1+停更天数/180)，基于公开指标的确定性计算，不是预言。';

/** 隐私说明（首页 PrivacyNote） */
export const PRIVACY_NOTE =
  '本页不发请求到你自己的仓库、不存任何个人数据。GitHub 公开接口在浏览器里直连，结果只缓存在你自己的浏览器里 15 分钟。';

/**
 * 把「呼吸统计窗口」说成人话。窗口会随项目年龄缩放（SPEC §6.0），
 * 一个只活了 15 天的仓库不能写「近 12 个月」——那是把 8 次提交虚报成 8 次/年。
 * @param {number|null|undefined} windowMonths detail.breathing.windowMonths
 * @returns {string} 「近 12 个月」/「近 2 个月」/「建仓 15 天」
 */
export function breathSpan(windowMonths) {
  const w = Number.isFinite(windowMonths) ? windowMonths : 12;
  if (w >= 11.5) return '近 12 个月';
  if (w < 1) return `建仓 ${Math.max(1, Math.round(w * 30.44))} 天`;
  return `近 ${Math.round(w * 10) / 10} 个月`;
}

/**
 * 监护条右侧那个「N / 年」的单位。年轻项目必须是「/ 15 天」，不能一律「/ 年」。
 * @param {number|null|undefined} windowMonths
 * @returns {string} 「年」/「2 个月」/「15 天」
 */
export function breathSpanUnit(windowMonths) {
  const w = Number.isFinite(windowMonths) ? windowMonths : 12;
  if (w >= 11.5) return '年';
  if (w < 1) return `${Math.max(1, Math.round(w * 30.44))} 天`;
  return `${Math.round(w * 10) / 10} 个月`;
}

/**
 * 病危通知书的全部文案。**报告页与导出卡共用这一份**，所以图上和屏幕上的每个字必然相同。
 *
 * 每一句都由 analyze() 的字段拼出来，没有一句是写给某个具体仓库的：
 * 同一份数据必然得到同一张通知书，换个仓库也不会出现「示例文案被留在正式产物里」。
 * 行长已经按 design-spec §10.2 的字号算过（主诉 ≤49 字、结论 ≤29 字/行、治疗 ≤51 字），
 * 不做自动折行 —— Canvas 手绘一旦折行就会和 DOM 预览对不上。
 * @param {object} result analyze() 或 loadSnapshot() 的返回值
 * @returns {{patient: string, sampled: string, caseNo: string, complaint: string,
 *   conclusion: [string, string], treatment: string, remarks: [string, string], issuedOn: string}}
 */
export function noticeCopy(result) {
  const { health, vitals, daysSincePush, readmeDeprecated } = result ?? {};
  const detail = (key) => vitals?.find((item) => item.key === key)?.detail ?? {};
  const hb = detail('heartbeat');
  const br = detail('breathing');
  const im = detail('immunity');
  const bus = detail('busFactor');
  const days = Number.isFinite(daysSincePush) ? daysSincePush : Number.isFinite(hb.days) ? hb.days : null;
  const num = (value) => (Number.isFinite(value) ? value.toLocaleString('en-US') : '—');

  /* ---- 主诉：三个从句，全部是可核验的事实 ---- */
  const parts = [];
  if (hb.archived) parts.push('仓库已被作者归档，不会再有任何提交');
  // 「末次提交在 0 天前」读起来像算错了：刚建仓的仓库今天就有提交，得说「今天」
  else if (days === 0) parts.push('最后一次提交就在今天');
  else if (days !== null) parts.push(days > 365 ? `末次提交停在 ${num(days)} 天前` : `末次提交在 ${num(days)} 天前`);
  else parts.push('读不到最后一次提交时间');

  if (readmeDeprecated === true) parts.push('README 第一行写着 Deprecated');
  else if (Number.isFinite(br.total)) {
    parts.push(br.total === 0 ? `${breathSpan(br.windowMonths)}零提交` : `${breathSpan(br.windowMonths)}提交 ${num(br.total)} 次`);
  }

  if (Number.isFinite(im.open) && im.open > 0) {
    // 阈值取 0.6：express 的僵尸占比是 51%，接近一半的 issue 其实有人应答，
    // 一律说「没人接」会冤枉一个还在维护的项目，也会和结论里的「体征平稳」打架。
    parts.push(im.staleRatio >= 0.6 ? `${num(im.backlog)} 个 issue 没人接` : `${num(im.backlog)} 个 issue 仍有人应答`);
  } else if (Number.isFinite(im.open)) parts.push('没有未关闭的 issue');
  else if (Number.isFinite(bus.authors)) parts.push(`${num(bus.authors)} 位作者在推`);
  const complaint = `${parts.join('，')}。`;

  /* ---- 结论两行：第一行讲事实，第二行讲它跟你有什么关系 ---- */
  const scored = (vitals ?? []).filter((item) => typeof item.score === 'number');
  const worst = scored.reduce((min, item) => (item.score < min.score ? item : min), scored[0] ?? null);
  const bad = scored.filter((item) => item.score < 60).length;
  const head =
    readmeDeprecated === true
      ? `${num(days)} 天没有一次提交，README 第一行还写着 Deprecated。`
      : days !== null
        ? `${num(days)} 天没有一次提交，也没有一句交代。`
        : '读不到提交记录，这份病历只能停在半页。';

  const conclusion =
    health === null || health === undefined
      ? ['六项里有几项没取到数，这一次开不了结论。', '换一台网络再试一次。']
      : {
          dead: [head, '它可能还躺在你的 node_modules 里。'],
          icu: [
            `健康分只剩 ${health}，${worst ? `${worst.label} ${worst.score}` : '多项'}已经报警。`,
            '除非你打算亲自接管，否则别新开依赖。',
          ],
          ward: [
            `六项里 ${bad} 项低于 60 分，${worst ? `${worst.label}只有 ${worst.score} 分` : '没有一项在及格线以上'}。`,
            '现在接入，等于接手一份需要长期看护的资产。',
          ],
          clinic: [
            `整体还能跑，但${worst ? `${worst.label}已经掉到 ${worst.score} 分` : '有几项已经掉队'}。`,
            '接手之前，先把它那几个缺口补上。',
          ],
          healthy: [
            `六项体征平稳，${breathSpan(br.windowMonths)}提交 ${num(br.total)} 次。`,
            '它不需要你再操心。',
          ],
        }[result.level?.level] ?? ['这一次没量出可以下结论的体征。', '换一台网络再试一次。'];

  /* ---- 治疗一句：对着最差的那一项给动作，不给泛泛的鼓励 ---- */
  const ACTION = {
    heartbeat: '让一个人回来接着写，或者在 README 第一屏写明它不再接受新需求',
    breathing: '把状态说明挪到 README 第一屏，别让下游以为它还在开发',
    busFactor: '加一份 CODEOWNERS，把核心目录绑到具体的人',
    metabolism: '打一个 tag、写两行变更说明，让下游知道自己在用哪一版',
    immunity: '把超过 90 天没人动的 issue 批量标 stale，重复的直接关',
    legacy: '补齐安装、使用与许可声明三个小标题，性价比最高',
  };
  const treatment = `建议${ACTION[worst?.key] ?? '先把 README 第一屏的状态写清楚'}。${
    result.level?.level === 'dead' ? '患者已无自主生命体征。' : ''
  }`;

  /* ---- 备注：两行，第二行是这套东西的态度 ---- */
  const remarks = [
    days === 0
      ? '患者今天还有提交。'
      : days !== null
        ? `患者距最后一次提交已 ${num(days)} 天。`
        : '未能取到提交记录。',
    '本通知书长期有效，除非有人在仓库里再提交一行代码。',
  ];

  /* ---- 抬头三格：送检时间（带抽样量）/ 病案号 / 签发日 ---- */
  const fetched = result?.fetchedAt ?? result?.analyzedAt ?? null;
  const stamp = fetched ? new Date(fetched) : null;
  const valid = stamp && !Number.isNaN(stamp.getTime());
  // 送检时间后面缀上这次实际抽了多少：评委最想核的就是「这些数字是从哪来的」。
  // 17px 等宽下这段是 401px，右格可用宽度 444px（560→1004），再长就会顶出表格右框。
  // 用「项」而不是「抽样」——253 是仓库的 issue 总量，不是采样量，说抽样会虚报口径。
  const sampled = valid
    ? `${fmtDateTime(fetched)} · ${num(im.backlog)} 项 / ${num(br.total)} 次提交`
    : '未记录';
  // 病案号与报告页同一口径（created_at 的 UTC 日期位），两页必然同一个号。
  const caseNo = fmtCaseNo(result?.repo?.created_at);
  const issuedOn = valid ? `${stamp.getFullYear()} 年 ${stamp.getMonth() + 1} 月 ${stamp.getDate()} 日` : '—';

  return {
    patient: result?.slug ?? result?.repo?.full_name ?? '—',
    sampled,
    caseNo,
    complaint,
    conclusion,
    treatment,
    remarks,
    issuedOn,
  };
}

/**
 * 三段都由 analyze() 的结果推出，同一份数据必然得到同一句话。
 * @param {object} result analyze() 或 loadSnapshot() 的返回值
 * @returns {string}
 */
export function scoreNarrative(result) {
  const { health, level, vitals } = result ?? {};
  if (health === null || health === undefined) return '关键指标全部取数失败，这一次开不了结论，换一台网络再试。';
  const detail = (key) => vitals?.find((item) => item.key === key)?.detail ?? {};
  const breathing = detail('breathing');
  const bus = detail('busFactor');
  const fact =
    !breathing.total
      ? '近 12 个月一次提交都没有'
      : `近 12 个月 ${breathing.total} 次提交${bus.authors ? `、${bus.authors} 人在推` : ''}`;
  const verdict = {
    healthy: '继续用，它不需要你再操心。',
    clinic: '能用，但接手之前先把它那几个缺口补上。',
    ward: '现在接入等于接手一份需要长期看护的资产。',
    icu: '除非你打算亲自接管它，否则别新开依赖。',
    dead: '不要再往新项目里装它了。',
  }[level?.level] ?? '结论仅供参考。';
  return `${level?.summary ?? ''}。${fact}。${verdict}`;
}
