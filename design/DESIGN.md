# Code ICU · DESIGN.md

> 生成日期：2026-10-26 ｜ 设计师：颜好看 ｜ 基于：PRD「代码 ICU」+ 团队任务书
> 三轴刻度：`DESIGN_VARIANCE = 6` / `MOTION_INTENSITY = 5` / `VISUAL_DENSITY = 6`
> 寄存器：Product（设计服务产品）。技术栈：纯静态 Web，原生 ES Module，零构建，无后端。
> 详细规格见 `design-spec.md`；Token 见 `design-tokens.json` / `design-tokens.css`；图标见 `icon-list.md`。

---

## 1. Visual Theme & Atmosphere

**视觉主题关键词**：急诊病历 · 仪器读数 · 冷静的黑色幽默

**氛围**：一张摊在灯下的纸质病历。暖白纸面，极淡的横向格线，等宽字体的测量值像打印机刚吐出来。全页只有一个地方是"活的"——那块嵌在纸里的深色监护屏，荧光绿的波形在上面走。红色只出现在两种地方：病危等级，和最后盖上的一枚章。

**对标**：Stripe Dashboard 的精确感 · 医院检验单的诚实感 · Linear 的克制 · 反过来刻意**不学** Vercel（那是每个 AI 项目的第一反应）。

**记忆点三件套**：① 心电图波形（12 个月 = 12 个心搏）② 红色圆形印章 ③ 打印表单的虚线分隔。

---

## 2. Color Palette & Roles

### A1-identity（品牌核心）

| Token | Hex | 角色 | 对比度 |
|---|---|---|---|
| `--bg` | `#FAFAF7` | 病历纸底 | — |
| `--surface` | `#FFFFFF` | 卡片（打印表格纸） | — |
| `--fg` | `#161815` | 墨色主文本（带绿调的近黑，非纯黑） | 17.08:1 |
| `--muted` | `#5C635B` | 副文本 | 5.92:1 |
| `--accent` | `#067647` | 监护绿：焦点环、内联链接、选中态 | 5.44:1 |
| `--border` | `#DCDBD1` | 实线边框 | — |

### A2-semantic

| Token | Hex | 角色 |
|---|---|---|
| `--success` | `#067647` | 同 accent |
| `--warn` | `#A16207` | 住院级 |
| `--danger` / `--alarm` | `#C1272D` | 病危、印章 | 5.59:1 |
| `--focus-ring` | `#067647` | 焦点环 |

### B-slot 别名

| Token | 值 | 说明 |
|---|---|---|
| `--fg-2` | `#2E332E` | 次强文本 12.33:1 |
| `--meta` | `#6A7066` | 等宽小标签 4.87:1 |
| `--surface-2` | `#F4F3ED` | 表单抬头条 |
| `--surface-inset` | `#EAE9E1` | 凹陷 / 轨道 |
| `--action` | `#161815` | 主按钮底色（墨黑） |
| `--action-on` | `#FAFAF7` | 主按钮文字 17.08:1 |

### C-extension（项目专属）

分诊五色：`--level-healthy #067647` / `--level-clinic #2F6D8F` / `--level-ward #A16207` / `--level-icu #C2410C` / `--level-dead #C1272D`

监护屏：`--monitor-bg #0E1613` / `--monitor-grid #1E2B25` / `--monitor-grid-2 #2A3A32` / `--monitor-trace #3BF08C`(12.28:1) / `--monitor-text #C8E6D6` / `--monitor-muted #6E8C7C` / `--monitor-alarm #FF6B5E`

印章：`--stamp #C1272D` + `--stamp-opacity .88`

### 强调色使用纪律

**每屏可见的 `--accent` 使用 ≤ 2 处**（不含六项体征的状态色）。主按钮是墨黑，不是绿 —— 绿色一旦被用作 CTA 就贬值为"品牌色"，失去"生命体征正常"的语义。

配色来源：`references/design-systems/color-palettes.md` 第 7 套「医疗青绿」的语义结构 + 第 6 套「金融 Dashboard 深色」的数据高亮逻辑，两者重组（浅纸 + 深屏），色相全部替换为项目自定义值。

---

## 3. Typography

### 字族

```css
--font-display / --font-body: "Archivo", "PingFang SC", "Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", system-ui, sans-serif;
--font-mono: "Martian Mono", "SF Mono", "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace;
--font-serif-alt: "Songti SC", "Source Han Serif SC", "Noto Serif SC", serif;   /* 仅病危通知书标题 */
```

Google Fonts：

```html
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Martian+Mono:wght@400;500;700&display=swap" rel="stylesheet">
```

**中文不上 webfont**：思源黑全字重子集 3–6MB，与"零构建 / 弱网可用"冲突。中文走系统 PingFang SC / Microsoft YaHei —— 这是零成本的最优解。拉丁与数字上 webfont，因为它们是品牌的"仪器读数"部分。

### 字号阶梯

`2xs 10 / xs 12 / sm 13 / base 15 / md 17 / lg 20 / xl 24 / 2xl 30 / 3xl 38 / 4xl 48(桌面 56) / 5xl 64(桌面 88)`

### 字重三级

`400 Read` / `510 Emphasize` / `590 Announce`

### 行高与字距

- 正文 `1.65`（中文长文），标题 `1.2`，展示 `1.05`，等宽 `1.15`
- 中文标题 `-0.012em` ~ `-0.022em`；正文 `0`
- **全大写拉丁标签必须 `0.12em`**；`CODE ICU` 字标 `0.16em`
- 等宽数字 `0` + `tabular-nums`

配对来源：`references/design-systems/typography-pairings.md` 第 7 套「Developer Mono 开发者等宽」的骨架（Mono + Sans）改造 —— 用 Martian Mono 替换 JetBrains Mono 以获得更强的"仪表读数"字面（窄体、高字身），用 Archivo 替换 IBM Plex Sans 以避开反射性默认值。

---

## 4. Components

| 组件 | 规格 |
|---|---|
| **Button** | 高 44px，圆角 3px，内边距 0 18px，字号 15 / 字重 510。primary = `--action` 墨黑填 + `--action-on` 字；ghost = 透明 + 1px `--border`；hover 各降/升一档；active `translateY(1px)`；disabled `opacity .45`；loading 内嵌 16px 旋转图标 |
| **Input** | 高 44px，背景 `--bg`（比卡片暗一档 = "填写区"），1px `--border`；左侧 `github.com/` 等宽前缀 + 1px 虚线竖分隔；`:focus-within` → 边框 `--accent` + `0 0 0 3px var(--accent-soft)` |
| **Card / Sheet** | 1px `--border` + 圆角 4px + **无阴影**；可选抬头条（`--surface-2` 底 + 10px 等宽全大写标签 + 右侧 `字段 01`） |
| **Chip** | 高 22/26px，1px `currentColor` 边，圆角 2px，10–11px 等宽 + `0.08em` 字距。五色对应五个分诊等级 |
| **评级条** | 5 段等高（6px）方块 + 3px 间隙；轨道 `--surface-inset`，填充为该体征等级色；段数 = `round(score / 20)` |
| **分诊标尺** | 5 段，宽度按分值区间跨度加权 `30/20/20/15/16`（对应 0–29 / 30–49 / 50–69 / 70–84 / 85–100）；当前档 `opacity 1`，其余 `.16`；下方两行标签（等级名 + 分值区间，9px 等宽） |
| **监护屏** | 深色 `--monitor-bg`，圆角 4px，SVG `<pattern>` 双层网格（24 / 120px），`LIVE` 呼吸点（1.8s） |
| **详情折叠** | 原生 `<details>` + `<summary>`，`chevron-down` 180° 旋转 220ms |
| **时间轴** | 左侧 1px 虚线 + 7px 方形节点（最新一个实心 `--accent`），倒序，日期等宽 |
| **异常卡** | 38px 图标方框（1px `currentColor` 边）+ 标题 + 等宽错误码 + 正文 + 虚线分隔的等宽技术信息块 + 动作区 |
| **印章** | 渲染尺寸 180×180（内部 210 局部坐标 ×0.857），双圆环 + 五角星 + 弧形文字，`rotate(-9deg)` / `opacity .9` / `mix-blend-mode: multiply`；位置 606,1042，左右都留出不压文字的缝 |

**图标**：锁定 **Lucide v1.61.0**，24px 网格，`stroke-width: 1.5`，三档尺寸 16 / 20 / 24px。全项目只用这一套。**零 emoji 作为功能图标。**

---

## 5. Layout & Spacing

- **间距基准**：4px 网格，只用 `4 8 12 16 20 24 32 48 64 80`
- **圆角阶梯**：`2 / 3 / 4 / 6 / full`，卡片上限 **4px**（纸质表单的角是切的）
- **容器**：`--container-max 1000px`（报告 / 首页）、`--container-narrow 620px`（体检中 / 异常态）
- **断点**：`<480` 输入纵向堆叠 / `≥480` 横排 / `≥768` 双列与 3 列元数据 / `≥1024` 封顶
- **区块垂直节奏**：移动 32px，桌面 56px
- **触摸目标**：`--touch-min 44px`
- **栅格**：报告页为单列文档流（不用 12 列网格）—— 它是一份病历，不是仪表板

---

## 6. Depth & Elevation

| Token | 值 | 用途 |
|---|---|---|
| `--elev-flat` | `none` | 默认 |
| `--elev-paper` | `0 1px 0 rgba(22,24,21,.04), 0 2px 6px -3px rgba(22,24,21,.10)` | hover 抬升 |
| `--elev-lift` | `0 1px 0 rgba(22,24,21,.05), 0 8px 12px -8px rgba(22,24,21,.18)` | 浮层 |
| `--elev-poster` | `0 2px 0 rgba(22,24,21,.06), 0 24px 60px -28px rgba(22,24,21,.32)` | **仅 1080×1440 分享卡**（该元素无边框） |

**层级表达不靠阴影，靠纸的层数**：`--bg`（桌面）→ `--surface`（白纸）→ `--surface-2`（抬头条）→ `--surface-inset`（凹陷）。深色监护屏是独立的第五层，不参与这个阶梯。

带 1px 边框的元素禁止同时挂 blur ≥ 16px 的阴影（幽灵卡片）。
z-index：`base 0 / sticky 100 / toast 300 / modal 400`。

---

## 7. Do's & Don'ts

### 应该做

1. 数字一律等宽 + `tabular-nums`，像仪器读数
2. 用 1px 实线与 1px 虚线做分组，而不是用卡片堆卡片
3. 每屏只有一块深色区（监护屏），其余全亮
4. 每个指标都给出"怎么算的"（原始数据 / 口径 / 公式 / 门槛 / 权重），可展开
5. 错误态写清"出了什么事 / 为什么 / 现在能做什么"，技术信息原样贴出可复制
6. 波形按 12 个月 12 个心搏生成，0 提交的月必须是平线
7. 文案可以刻薄，但必须准确 —— 每个玩笑后面都跟一个真数字
8. 分享卡用真实数据，盖真章

### 不应该做

1. 把卡片圆角改成 8/12/16px —— 立刻变回 SaaS 面板
2. 给主按钮上绿色 —— 绿色是"活着"，不是"点击我"
3. 用折线图 / 柱状图表现提交趋势 —— 那是 BI，不是病历
4. 把六项体征拆成六张卡 —— 一张表格的六行才像检验报告
5. 用 emoji 当图标（火箭 / 图表 / 闪光那类表情符号），或混用第二套图标库
6. 硬编码颜色 —— 所有色值走 Token，唯一例外 `#fff` / `#000`
7. 渐变文字、彩色左边框卡片、毛玻璃、发光边框
8. 空洞文案（"Welcome to" / "开始你的旅程" / "Get started"）与虚构指标（"10,000+ 用户信赖"）

---

## 8. Responsive & Accessibility

### 响应式

| 断点 | 行为 |
|---|---|
| `<480px` | 输入框与主按钮纵向堆叠，按钮全宽 |
| `<768px` | 单列，元数据 2 列，区块间距 32px，卡片内边距 16px |
| `≥768px` | 元数据 3 列，区块间距 56px，H1 48→56px，健康分 64→88px，底部操作横排 |
| `≥1024px` | 容器封顶 1000px |

无横向滚动；长仓库名 `word-break` 换行不截断。

### 无障碍（实测）

- 全部文本对比度 ≥ 4.5:1（详见 `design-spec.md` §8.1 的 15 组实测值）。`--p-ink-300` 实测 2.17:1，**禁止用于任何文字**
- `:focus-visible` 2px `--accent` 焦点环 + 2px offset，全站统一
- 全键盘可达：病例行是 `<button>`，折叠用原生 `<details>`，无正数 `tabindex`
- `prefers-reduced-motion: reduce` 全局降级（`design-tokens.css` 底部），波形滚动停止
- 动效 ≤ 320ms（收敛值 150ms），除波形滚动 3.6s（唯一例外，可关）
- 颜色不是唯一信息源：等级同时有文字 + 数字 + 条形段数
- 波形 SVG 有完整 `aria-label`；步骤容器 `role="status" aria-live="polite"`
- 触摸目标 ≥ 44×44px

### 5 态覆盖

| 状态 | 落点 |
|---|---|
| **Loading** | `mockup-loading.html`：监护屏滚动波形 + 5 步真实 API 进度 + 取消 |
| **Empty** | 输入台未填时：三个预制病例即"空态引导"，不是空白页 |
| **Error** | `mockup-error.html`：404 / 403 限流 / 网络失败，三套文案与动作 |
| **Populated** | `mockup-report.html` |
| **Edge** | 超长仓库名换行不截断；0 提交月份画平线；贡献者 0 人时单人依赖度记为 100%；私有仓库返回 404 而非 403（GitHub 行为） |

---

## 9. Agent Implementation Guide

### 9.1 引入顺序

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Martian+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="./design/design-tokens.css">
```

`design-tokens.css` 已包含 `:root` 变量 + 基础层（`box-sizing`、`body` 纸纹、`.num`、`.label`、`.rule-dashed`、`:focus-visible`、`prefers-reduced-motion`）。**不要重复定义这些**。

### 9.2 Token 使用铁律

```js
// 正确：组件里只允许 var(--token)
color: var(--fg);
border: 1px solid var(--border);
font-family: var(--font-mono);

// 禁止
color: #161815;
background: #fafaf7;
```

机器可读 token 在 `design-tokens.json`（`import tokens from './design/design-tokens.json'`），结构与 CSS 变量一一对应：`primitive → color / font / fontSize / spacing / radius / shadow / motion / layout`。

### 9.3 三个视图的实现要点

| 视图 | 文件 | 要点 |
|---|---|---|
| 输入台 | `mockup-home.html` | 表单块用 `.sheet` 骨架；三个示例是 `<button>` 整行可点，右侧显示真实分数与等级 chip |
| 体检中 | `mockup-loading.html` | 波形用 `translateX(-50%)` 循环滚动（`--motion-sweep 3600ms linear infinite`）；5 步状态机 done/active/todo；不做假进度条 |
| 报告 | `mockup-report.html` | 长页 7 段固定顺序；波形按 `design-spec.md` §9.4 算法生成 SVG path；体征行用 `divide-y` 不拆卡 |
| 通知书 | `mockup-notice.html` | 页面即 Canvas 规格：**所有元素绝对定位，坐标与 `design-spec.md` §10.2 绘制表 1:1**，前端照抄坐标即可 |
| 异常态 | `mockup-error.html` | 一个组件三套参数；每套必须有可复制的等宽技术信息块 |

### 9.4 评分必须照抄（否则示例数据对不上）

**唯一依据是 `docs/SPEC.md` §6，公式一个字都不许改。** 完整分档函数见 `design-spec.md` §9.1，这里只列骨架：

```
心跳   = 距最后一次提交的天数分档           权重 .25   // 不是"月均提交数"
呼吸   = clamp(近12月提交/120×100 + 趋势修正) 权重 .20   // 趋势 = 近6月 vs 前6月
依赖   = clamp(100 − 最大单人占比×90 + 作者加成) 权重 .20   // 只看近12月作者
代谢   = 距最近一次发版的天数分档 + 发版数加成   权重 .10   // 不是 issue 新开关闭
免疫   = 100 − 僵尸issue占比 + 积压惩罚         权重 .15   // 90 天未更新算僵尸
遗嘱   = 许可证 40 + README 六项加分            权重 .10

总分 = round(Σ 分项 × 权重)   // express = 86.55 → 87 健康
```

分诊：`85-100 健康 / 70-84 门诊随访 / 50-69 住院观察 / 30-49 ICU / 0-29 临床死亡`

> 曾经这里写着一套自创权重（28/12/25/15/12/8），把健康的 express 算成 64 分住院，且那组数字自己都复现不出 64。**自创权重一律作废，只认 Spec。**

### 9.5 已知坑

1. **SVG 里 `stroke="var(--x)"` 作为 presentation attribute 在部分浏览器不可靠** → 用 `style="stroke: var(--x)"`。设计稿已全部改成 `style`。
2. **Canvas 的 `letterSpacing` 会在末尾多出一个间距** → 居中/右对齐时按 `measureText(s).width − letterSpacing` 计算有效宽度。
3. **`document.fonts.ready` 不 await 就画 Canvas** → 160px 的健康分会用 fallback 字体，整张卡度量全错。
4. **GitHub 未登录 API 限额 60 次/小时** → 一个仓库固定 5 次请求，够看 12 个仓库。必须在 403 时读取 `X-RateLimit-Reset` 并显示真实倒计时，不要写死。
5. **`/stats/*` 全系端点一律禁用**（`stats/contributors`、`stats/participation` 均由后台异步计算，未就绪返回 202 空 body，实测会长时间挂起）→ 全部改用 `/commits?since=12月前&per_page=100` 自行按月聚合。**这是硬约束，源码里出现 `/stats/` 即为缺陷。**
6. **私有仓库返回 404 而不是 403** → 错误文案按 404 写（"读不到，这是设计"），不要暗示"权限不足"。
7. **`mix-blend-mode: multiply` 的印章在深色底上会消失** → 印章只能放在纸色底上，不能放在监护屏或深色卡上。
