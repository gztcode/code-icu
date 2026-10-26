# Code ICU · 图标系统

> 锁定版本：**Lucide v1.61.0**（ISC 许可，可商用）
> 全项目只用这一套。不混用 Heroicons / Feather / 自绘图形，不出现任何 emoji 作为功能图标。

---

## 1. 锁定规格

| 项 | 值 |
|---|---|
| 图标库 | `lucide` v1.61.0（`lucide-static` 的 SVG 源，可离线内联） |
| 网格 | 24 × 24 viewBox |
| 描边 | `stroke-width: 1.5`（Lucide 默认 2，本项目统一降到 1.5 —— 病理表单的线条要细，2px 描边在纸面上显得笨重） |
| 端点/连接 | `stroke-linecap: round` / `stroke-linejoin: round` |
| 填充 | 一律 `fill: none`（唯一例外：印章五角星是纯填充图形，不属于图标系统） |
| 颜色 | 一律 `currentColor`，由父级文字色决定，禁止给图标单独写颜色 |

## 2. 三档尺寸（只有这三档）

| 尺寸 | class | 使用场景 |
|---|---|---|
| 16px | `.ic` | 行内跟随文字、按钮内、列表右侧小动作 |
| 20px | `.ic-20` | 清单项、体征名前的图标、可折叠区标题 |
| 24px | `.ic-24` | 独立图标容器（如异常态 38×38 的方框内） |

> 24px 是最大尺寸。本产品不需要 32/48px 的大图标 —— 视觉重锤由分数、波形、印章承担。

## 3. 基础 CSS

```css
.ic {
  width: 16px; height: 16px; flex: none; display: block;
  stroke: currentColor; fill: none;
  stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round;
}
.ic-20 { width: 20px; height: 20px; }
.ic-24 { width: 24px; height: 24px; }
```

内联方式（无构建步骤，用 `<symbol>` sprite 放在每个页面 `<body>` 开头，`aria-hidden="true"` 隐藏）：

```html
<svg style="display:none" aria-hidden="true">
  <symbol id="i-heart-pulse" viewBox="0 0 24 24"><path d="..."/></symbol>
</svg>

<svg class="ic" aria-hidden="true"><use href="#i-heart-pulse"/></svg>
```

- 纯装饰图标：`aria-hidden="true"`，且旁边一定有文字
- 图标按钮（只有图标没有文字）：必须写 `aria-label`
- 嵌入 sprite 的 `<symbol>` 内部不带 stroke 属性，由 `.ic` 的 CSS 统一注入 —— 所以换描边粗细只改一处

---

## 4. 完整图标清单（23 枚使用中 + 5 枚预留）

### 4.1 六项体征（语义固定，不得挪用）

| 图标 | Lucide 名 | 语义 | 尺寸 | 出现位置 |
|---|---|---|---|---|
| 心电波形 | `heart-pulse` | 心跳 HEART RATE | 16 / 20 | 首页体征说明、报告体征行 01 |
| 气流 | `wind` | 呼吸频率 RESPIRATION | 16 / 20 | 同上，体征行 02 |
| 单人 | `user-round` | 单人依赖度 BUS FACTOR | 16 / 20 | 同上，体征行 03 |
| 循环箭头 | `repeat-2` | 代谢 METABOLISM | 16 / 20 | 同上，体征行 04 |
| 盾牌勾 | `shield-check` | 免疫 IMMUNITY | 16 / 20 | 同上，体征行 05 |
| 卷轴 | `scroll-text` | 遗嘱 WILL | 16 / 20 | 同上，体征行 06 |

### 4.2 仓库档案数据

| 图标 | Lucide 名 | 语义 | 尺寸 | 出现位置 |
|---|---|---|---|---|
| 星 | `star` | star 数 | 16 | 报告·身份卡 STARS |
| 分叉 | `git-fork` | fork 数 | 16 | 报告·身份卡 FORKS |
| 圆点环 | `circle-dot` | open issues 数 | 16 | 报告·身份卡 OPEN ISSUES |
| 尖括号 | `code-2` | 主语言 | 16 | 报告·身份卡 LANGUAGE |
| 天平 | `scale` | 许可证 | 16 | 报告·身份卡 LICENSE |
| 日历钟 | `calendar-clock` | 最后提交时间 | 16 | 报告·身份卡 LAST COMMIT |

### 4.3 动作与导航

| 图标 | Lucide 名 | 语义 | 尺寸 | 出现位置 |
|---|---|---|---|---|
| 听诊器 | `stethoscope` | 开始体检（主动作） | 16 | 首页主 CTA、错误页"改地址再试" |
| 下箭头 | `download` | 导出病危通知书 | 16 | 报告底部主 CTA |
| 回转箭头 | `rotate-ccw` | 重新体检 | 16 | 顶栏、报告底部、错误页重试 |
| 复制 | `copy` | 复制结论 | 16 | 报告底部次按钮 |
| 右箭头 | `arrow-right` | 进入 / 下一步 | 16 | 首页病例行、错误页"看示例病例" |
| 外链 | `external-link` | 外部链接 | 16 | 错误页"测一下 GitHub 通不通" |
| 叉 | `x` | 取消 / 关闭 | 16 | 体检中"取消检查" |
| 下折角 | `chevron-down` | 展开指示（`details` 用） | 16 | 六项体征说明、每个体征的"怎么算的" |
| 房子 | `house` | 回首页 | 16 | 顶栏品牌（任何二级页都可点）、报告页与通知书页顶栏"回首页" |

### 4.4 状态与提示

| 图标 | Lucide 名 | 语义 | 尺寸 | 出现位置 |
|---|---|---|---|---|
| 勾 | `check` | 步骤完成 | 16 | 体检中进度步骤 01 / 02 |
| 旋转加载 | `loader` | 当前执行中（配 `spin` 动画） | 16 | 体检中进度步骤 03 |
| 锁 | `lock` | 隐私 / 数据不落地 | 20 | 首页隐私声明 |
| 清单 | `clipboard-list` | 说明文档 | 20 | 首页"什么是六项体征" |

### 4.5 异常态

| 图标 | Lucide 名 | 语义 | 尺寸 | 出现位置 |
|---|---|---|---|---|
| 问号文件 | `file-question` | 404 查无此仓 | 24 | 错误态 A |
| 仪表 | `gauge` | 403 限流 | 24 | 错误态 B |
| 断网 | `wifi-off` | 网络失败 | 24 | 错误态 C |
| 时钟 | `clock` | 限流重置倒计时 | 16 | 错误态 B 按钮 |

### 4.6 预留（已进 sprite，当前未用，给后续功能）

| 图标 | Lucide 名 | 用途 |
|---|---|---|
| 烧瓶 | `flask-conical` | 若免疫项要单独展开"僵尸 issue 的时间分布" |
| 沙漏 | `hourglass` | 若免疫项要显示"平均搁置天数" |
| 工作流 | `workflow` | 若治疗建议要画"补流程前后对比" |
| 方块勾 | `square-check-big` | 若治疗建议要加"已处理"勾选 |
| 钥匙文件 | `file-key` | 若遗嘱项要逐份列出文件 |

> 预留图标如需启用，在上述表格登记后再用。**不得引入清单外的图标。**

---

## 5. 禁止事项

- 禁止 emoji 作为任何功能性图标（火箭、图表、闪光、靶心、闪电这类表情符号一律不允许）。检测正则：
  `[\x{1F300}-\x{1F9FF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}]`
  > 例外：用户在仓库描述里自己写的 emoji 属于 UGC，原样展示，不做图标用。
- 禁止同一语义用两个不同图标（比如"重新体检"一处用 `rotate-ccw` 一处用 `refresh-cw`）
- 禁止给图标加独立色（如红色警告图标单独上 `--alarm`）。颜色继承父级文字；需要颜色时改父级
- 禁止混用描边图标与实心图标
- 禁止把图标放大到 32px 以上当插图用（需要大图时用波形或印章，不用图标放大）
- 禁止给图标加渐变、阴影、描边发光

## 6. 无障碍

| 场景 | 做法 |
|---|---|
| 装饰图标（旁边有文字） | `aria-hidden="true"` |
| 纯图标按钮 | `<button aria-label="重新体检"><svg aria-hidden="true">…</svg></button>` |
| 图标承载唯一信息（如体征条） | 图标 `aria-hidden`，信息用 `aria-label` 挂在容器上 |
| 加载图标 | 外层容器 `role="status" aria-live="polite"`，不要给 `loader` 加 `aria-label` |

## 7. 21 枚图标的全量校验

生成本次 sprite 时已逐枚核对 Lucide v1.61.0 官方 SVG 源（非手绘、非记忆重建）。前端可执行：

```bash
npm i -D lucide-static@1.61.0
node -e "const l=require('lucide-static'); console.log(l.HeartPulse)"   # 取单枚 SVG
```

或直接从 `https://unpkg.com/lucide-static@1.61.0/icons/heart-pulse.svg` 拉取，保证与设计稿像素一致。
