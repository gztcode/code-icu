# OPEN-DECISIONS

> 只追加 + 就地关闭。每次 Phase 开始时自动复现未决项。

| Date | Source | Open Item | Related Constraints | Current Leaning | Blocked By | Resolves When | Status |
|------|--------|-----------|---------------------|-----------------|------------|---------------|--------|
| 2026-10-26 | Phase 1 | 图标库最终选型（Lucide / 其他单套 SVG） | P0-1 禁止 emoji，必须锁定一套 | 倾向 Lucide（24px 网格、1.5px 描边、MIT） | 等颜好看设计稿回传 | 设计师回传 icon-list.md 后 | OPEN |
| 2026-10-26 | Phase 1 | 病危通知书是否绘制仓库头像 | Canvas 跨域污染风险 | 倾向不绘制远程头像，用首字母色块 | 等设计稿与前端验证 | 导出功能跑通后 | OPEN |
| 2026-10-26 | Phase 1 | 示例仓库走快照还是实时 API | 限流 60/h，示例应保证 100% 可用 | 倾向示例走预置快照（零请求） | 无 | Spec 已定为快照，待实现验证 | OPEN |
