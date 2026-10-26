# Spec - Code ICU v1.0

> 生成日期：2026-10-26
> 基于：Phase 0 决策日志（技术栈/视觉/范围/数据源四项已拍板）
> 状态：待确认
> 参赛背景：WorkBuddy「1024 造物挑战」，截稿 2026-11-01 23:59

---

## 1. 产品定义

- **一句话描述**：把 GitHub 仓库当成一个病人做全身体检，六项体征打分，最后下一张《病危通知书》。
- **目标用户**：程序员、开源维护者、接手他人项目的开发者、技术选型者。
- **核心问题**：一个仓库还能不能碰？接手它会不会踩雷？它是不是已经死了但没人宣布？
- **核心价值主张**：**所有数字都来自真实公开数据，每一条都能点开看怎么算的。** 不做假数据演示。

### 参赛评分对位

| 评审维度 | 分值 | 本项目的拿分依据 |
|---|---|---|
| 创意与场景价值 | 35 | 无人给代码做体检；痛点真实（接盘屎山）；反差感强（给 Linux 下病危通知书） |
| 作品完成度 | 40 | 真实 GitHub API 数据 + 透明算法 + 断网快照兜底，任何情况下都能演示 |
| 使用体验 | 25 | 一个输入框；3 个一键示例；移动端优先；三态齐全 |
| 社媒分享 | +30 | 《病危通知书》1080×1440 竖版分享卡，Canvas 导出，自带话题文案 |

---

## 2. MVP 范围（锁定——不在此列表的功能一律不做）

| 优先级 | 功能 | 验收标准摘要 |
|---|---|---|
| P0 | 仓库输入与解析 | 支持 `owner/repo`、完整 URL、带 .git 后缀三种输入 |
| P0 | 一键体验示例 | 3 个内置示例按钮，点击即出结果，无需输入 |
| P0 | 六项体征计算 | 心跳/呼吸/依赖度/代谢/免疫/遗嘱，每项 0-100 分 + 人话诊断 |
| P0 | 健康分与病危等级 | 加权总分 0-100，映射五级病危等级 |
| P0 | 寿命推演 | 基于健康分与停更天数推演剩余天数，公式页面公开 |
| P0 | ECG 心跳波形 | 近 12 个月提交趋势绘制成心电图波形 |
| P0 | 病危通知书 | 独立视图 + Canvas 2D 导出 1080×1440 PNG |
| P0 | 分享链接 | 报告页支持 `#/r/owner/repo` 深链，可直接发给别人 |
| P0 | 三态处理 | 加载中（分步进度）/ 404 / 限流 / 网络失败，均不白屏 |
| P0 | 快照兜底 | 断网或限流时降级到预置快照并明确提示"演示数据" |
| P1 | 可选 GitHub Token | 填入 PAT 后限流从 60/h 提升到 5000/h，存 localStorage |
| P1 | 结果本地缓存 | 同一仓库 15 分钟内复用缓存，减少请求消耗 |

---

## 3. 明确不做（Out-of-Scope — 锁定）

| 不做的功能 | 原因 | 何时考虑 |
|---|---|---|
| 用户认证 / 登录 | 无后端、无账号体系，评委零门槛体验 | 永不 |
| 多仓库对比 | 工作量约 1.4 倍，且需处理双倍限流 | v2.0 |
| 组织批量体检 | 单人 10+ 次请求，60/h 限流下极易翻车 | v2.0 且有 Token 引导 |
| 数据库 / 服务端缓存 | 纯静态部署是本项目最大稳定性优势 | 永不 |
| 代码质量静态分析（复杂度、重复率） | 需拉取全部源码，请求量与体积不可控 | v2.0 |
| 依赖漏洞扫描（CVE） | 需要 OSV 等第三方接口，失败面扩大 | v2.0 |
| AI 生成治疗建议 | 引入 LLM 依赖，断网即失效；改为规则化建议 | 永不（v1 用规则） |
| 历史健康分趋势图 | 需自行存储历史，无后端做不了 | v2.0 |

---

## 4. 技术架构（锁定）

| 层 | 技术 | 版本锚定 | 锁定原因 |
|---|---|---|---|
| 运行时 | 浏览器原生 ES Module | Chrome/Safari/Firefox 近两年版本 | 零构建、零依赖，改完刷新即生效，部署不会因构建失败翻车 |
| 语言 | 原生 JavaScript（ES2022，无 TS 编译） | - | 无构建即无类型检查环节，用 JSDoc 注释补类型可读性 |
| 样式 | 原生 CSS + CSS 变量（Design Token） | - | Token 化强制走变量，禁止硬编码色值 |
| 图标 | 内联 SVG Sprite（单套图标库，由设计师锁定） | - | 规避 emoji，单文件 sprite 一次加载 |
| 图表 | Canvas 2D 手绘（无图表库） | - | ECG 波形是自定义形状，图表库反而受限；且导出复用同一套绘制逻辑 |
| 数据 | GitHub REST API v3 | - | 已实测 `access-control-allow-origin: *`，浏览器可直连 |
| 存储 | localStorage（缓存 + 可选 PAT） | - | 无后端前提下唯一持久化手段 |
| 部署 | 静态站点托管 | - | 无服务端，任何静态托管都能跑 |

### 关键约束

- **禁止引入任何 npm 运行时依赖**，全部原生实现。
- **禁止使用 emoji 作为功能图标**，统一走锁定图标库。
- 单文件 ≤ 300 行，超出必须拆分。
- API 层与计算层必须解耦：`github.js` 只负责取数，`metrics.js` 只负责算分，两者不互相 import 业务逻辑。

---

## 5. API 端点清单（锁定 — 全部为浏览器直连 GitHub 公开接口）

Base: `https://api.github.com`，请求头统一带 `Accept: application/vnd.github+json`。

| # | Method | Path | 用途 | 取用字段 |
|---|---|---|---|---|
| 1 | GET | `/repos/{owner}/{repo}` | 仓库档案 | `full_name, description, stargazers_count, forks_count, open_issues_count, pushed_at, created_at, archived, license.spdx_id, language, default_branch, html_url` |
| 2 | GET | `/repos/{owner}/{repo}/commits?since={ISO_12M_AGO}&per_page=100` | 近 12 月提交，用于呼吸/依赖度/波形 | `commit.committer.date, author.login` |
| 3 | GET | `/repos/{owner}/{repo}/releases?per_page=10` | 发版节奏 | `tag_name, published_at` |
| 4 | GET | `/repos/{owner}/{repo}/issues?state=open&per_page=100&sort=updated&direction=desc` | 免疫（陈旧 issue 占比） | `updated_at, pull_request`(需排除 PR) |
| 5 | GET | `/repos/{owner}/{repo}/readme` | 遗嘱（README 完整度） | 文本正文（`Accept: application/vnd.github.raw`） |

### 单次体检请求预算

**5 次请求**。未认证限流 60 次/小时/IP → 每小时约 12 次完整体检。

### 限流与错误处理（锁定策略）

| 情况 | 判定 | 行为 |
|---|---|---|
| 404 | `status === 404` | 显示"查无此院"错误态，提示检查 owner/repo 拼写 |
| 403 + `x-ratelimit-remaining: 0` | 限流 | 显示限流态 + 重置时间倒计时 + 引导填 Token + **自动降级到快照** |
| 403 / 401（Token 无效） | 权限 | 提示 Token 无效并可一键清除 |
| 5xx / TypeError（网络） | 网络失败 | 重试 2 次（间隔 800ms、2000ms），仍失败则降级快照 |
| 仓库为空（`size === 0`） | 空仓库 | 判定为"未出生"，走专项文案 |
| `archived === true` | 已归档 | 直接判定"临床死亡"，跳过其余体征计算 |

### 缓存策略

- Key：`icu:v1:repo:{owner}/{repo}`
- 结构：`{ fetchedAt, payload }`
- TTL：15 分钟
- 命中时不发任何请求，页面顶部标注"数据缓存于 X 分钟前 · 点击重新体检"

---

## 6. 六项体征算法（锁定 — 本项目核心，公式必须公开在页面上）

> **红线：任何一个分数都不得使用随机数。** 所有分数必须由输入数据确定性推导，同一仓库同一时刻重复计算结果完全一致。

### 通用约定

- `now` = 页面加载时刻
- `d(x)` = `(now - x) / 86400000` 向下取整，单位天
- `clamp(v, min, max)`
- 百分制，0 = 濒死，100 = 极健康

### 6.0 项目年龄归一化（锁定 — 2026-10-26 追加，修正系统性误判）

> **为什么有这一节**：六项里有三处的分母是「一年」的绝对值。对刚开源几个月的项目，
> 它们会一起把健康项目打成病危。实测：一个开源 2 个月、40 次提交（月均 20 次，是 express
> 的 2.5 倍活跃度）、单人维护的仓库，旧口径算出 **63 分 · 住院观察**；开源 2 周、8 次提交的
> 算出 **55 分**。这不是算法参数没调好，是口径错——它们拿「成熟项目的年化标准」去量新项目。

```
ageMonths = (now - repo.created_at) / (86400000 × 30.44)
```

拿不到 `created_at` 时 `ageMonths = null`，各体征退回**成熟项目的原口径**（即本节修改前的行为），
不会因为缺一个字段让分数失真。

| 体征 | 年龄如何介入 | 门槛 |
|---|---|---|
| 呼吸 breathing | **分母按窗口缩放**：`expected = 120 × min(12, ageMonths) / 12`，`base = total / expected × 100`。窗口不足 6 个月不做趋势修正（对半分的两段样本都是噪声）；不足 1 个月直接**弃权** | 1 / 6 个月 |
| 单人依赖度 busFactor | **集中度惩罚按年龄打折**：`tolerance = clamp(ageMonths / 12, 0.35, 1)`，`score = 100 − maxShare × 90 × tolerance + bonus` | 12 个月，下限 0.35 |
| 代谢 metabolism | 无 release 时，年轻项目给 **70**（还没到该发版的阶段）而非 45（发版停滞） | 6 个月 |
| 免疫 immunity | **弃权**：建仓不足 90 天不可能出现「90 天未动的僵尸 issue」，该项恒满分等于白送 100 分 | 3 个月 |
| 遗嘱 legacy | **保底 60**：README 还没写完是常态，不该判成「遗嘱残缺」。只保底不封顶，本来就写得全的仍是满分 | 3 个月 |
| 心跳 heartbeat | 不介入（只看 `pushed_at`，与年龄无关） | — |
| 寿命推演 | `ageDays < 30` 时**不显示推演数字**，改显示「建仓不足 30 天，样本太短，暂不推演」 | 30 天 |

**两条设计取舍（不要「优化」掉）**

1. **依赖度的下限 0.35 不能省。** 纯线性打折会让一个两周大、单人 100% 的仓库拿 96 分「健康」，
   而 Bus Factor = 1 本身就是事实风险，与项目年龄无关。保留下限意味着早期仍扣约 31 分，
   只是不至于像成熟项目那样一票打成 10 分。
2. **弃权 ≠ 0 分，也 ≠ 满分。** 免疫弃权后由 `computeHealth` 把剩余权重重新归一化。
   页面上必须把「样本不足」和「取数失败」显示成**两句不同的话**——前者是项目太年轻，
   后者是网络/接口问题，混为一谈会让用户以为 API 挂了。

**修正前后对照（回归锚点，见 §6.5）**

| 场景 | 旧口径 | 新口径 |
|---|---|---|
| 开源 2 个月 / 40 次 / 1 人 / 未发版 | 63 · 住院观察 | **86 · 健康** |
| 开源 3 个月 / 60 次 / 2 人 / 未发版 | 71 · 门诊随访 | **90 · 健康** |
| 开源 6 个月 / 120 次 / 3 人 / 已发版 | 91 | **96** |
| 开源 2 周 / 8 次 / 1 人 / README 极简 | 55 · 住院观察 | **88**（呼吸与免疫弃权，由 4 项得出） |
| 成熟项目（>12 个月） | — | **0 变化**，逐位一致 |


### 1) 心跳 heartbeat — 距最后一次提交多久（权重 0.25）

```
if archived: score = 0
else:
  d = d(repo.pushed_at)
  d <= 7    → 100
  d <= 30   → 100 - (d-7)/23 * 10
  d <= 90   → 90 - (d-30)/60 * 15
  d <= 180  → 75 - (d-90)/90 * 20
  d <= 365  → 55 - (d-180)/185 * 25
  d > 365   → max(0, 30 - (d-365)/365 * 30)
```

### 2) 呼吸 breathing — 近 12 个月提交密度与趋势（权重 0.20）

```
c = 近12月提交数（最多 100 条，若取满 100 标记 capped=true）
base = clamp(c / 120 * 100, 0, 100)        // 120 次/年视为满分

last6 = 最近 6 个月提交数
prev6 = 前 6 个月提交数
if prev6 === 0: trend = last6 > 0 ? +10 : -10
else ratio = last6 / prev6
  ratio >= 1.3 → +10
  0.8 <= ratio < 1.3 → 0
  0.5 <= ratio < 0.8 → -8
  ratio < 0.5 → -15

score = clamp(base + trend, 0, 100)
```

### 3) 单人依赖度 busFactor — Bus Factor（权重 0.20）

> 用**近 12 个月提交作者**而非 lifetime contributors。理由：lifetime 数据会让二十年老项目永远显得"依赖创始人"，而近一年作者分布才反映当下的真实风险。

```
authors = 近12月 commits 中 author.login 去重（排除 login 以 [bot] 结尾者）
total = 近12月非 bot 提交数
if total === 0: score = 20
else maxShare = 单作者最多提交数 / total
  score = clamp(100 - maxShare*90 + (authors>=8 ? 8 : authors>=4 ? 4 : 0), 0, 100)
```

### 4) 代谢 metabolism — 发版节奏（权重 0.10）

```
r = 最近一次 release
if 无任何 release: score = 45          // 不发版不等于有病，给中间分
else:
  d = d(r.published_at)
  d<=30 → 100; d<=90 → 85; d<=180 → 70; d<=365 → 50; d<=730 → 30; else → 15
  score = clamp(base + min(10, 近12月发版数 * 2), 0, 100)
```

### 5) 免疫 immunity — issue 积压与僵尸 issue（权重 0.15）

```
open = state=open 的 issue（排除含 pull_request 字段的项），采样最多 100
if open === 0: score = 100
else:
  stale = updated_at 距 now > 90 天的数量
  base = 100 - (stale / open) * 100
  backlogPenalty = open>500 ? -15 : open>200 ? -8 : open>50 ? -3 : 0
  score = clamp(base + backlogPenalty, 0, 100)
```

### 6) 遗嘱 legacy — 许可证与文档完备度（权重 0.10）

```
license ? 40 : 0
readme 存在 ? 15 : 0
readme 字数 > 1500 ? +10
readme 含「安装 / Install / Getting Started」段 ? +10
readme 含「使用 / Usage / Quick Start」段 ? +10
readme 含「License / 许可」段 ? +10
含状态徽章（shields.io / badge） ? +5
archived ? -100
score = clamp(sum, 0, 100)
```

### 健康分与病危等级（锁定）

```
weights = { heartbeat: .25, breathing: .20, busFactor: .20, metabolism: .10, immunity: .15, legacy: .10 }
health = round(Σ score_i * w_i)
```

| 健康分 | 等级 | 文案基调 |
|---|---|---|
| 85–100 | 健康 | 各项指标平稳，可放心使用 |
| 70–84 | 门诊随访 | 存在需要关注的老化信号 |
| 50–69 | 住院观察 | 多项指标恶化，接手需评估成本 |
| 30–49 | ICU | 危重，除维护外不建议新接入 |
| 0–29 | 临床死亡 | 已无生命体征，仅作史料 |

### 寿命推演（锁定 — 必须标注是推演，不是预言）

```
decay = 1 / (1 + d(repo.pushed_at) / 180)
remainingDays = clamp( round(health / 100 * 365 * decay), 3, 3650 )
```

页面必须同时在寿命数字下方展示一行小字：
`推演公式：健康分/100 × 365 × 1/(1+停更天数/180)，基于 {N} 项公开指标的确定性计算，不是预言。`

---

### 6.5 实测基线（回归测试锚点 — 2026-10-26 22:xx 实测，QA 以此为准）

> 以下数值由项目总监用真实 GitHub API 按上文公式实算得出。前端实现后**必须**能复现这些数字（允许 ±2 分浮动，源于实时数据变化）。凡与下表偏差超过 5 分，即为实现缺陷。

| 仓库 | 健康分 | 等级 | 心跳 | 呼吸 | 依赖度 | 代谢 | 免疫 | 遗嘱 | 停更 |
|---|---|---|---|---|---|---|---|---|---|
| `expressjs/express` | **87** | 健康 | 100.0 | 80.0 | 97.3 | 100.0 | 40.6 | 100.0 | 2 天 |
| `moment/moment` | **69** | 住院观察 | 95.7 | 66.7 | 53.7 | 89.0 | 23.2 | 90.0 | 17 天 |
| `request/request` | **16** | 临床死亡 | 0.0 | 0.0 | 20.0 | 45.0 | 0.0 | 70.0 | 803 天 |
| `angular/angular.js` | **9** | 临床死亡 | 0.0 | 0.0 | 20.0 | 45.0 | 0.0 | 0.0 | 926 天（archived） |

> **舍入口径裁定（2026-10-26）**：`angular/angular.js` 加权原始值为 8.5，取整得 9。基线表原先的 8 来自 Python `round()` 的银行家舍入，属于参考脚本的实现副作用，**不是产品要求**。产品统一使用 `Math.round`（四舍五入），符合用户直觉。基线已更正为 9，实现无需修改。

**关键事实校正**：`expressjs/express` 近 12 个月有 **96 次提交、43 个不同作者、busFactor 97.3**，最新 release v5.3.0（16 天前）。它是**健康项目**，不是病危项目。任何"express 版本还在发但代码不动"的说法均与事实不符，禁止出现在文案中。

### 6.6 三个内置示例仓库（锁定）

| 示例按钮文案 | 仓库 | 预期分 | 叙事作用 |
|---|---|---|---|
| 「一个健康的对照样本」 | `expressjs/express` | 87 健康 | 展示产品不是无脑唱衰，绿色能亮 |
| 「中年危机」 | `moment/moment` | 69 住院观察 | 最有共鸣：仍在维护但明显老化 |
| 「已经凉了很久」 | `request/request` | 16 临床死亡 | **主推案例**。npm 最著名的废弃包，803 天无提交，每个 Node 开发者都认识它 |

**主推 `request/request`**：它是 Node 生态里最有名的"已死但还装在无数项目里"的包，故事最狠且完全真实，比编案例可信一百倍。首页示例按钮与病危通知书分享卡默认都用它。

> **许可证勘误（2026-10-26）**：`request/request` 的许可证是 **Apache-2.0**，不是 MIT。此前口头指令误写为 MIT，已由设计组指出并按夹具缓存核实（`tests/.cache/request_request.json` → `spdx_id: "Apache-2.0"`）。三个示例仓库许可证：express = MIT、moment = MIT、request = **Apache-2.0**。任何文案、快照、截图不得写成 MIT。

## 7. 页面清单与路由（锁定）

单页应用，Hash 路由（保证静态托管下深链可用、可分享）。

| 视图 | 路由 | 核心组件 | 数据来源 |
|---|---|---|---|
| home 输入台 | `#/` | RepoInput、DemoButtons、VitalsExplainer、PrivacyNote | 无 |
| loading 体检中 | `#/r/{owner}/{repo}`（加载中态） | EcgLoader、StepProgress | - |
| report 体检报告 | `#/r/{owner}/{repo}` | RepoHeader、ScoreRing、LevelBadge、EcgChart、VitalCard×6、HistoryTimeline、TreatmentList、ExportBar | 5 个 API + metrics |
| notice 病危通知书 | `#/notice/{owner}/{repo}` | NoticeCard、StampSeal、CanvasExport | 复用 report 结果（经 session 内存交接，**零 API 请求**） |
| error 异常态 | `#/r/{owner}/{repo}`（失败态） | ErrorPanel（404 / rate-limit / network 三种变体 + 快照降级入口） | - |

### 页面组件清单

- `ecg.js` — 提交趋势 → ECG 波形，Canvas 绘制，同一函数复用于报告页与导出卡
- `score-ring.js` — **实为分诊标尺**（等宽大数字 + 五段刻度 + 预后推演），导出 `renderScore`。文件名沿用以对齐交付清单，但**不做环形图**：高保真稿无环，且 375px 下环形会把全页唯一读数压成小圈里的小字
- `vital-card.js` — 单个体征卡片：数值 / 评级条 / 人话诊断 / 可展开算法
- `share/stamp.js` — 红色圆章（Canvas 弧形排字 + 五角星）
- `share/type.js` — Canvas 字体装载（逐个面 `document.fonts.load()` 主动拉取后才允许 `fillText`）
- `share/notice-card.js` — 1080×1440 Canvas 2D 手绘导出
- `views/notice.js` — 通知书 DOM 预览（与 Canvas 版同源，共用 `copy.js` 的 `noticeCopy()`）
- `session.js` — 报告 → 通知书的**内存结果交接**。不用 localStorage、不发第 6 个请求：深链直开 `#/notice/*` 时退预置快照，同样零请求

> **CSS 作用域纪律（本项目新增，违反即打回）**：新增视图的 CSS 选择器必须带视图级前缀（通知书用 `.poster`），禁止使用 `.lede` / `.advice` / `.chip` / `.score` 这类裸类名。`app-notice.css` 初版因裸类名与首页、报告页撞名，直接踩红三条溢出断言（首页 375 溢出 223px、报告 375 溢出 525px）。

### 7.1 本地预览（锁定）

**禁止用 `python3 -m http.server` 预览本项目**。该内置服务器 `request_queue_size` 默认 5，而首页并行拉取 17 个 ES Module 会溢出连接队列，内核直接 RST，表现为随机白屏（实测 5 次里 1 次）。

统一使用零依赖脚本：`node tests/serve.mjs 8081`。部署到正规静态托管/CDN 不受此影响。

---

## 8. 设计 Token（锁定）

> 由设计师（颜好看）产出 `design/design-tokens.json` + `design/design-tokens.css`，前端必须 import 引用，**禁止硬编码色值**。待设计稿回传后本节补齐最终值。

- **视觉基调**：急诊病历风
- **基底**：病历纸暖白
- **主色**：监护仪荧光绿
- **警报色**：病危红
- **图标库**：单套 SVG（由设计师锁定，24px 网格 / 1.5px 描边，全项目不得混用）
- **字体**：正文思源黑系统栈；**所有数字、仓库名、代码必须等宽字体**
- **响应式**：移动优先，375px 起；断点 768 / 1024

### 8.1 色彩语义规则（锁定 — 两套色阶并存，不得混用）

| 用在哪 | 色阶 | 规则 |
|---|---|---|
| **总健康分 / 病危等级徽章** | 五档 `--level-healthy/clinic/ward/icu/dead` | 85–100 绿 / 70–84 青 / 50–69 琥珀 / 30–49 橙 / 0–29 红 |
| **单项体征评级条与分值文字** | 三档（**下表写死，不得推导**） | 见下 |

**单项体征三档映射（锁定 — 禁止复用 `classify()`）**

| 分数区间 | 使用的 Token | 实际色 | 禁止使用 |
|---|---|---|---|
| ≥ 80 | `--level-healthy` | 深绿 | — |
| 30 – 79 | `--level-icu` | 焦橙 `#C2410C` | ❌ `--level-ward`（琥珀，偏黄） |
| < 30 | `--level-dead` | 警红 | — |
| 数据缺失 | `--meta` | 中性灰 | 不得显示 0 分 |

**三条硬约束**
1. **禁止用 `classify()` 给单项体征上色**。`classify()` 是总分五档分诊器，单项用它会落到 `--level-clinic`（钢蓝），读起来像"住院"。
2. **单项体征上永不出现 `--level-clinic` 与 `--level-ward`**。
3. `--level-icu` 名字带 ICU 属历史包袱，三档要的是它那个焦橙，不取其语义。

**状态词边界必须与色阶同界**：六项体征的状态词第一档统一 `≥80`、第三档统一 `30`，不得各自设界（如免疫用 70、遗嘱用 90）。否则 80 分会出现"颜色是橙、状态词写变浅、诊断写平稳"三方打架。

**状态词不许带方向含义**（2026-10-26 追加）。状态词描述**绝对量**，趋势交给诊断语，两者各管一件事。
- ❌ `breathing` 用「变浅 / 衰竭」：moment 的真实数据是 66.7 分但趋势 +10，诊断写「呼吸在加深」，方向词会和趋势正面打架。已改为「偏少 / 明显偏少」。
- ✅ 允许的边界内细分：同一色档内可以有两个措辞，只要不跨色阶就不算混用。`legacy` 在 ≥80 这一档内分「完整」`≥95` /「基本完整」`≥80`——moment 90 分缺 Usage 章节，叫「完整」就与诊断语自相矛盾。

**"没法量"不能说成"量到 0"**。metabolism 无 release 时的 45 分是折算值，诊断必须写「这一项按无记录折算」，不能写「代谢处于静止状态」——后者把一个未测项误述成了实测零值。

**理由**：单项体征用五档会让"免疫 40.6"显示成红色，读起来像濒死，但它其实只是"偏低"。三档更准确，也不会让读者以为每项都在报警。总健康分才需要五档分诊刻度。

### 8.2 字体加载策略（锁定 — 不引外部 CDN）

**禁止引用 Google Fonts 或任何外部字体 CDN。** 全部走系统字体栈。

| 用途 | 字体栈（`tokens.css` 定义） |
|---|---|
| 标题/正文（拉丁） | `Archivo → PingFang SC → Noto Sans SC → Microsoft YaHei → system-ui` |
| 数字/仓库名/代码 | `Martian Mono → SF Mono → JetBrains Mono → ui-monospace → Menlo → Consolas → monospace` |
| 通知书标题 | 宋体栈 `Songti SC → Source Han Serif SC → Noto Serif SC` |

**为什么摘掉 CDN（2026-10-26 实测决策）**
1. `fonts.googleapis.com` 在国内基本不通。评委打开页面时字体请求会挂起到超时，`display=swap` 让数字先渲染成 fallback、随后跳变。
2. 破坏「零外部依赖」承诺——现在全站唯一的外部依赖只剩 GitHub API 一个。
3. 实测摘掉后 `ui-check.mjs` **109/109 仍全过**（含两条导出断言），导出 PNG 仍恰好 1080×1440，导出体积 269KB → 258KB。视觉逐张比对：`16` 仍方正等宽、`/100` 基线对齐、表格无溢出、印章完好。

**Canvas 字体的硬要求**（`share/type.js` 已实现，改动前先读注释）
- `ctx.font` 简写不认 `var()`，字体栈必须写字面量，且与 `tokens.css` 的 `--font-*` 逐项对应。
- **必须逐个字重/字号 `document.fonts.load()` 之后再 `fillText`**，最后再 `await document.fonts.ready` 兜底。只 `await ready` 不够：报告页没有 700 字重的等宽字体在页面上，那份字重无人触发，`ready` 会立刻 resolve，然后 160px 的健康分用 fallback 画出来——**预览看不出问题，只有导出的 PNG 里坐标全错**。
- 每次 `fonts.load()` 都要 `.catch()` 兜底，字体缺失不得阻断导出。

### 8.3 运行时数据清洗（锁定）
| 字段 | 规则 |
|---|---|
| `repo.description` | **渲染前必须剥离 emoji**。理由：`request/request` 的官方 description 是 `🏊🏾 Simplified HTTP request client.`，直接渲染会破坏病历质感，且可能触发作品墙的 emoji 规范问题 |
| 病案号 | 由 `repo.created_at` 派生 `EX-YYYYMMDD`，**不得硬编码**。`request/request` → `EX-20110123`（已核实 created_at = 2011-01-23） |
| 所有诊断文案 | 必须基于夹具/实时数据的真实字段，禁止写 API 无法核验的第三方数字（如 npm 下载量） |

### 8.4 外链规范（锁定 — 所有指向站外的链接）

患者档案卡的头像、用户名、项目名都跳 GitHub。这三个 URL 全部来自 API 响应，
**属于外部数据**，因此有两条硬规则：

| 规则 | 内容 | 原因 |
|---|---|---|
| **URL 必须过 `safeUrl()`** | 只放行 `https:` 且 `hostname === 'github.com'`（头像另放行 `avatars.githubusercontent.com`）；校验用 `new URL()` 解析，**不用字符串前缀匹配** | `https://github.com.evil.com/x` 能骗过 `startsWith('https://github.com')`，骗不过 hostname 比对。`javascript:` 伪协议一旦拼进 href，页面脚本就可能被它执行 |
| **外链一律 `target="_blank" rel="noopener noreferrer"`** | `noreferrer` 断开发送 Referer，`noopener` 断开 `window.opener` | 否则目标页能反向操纵本页，也拿得到用户的来源信息 |

**头像的降级链**：`owner.avatar_url` → `<img>`（`onerror` 时 `this.remove()`）→ 底下的
首字母色块（`.avatar span`）永远留在 DOM 里。断网、头像被删、头像地址被拦时，
用户看到的仍是首字母色块，而不是一个破图图标。

**Canvas 导出卡不画远程头像**（SPEC §11 已知坑）：通知书是纯文字海报，本来就没有
头像位；即便要加，跨域图片会让 canvas 变成 tainted，`toBlob` 直接抛 SecurityError。
DOM 预览可以用 `<img>`，Canvas 版不能用 —— 两者不是同一套渲染路径。

**缓存前缀随字段变更升版**：`icu:v1:repo:` → `icu:v2:repo:`。v1 的缓存里没有
`owner.html_url` / `owner.avatar_url`，不换前缀的话老缓存会命中 15 分钟，
期间页面上三个链接全是死的。

---

## 9. 验收标准（EARS 格式 — 锁定，测试以此为唯一依据）

| 编号 | 功能 | EARS 验收标准 | 优先级 |
|---|---|---|---|
| AC-01 | 输入解析 | When 用户输入 `expressjs/express`、`https://github.com/expressjs/express` 或 `expressjs/express.git`，系统**必须**统一解析为 `{owner:"expressjs", repo:"express"}` | P0 |
| AC-02 | 输入校验 | If 输入不符合 owner/repo 格式，系统**必须**在输入框下方即时给出错误提示，且不发请求 | P0 |
| AC-03 | 一键示例 | When 用户点击任一示例按钮，系统**必须**在 3 秒内进入报告视图 | P0 |
| AC-04 | 指标正确性 | While 分析 `expressjs/express`，系统**必须**输出 health ∈ [60,95]，且 heartbeat ≥ 95（最后提交 3 天内） | P0 |
| AC-05 | 确定性 | Where 对同一仓库连续计算两次，六项体征得分**必须**完全一致 | P0 |
| AC-06 | 归档仓库 | If 仓库 `archived === true`，系统**必须**直接判定等级为「临床死亡」，且健康分 ≤ 20 | P0 |
| AC-07 | 限流降级 | If GitHub 返回 403 且剩余额度为 0，系统**必须**显示限流倒计时，并自动加载快照数据且标注「演示数据」 | P0 |
| AC-08 | 网络降级 | If 网络请求失败且重试 2 次仍失败，系统**必须**渲染快照数据，不得出现白屏或未捕获异常 | P0 |
| AC-09 | 404 | If 仓库不存在，系统**必须**显示「查无此院」错误态并保留输入框可再次输入 | P0 |
| AC-10 | 分享导出 | When 用户在通知书页点击导出，系统**必须**生成 1080×1440 PNG 并触发下载，且图像不含跨域污染报错 | P0 |
| AC-11 | 深链 | When 打开 `#/r/owner/repo` 链接，系统**必须**直接渲染该仓库报告，无需二次输入 | P0 |
| AC-12 | 移动端 | Where 视口宽度 375px，页面**必须**无横向滚动条，所有可点元素触达区 ≥ 44×44px | P0 |
| AC-13 | 无障碍 | Where 使用屏幕阅读器，健康分与病危等级**必须**有可读的 aria-label 文本描述 | P1 |
| AC-14 | 图标规范 | Where 扫描全部源码，**必须**无 emoji 字符作为功能图标 | P0 |
| AC-15 | 缓存 | When 15 分钟内重复打开同一仓库报告，系统**必须**命中缓存不发请求，并提示数据时间 | P1 |
| AC-16 | GitHub 外链 | Where 报告页患者档案卡的头像、用户名、项目名，系统**必须**各自是链接：头像与用户名指向 owner 的 GitHub 主页、项目名指向仓库页；全部 `target="_blank" rel="noopener noreferrer"`，且 URL **必须**经 `safeUrl()` 校验 | P1 |

---

## 10. 边界与约束

- 不支持 IE 及 2023 年前旧版浏览器（依赖 ES Module 与 `?.` 链式语法）
- 响应式断点：320 / 375 / 768 / 1024 / 1280
- 首屏可交互时间目标：< 1.5s（静态站点，无依赖）
- 完整报告渲染目标：< 3s（正常网络下 5 个 API 并行）
- 单次体检请求数上限：5（硬约束，超过即视为缺陷）
- 视觉规范：无 emoji 图标、无紫粉渐变、无硬编码色值
- 文案规范：所有文案为真实中文产品文案，禁止 Lorem ipsum / Welcome to

---

## 11. 内嵌已知坑（本项目已实测，来自 Phase 0 技术验证）

| 坑 | 技术栈指纹 | 根因 | 修法 |
|---|---|---|---|
| `/stats/contributors` 挂起超时 | GitHub REST | 该接口由后台异步计算，未就绪时返回 202，实测会长时间不响应 | **绝不使用**，改用 `/contributors` 或直接从 commits 内聚合 |
| 取满 100 条 commits 误判为"只有 100 条" | GitHub REST | `per_page=100` 是上限，活跃仓库 12 个月远超 100 | 判定 `length === 100` 时标记 `capped=true`，文案改为「≥100 次」 |
| issues 接口混入 PR | GitHub REST | `/issues` 返回结果包含 pull_request 项 | 过滤掉含 `pull_request` 字段的条目再统计 |
| Canvas 导出被头像跨域污染 | Canvas 2D | `drawImage` 跨域图片会让 canvas 变成 tainted，`toDataURL` 抛异常 | 导出卡**不绘制远程头像**，用仓库名首字母色块代替；或 `img.crossOrigin="anonymous"` 后重试 |
| 未认证 60/h 限流在演示时被打满 | GitHub REST | 评委连续点开多个仓库会快速耗尽 | 15 分钟缓存 + 3 个示例走预置快照（示例不消耗额度） |
| **`/stats/*` 全系端点一律禁用** | GitHub REST | `stats/contributors`、`stats/participation` 均由后台异步计算，未就绪返回 202 空 body；实测会长时间挂起 | 全员使用 `commits?since=12月前` 自行聚合，禁止调用任何 `/stats/` 路径 |
| `/issues` 响应体极大（实测约 400KB） | GitHub REST | 100 条 open issue 含完整 body 与 user 对象，实测出现过 `IncompleteRead` 截断 | 请求加超时与重试；解析失败时降级为「免疫数据缺失」并把该项权重按剩余项重新归一化，**不得**直接当成 100 分 |
| 权重与基线数字不可复现 | 内部 | 设计稿曾用一套非 Spec 的自定义权重，算出与实算相差 23 分的错误数字 | 权重以 Spec §6 为唯一依据；所有展示数字必须能用 §6.5 基线表复现 |
| **印章圆心坐标写错 90px** | Canvas 2D | `design-spec.md §10.3` 原写章心 `(786, 1132)`，但实测 `stampbox` 归一化位置是 `x=593, y=1029, 206×206`，**`right=799`**。786 是外框右边界，不是章心。照此绘制章会右移 90px，直接压住落款（`sign1` 左边界 804） | 章心取实测 **(696, 1132)**，半径 90。`share/stamp.js` 已按量取值写死并注明来源 |
| **印章 `centerDeg` 角度约定反了** | Canvas 2D | §10.3 示例传 `-90` 会把字排到章左缘并把每个字旋转 -90°，下弧再翻 180° 整个倒过来 | 正确约定：`project(deg, r) = [CX + sin(deg)·r, CY − cos(deg)·r]`；上弧 `deg = offset`、下弧 `deg = 180 − offset`；写字时上弧转 `deg`、下弧转 `deg − 180`（字头朝圆心）。与 HTML 版 `<textPath>` 逐字对得上 |
| **新视图 CSS 裸类名污染全局** | CSS | `app-notice.css` 初版用 `.lede` / `.advice` / `.chip` / `.score` 等裸类名，与首页、报告页撞名，踩红三条溢出断言（首页 375 溢出 223px、报告 375 溢出 525px） | 新增视图的选择器一律带视图级前缀（通知书用 `.poster`）。已写入 §7 组件清单 |

---

## 12. 端到端验证步骤（锁定）

```bash
# 0. 启动（零构建，但必须用项目自带静态服务）
node tests/serve.mjs 8081
# 期望：listening on http://127.0.0.1:8081
# ⚠️ 禁止 python3 -m http.server：backlog=5 会被 17 个并行 ES Module 打爆，随机白屏（见 §7.1）

# 1. 打开首页
open http://127.0.0.1:8081/#/
# 断言：首屏可见输入框 + 3 个示例按钮，无 console error

# 2. 深链直达报告（会真实发起 5 次 API 请求）
open http://127.0.0.1:8081/#/r/expressjs/express
# 断言：health ∈ [60,95]；heartbeat ≥ 95；ECG 波形有 12 个月数据点；
#      六项体征均渲染且可展开查看算法；寿命数字下方有推演公式说明

# 3. 错误流
open http://127.0.0.1:8081/#/r/this-owner-does-not-exist-xyz/nope
# 断言：显示「查无此院」错误态，输入框可再次输入，无白屏

# 4. 降级流（Chrome DevTools → Network → Offline，再刷新）
# 断言：渲染快照数据 + 顶部标注「演示数据」，console 无未捕获异常

# 5. 导出
# 报告页点击「导出病危通知书」→ 进入 #/notice/{owner}/{repo} 预览 → 点「下载 PNG」
# 断言：PNG 尺寸恰为 1080×1440，无跨域污染报错，文字清晰可读
#      预览页显示 16 分 / 临床死亡 · DEAD / 病案号 EX-20110123（request 为例）
#      进入预览与导出全程 0 次 API 请求（结果经 session.js 内存交接）
#
# 5b. 导出后重开（必须人工做，不能只看 Canvas 预览）
#       用图片查看器打开下载下来的 PNG，逐项核对：
#       - 160px 级大数字的字形与页面内截图是否同形（不同形 = document.fonts.ready 漏了 await）
#       - 结论两行没有换行错位、落款与页脚未被印章压制
#       - 六项体征的数值与报告页完全一致
#       理由：字体加载时机问题在 Canvas 预览里看不出来，只在导出文件里现形。

# 6. 图标规范扫描（必须 0 命中）
rg -n '[\x{1F300}-\x{1F9FF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}]' code-icu/src
```

### 12.1 自动化回归（当前 423 项断言，全绿为发布前置条件）

```bash
node tests/serve.mjs 8081 &          # 视图层三套脚本都需要它

node tests/verify.mjs                # 数据层 79 项：算法 / 降级 / 请求预算 / 四个真实仓库基线 / 外链 URL 校验
node tests/ui-check.mjs              # 视图层 226 项：五视图真跑 + 截图 + 导出 PNG + 回首页入口 + 顶栏排版 + GitHub 外链
node tests/young-cases.mjs           # 年龄归一化 80 项：五个锚点 + 三态语义 + 真页面
node tests/stamp-check.mjs           # 印章 20 项：与落款的间距 + DOM 与导出图必须是同一枚章
GITHUB_TOKEN=$(gh auth token) node tests/token-check.mjs   # Token 链路 18 项：单元层 + 真实网络层
```

**必须带 Token 跑的两套**（`verify.mjs` / `token-check.mjs`）：匿名额度是 60 次/小时且按 IP 计，
跑一次 `verify.mjs` 要 20 次请求，连着跑几轮必然把额度耗光，届时失败的是限流不是代码。
带 Token 是 5000 次/小时，且与匿名额度**不共享**同一个池子。

**`stamp-check.mjs` 的存在理由**：印章曾经把圆心当成外框右边界（786），整章右移 90px 压住落款。
Canvas 导出与 DOM 预览一度一个对一个错，出现「导出的图正常、页面上的印章压字」的分裂现象。
坐标改错在缩略图上肉眼极难发现，所以改成硬断言：DOM 侧用 SVG 几何算墨迹最右点，
Canvas 侧直接扫导出 PNG 的落款带子里有没有印章红像素。

**「同一枚章」的判定**：两版印章必须按**半径**一致。SVG 的 `<textPath>` 把**基线**放在弧线上，
字会整体往外探半个字号（墨迹戳到 r=81，外环内沿在 82，字骑在环线上）；
Canvas 的 `textBaseline='middle'` 把**字心**放在弧上（墨迹只到 r=76）。
修法是给 DOM 的 `<text>` 加 `dy="9.5"` / `dy="5.7"`（= 0.38em = (ascent−descent)/2），
把基线挪回字心位置。⚠️ `dy` 必须挂在 `<text>` 上——挂在 `<textPath>` 上 Chrome 不认。

---

## 13. 变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|---|---|---|---|
| 2026-10-26 | 初版锁定 | Phase 0 四项决策确认 | 全量 |
| 2026-10-26 | §6.5 基线 angular 8→9；§8.1/8.2 新增色彩语义与数据清洗；§12 增加导出后重开检查 | 实算校正舍入口径；单项体征与总分需两套色阶；字体加载问题只在导出文件现形 | 设计、前端、QA |
| 2026-10-26 | §7 路由改 `#/notice/{owner}/{repo}`、组件清单改为实际文件名；§8.1 补「状态词不带方向含义」「同色档内可细分措辞」；§11 补印章圆心/角度/CSS 作用域三条坑；§12 启动命令由 `python3 -m http.server` 改为 `node tests/serve.mjs` | 通知书走内存交接不发请求；moment 66.7 分出现「偏少 vs 呼吸在加深」方向冲突；实测 `stampbox` 章心是 696 不是 786；§12 与 §7.1 的预览禁令自相矛盾 | 设计、前端、QA、运维 |
| 2026-10-26 | §6.0 新增「项目年龄归一化」整节（`ageMonths` 口径，仅对 <12 个月项目介入，成熟项目分数一分不动）；§12.1 新增自动化回归清单（280 项断言）；首页 Token 入口改为跳转 GitHub 设置页并补 ≥44px 触控目标 | 用户反馈年轻项目被系统性低估——呼吸与依赖度的分母是「一年」绝对值；Token 入口此前没有测试、也没有可点的获取路径 | 数据层、视图层、QA |
| 2026-10-26 | 新增 `tests/stamp-check.mjs`（16 项）、`tests/token-check.mjs`（18 项）、`tests/young-cases.mjs`（80 项）；`ui-check.mjs` 的可见性判定改用 `checkVisibility()` | 印章压字与「导出的图正常」曾分裂，靠肉眼查不出；Token 功能此前一次都没测过；收起的 `<details>` 内容是 `content-visibility: hidden`，有盒子但点不到，旧判定会算出假缺陷 | QA |
| 2026-10-26 | 印章弧形文字加 `dy="9.5"` / `dy="5.7"`（DOM 预览 + 设计稿 mockup 同步）；`stamp-check.mjs` 扩到 20 项并加「DOM 与导出图必须是同一枚章」的半径比对 | 用户二次反馈印章问题仍在——真因不是坐标而是**基线语义**：SVG `<textPath>` 把基线放在弧上，字整体外探半个字号戳到外环；Canvas 用 `textBaseline='middle'` 字心落弧。两边画的不是同一个章 | 设计、前端、QA |
| 2026-10-26 | 顶栏品牌由 `div` 改为 `<a href="#/">`（全局可回首页）；报告页与通知书页顶栏加「回首页」按钮；新增 `house` 图标；移动端给 `.brand-home` 补 ≥44px 触控目标 | 二级页（报告页 / 通知书页）没有任何回到首页的入口，用户走不出来 | 设计、前端、QA |
| 2026-10-26 | 顶栏右侧槽位拆成两种：`.chart-no`（竖排两行标签，首页表单号用）与 `.top-actions`（横排一行，报告页 / 通知书页的按钮组用）；`topbar()` 增加 `slot` 与 `meta` 两个参数；副标题拆成 `.brand-sub-identity`（`flex: none`，页面身份永完整）与 `.brand-sub-meta`（`flex: 0 1 auto`，空间不足时先省略）；`ui-check.mjs` 新增 24 项顶栏排版断言 | 用户反馈「回首页左右排版会比较好」——上一轮把按钮塞进了 `.chart-no`，而它是 `flex-direction: column`（首页两行标签用的竖排布局），按钮于是自动叠成上下两列；副标题跟着被挤成「病危通知书 / NO. EX-…」 | 设计、前端、QA |
| 2026-10-26 | 患者档案卡的头像、用户名、项目名各自成为 GitHub 链接（§8.4 新增外链规范）；`trimRepo` 补 `owner.html_url` / `owner.avatar_url`；新增 `dom.safeUrl()`（只放行 github.com 的 https，URL 解析而非前缀匹配）；启用真实头像并保留首字母色块降级；缓存前缀 `v1`→`v2`；快照与夹具重建；新增 AC-16；`verify.mjs` 新增 16 项 URL 校验断言、`ui-check.mjs` 新增 34 项外链断言 | 用户反馈「项目名称和用户头像以及用户名称点击需要跳转到对应的 url」——这三个元素此前全是纯文本，看完体检报告无处可去原仓库。URL 来自 API，不能不校验就塞进 href | 数据层、视图层、QA |

---

## 14. 参赛与传播口径（锁定）

> 以下不是产品功能，是投稿与传播阶段必须遵守的口径，避免不同人写出互相打架的说法。

### 14.1 社媒人气分目标线：**61，不是 101**

| 点赞 + 收藏总数 | 加分 |
|---|---|
| 10–30 | +5 |
| 31–60 | +10 |
| **61–100** | **+15** ← 实际目标 |
| 101 及以上 | +20 |

**判断依据**：从 61 到 101 需要多攒 40 个赞，只多换 5 分。边际收益极低，这 5 分从作品完成度与体验里挣更划算。**对外沟通必须同时给出这张边际收益表**，只写"目标 61"会让执行者在 45 分时无谓焦虑。

**禁止动作**：不买赞、不建互赞群、不承诺回赞。细则中"互动数据真实有效"一旦被判异常，损失远大于 +15。

### 14.2 三条对外话术红线

1. **不得暗示预测未来**。任何场合都要说明"基于公开指标的确定性计算，不是预言"，产品内固定展示公式。
2. **不得评价第三方项目好坏**。`request/request` 只陈述可核验事实（README 首行 `Deprecated!`、末次提交在 803 天前、145 个 open issue），不猜测废弃原因、不评价维护者。
3. **不得引用无法核验的数字**。我们只用 GitHub API，因此禁止出现 npm 下载量、用户数等页面内无法自证的数据。

### 14.3 事实基线（对外引用前必须核对）

| 项目 | 事实 | 来源 |
|---|---|---|
| `request/request` | README 首行 `# Deprecated!`，2020-02-11 起废弃 | 夹具 README |
| `request/request` | `archived: false` → 只能说"作者已宣布废弃"，**不能说"已停止维护"** | 夹具 repo |
| `request/request` | 许可证 **Apache-2.0**（不是 MIT） | 夹具 repo |
| `request/request` | `created_at` 2011-01-23 → 病案号 `EX-20110123` | 夹具 repo |
| `request/request` | open issues 145，末次提交 2024-08-14 | 夹具 repo |
| 其他三个示例 | 许可证均为 MIT | 夹具 repo |

---

## 15. 部署与发布（2026-10-26 锁定）

### 15.1 托管平台

| 项 | 值 |
|---|---|
| 平台 | GitHub Pages |
| 仓库 | `github.com/gztcode/code-icu`（public） |
| 线上地址 | `https://gztcode.github.io/code-icu/` |
| 产物根目录 | `src/`（源码即产物，零构建） |
| 发布方式 | 推送 `main` → GitHub Actions 自动发布 |
| 关闭 Jekyll | `src/.nojekyll` |

路由为 Hash 路由（`#/r/{owner}/{repo}`），全部静态资源用相对路径引用，因此部署在子目录下无需任何 rewrite 规则。

### 15.2 发布流水线

`.github/workflows/deploy.yml` 两个 job：

1. **部署到 Pages** —— `src/` → `upload-pages-artifact` → `deploy-pages`
2. **部署后冒烟** —— 校验 19 个关键静态资源返回 200 + 首页内容完整；失败只告警（`continue-on-error`），不阻塞已完成的发布

触发条件：`src/**`、`assets/**`、workflow 文件变更时自动触发，也支持手动 `workflow_dispatch`。

### 15.3 发布后验证清单

每次发布后跑 `node tests/online-smoke.mjs https://gztcode.github.io/code-icu/`，覆盖：

- 首页渲染（标题、输入框、3 个示例按钮、品牌区可点回首页）
- 报告页（项目名 / 用户名 / 头像三个外链指向 GitHub、健康分渲染、「回首页」存在）
- 通知书页（印章渲染、「返回报告」「回首页」存在）
- PNG 导出可落盘（1080×1440）
- 交互连通性（点击示例进报告页、返回报告、回首页）
- 无 JS 运行时错误

### 15.4 本机推送通道（本环境特有）

本机到 `github.com:443` 被代理拦截（502），SSH 公钥因 `gh` token 缺 `admin:public_key` scope 未能上传，因此推送走 **GitHub Git Database API**（建 blob → tree → commit → ref），脚本逻辑见 ADR-002。

恢复标准 `git push` 的步骤：

```bash
gh auth refresh -h github.com -s admin:public_key   # 浏览器确认授权
gh ssh-key add ~/.ssh/id_ed25519_github_codeicu.pub --title "code-icu macOS"
```

`~/.ssh/config` 已配置 `github.com` → `ssh.github.com:443`（端口 22 不通，443 已登记于 `known_hosts`）。
