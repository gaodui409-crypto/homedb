# AGENTS.md — MiniNav 开发与维护守则

> 自用个人书签导航站（每天打开的第一屏高频启动台，电脑端为主、手机端临时查找）。任何 AI 代理或协作者修改代码前，必须严格遵守以下定规。

## 1. 不可触碰的产品红线

1. **纯手动排序**：分组与书签顺序严格按 `order` 手动维护。**严禁**根据点击次数（`clicks`）、最近访问时间或“重点”图钉（`pinned`）自动重排。
2. **状态标记克制**：
   - 打开满 `3` 次（`clicks >= 3`）仅在卡片右上显示火苗徽标；
   - “重点”图钉（`pinned === true`）仅作高亮标记，不改变排序。
3. **布局骨架固定**：
   - 电脑端（`lg+`）保持左侧自适应分组导航栏 + 顶部单层 `56px` 菜单栏（搜索框合并在顶栏内，不再叠第二层工具栏）；
   - 手机端保持滑动抽屉切换分组，搜索在同一行 `56px` 顶栏内切换展开。
4. **100% 数据向后兼容**：
   - 始终兼容现有浏览器 `localStorage` 数据与 `mininav-export.json` 导入导出格式（含 `groups[].collapsed`、`bookmarks[].pinned/clicks/icon/note` 以及 `builtin:*` 内置图标标记）。
   - 修改存储或导入导出校验前，必须先补充测试确保旧导出文件无损读写。
5. **私密数据边界**：
   - `reference/` 目录仅存放本地备份与真实导出样本，`.env.local` 存放访问密码与 Vercel Blob 令牌，**永远禁止提交到 Git 或写入测试代码**。

## 2. 目录与模块职责

- `app/`：Next.js App Router 入口、全局主题样式令牌（`globals.css`）及服务端接口：
  - `app/api/auth/route.ts`：基于 `NAV_PASSWORD` 的无状态 HMAC 登录与校验。
  - `app/api/data/route.ts`：Vercel Blob 读写网关，未配置 `BLOB_READ_WRITE_TOKEN` 时自动回退为本地模式（`X-Nav-Data-Source: disabled`）。
- `components/`：界面组件与同目录 `.test.tsx` 组件测试：
  - `nav-app.tsx`：主视图编排、搜索键盘流、拖拽草稿态提交/取消、删除撤销与状态提示。
  - `nav-header.tsx`：单层 `56px` 顶栏（品牌标题、搜索框、管理动作、背景、三态主题切换、同步状态）。
  - `group-sidebar.tsx`：桌面可折叠分组侧栏与手机左滑手势抽屉（`vaul`）。
  - `bookmark-group.tsx` / `bookmark-card.tsx` / `bookmark-note.tsx` / `favicon-image.tsx`：分组区块、书签卡片、悬浮/轻触备注浮层、多源 Favicon 与首字母徽标兜底。
  - `admin-modals.tsx`：书签、分组、导入方式、删除确认与背景设置弹窗。
- `hooks/`：视图监听钩子（如 `use-active-group.ts` 视口滚动分组高亮）。
- `lib/`：纯逻辑、数据校验与状态中心（配套 `.test.ts(x)` 单元测试）：
  - `nav-schema.ts`：唯一权威的 Zod 数据校验、导入归一化（`normalizeImportData`）、合并重排（`mergeNavGroups`）与单条损坏挽救（`salvageNavData`）。
  - `storage.ts`：`localStorage` 安全读写封装、配额异常兜底与损坏原始数据备份（`mininav_data_backup`）。
  - `sync-policy.ts`：云端首次同步策略与未同步标记（防本地损坏覆盖云端）。
  - `use-nav-store.ts`：书签/分组状态管理、串行云同步队列与本地/云端模式切换。
  - `sidebar-navigation.ts` / `favicon.ts` / `auth-token.ts`：侧栏搜索计数、图标/域名提取、服务端令牌签名。

## 3. 文案与交互准则

- **文案极简**：按钮、空状态、管理提示和报错一律用字少事明的大白话，避免机器术语与冗长说教。
- **双端与键盘友好**：所有主流程保证键盘直达（搜索聚焦、上下选、输入法安全的 `Enter` 打开、`Esc` 退出关闭），每次改动需兼顾桌面宽屏与 `390px` 手机视口不拥挤、不越界。

## 4. 变更门禁（提交前必跑）

```powershell
pnpm test -- --reporter=dot
pnpm typecheck
pnpm lint
pnpm build
git diff --check
git status --short
```

确认全部零报错零警告，且 `git status --short` 中不含 `reference/`、`.env*`、临时截图或导出 JSON 后方可提交。
