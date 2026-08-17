# MiniNav Compact Navigation And Card Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将双层置顶导航压缩为单层菜单栏，在书签卡片上显示常用、重点和备注状态，接入 MiniNav 自有图标，并把 README 改为个人维护手册。

**Architecture:** `NavHeader` 接管受控搜索状态，`NavApp` 删除 QuickBar 及其派生列表。`BookmarkCard` 根据现有 `clicks` 和 `pinned` 字段渲染状态，备注交互拆到独立的 `BookmarkNote` 组件。图标使用生成的 PNG 资产和 Next.js metadata，不修改云端数据结构。

**Tech Stack:** Next.js 16、React 19、TypeScript、Tailwind CSS、Lucide React、Vitest、Testing Library、Pillow、Playwright/应用内浏览器。

---

## 文件结构

- `components/nav-header.tsx`：单层菜单栏和桌面/手机搜索。
- `components/nav-app.tsx`：删除 QuickBar，向菜单栏传递搜索状态。
- `hooks/use-active-group.ts`：只测量菜单栏高度。
- `components/bookmark-note.tsx`：备注浮层及输入事件隔离。
- `components/bookmark-card.tsx`：网址恒显、火苗、重点图钉和备注入口。
- `components/quick-bar.tsx`、`components/quick-bar.test.tsx`：删除。
- `public/mininav-icon.png`、`public/favicon-32.png`、`public/apple-touch-icon.png`：新图标资产。
- `app/layout.tsx`：图标 metadata。
- `README.md`：个人维护手册。

### Task 1: 菜单栏搜索

**Files:**
- Modify: `components/nav-header.test.tsx`
- Modify: `components/nav-header.tsx`

- [ ] **Step 1: 写失败测试**

在测试渲染器中传入 `searchQuery`、`onSearchChange`，验证桌面搜索框读取受控值、输入回传、清空按钮回传空串；手机搜索按钮打开同高搜索状态，Escape 清空查询并关闭。

```tsx
const onSearchChange = vi.fn()
renderHeader({ searchQuery: 'vps', onSearchChange })
const search = screen.getByRole('textbox', { name: '搜索书签' })
await user.clear(search)
await user.type(search, 'nas')
expect(onSearchChange).toHaveBeenLastCalledWith('nas')
```

- [ ] **Step 2: 确认测试因缺少搜索契约而失败**

Run: `pnpm test -- components/nav-header.test.tsx --reporter=dot`
Expected: FAIL，`NavHeaderProps` 缺少搜索属性或找不到搜索框。

- [ ] **Step 3: 实现受控搜索**

向 `NavHeaderBaseProps` 增加：

```ts
searchQuery: string
onSearchChange: (query: string) => void
```

电脑端渲染 `hidden md:flex` 搜索框；手机端渲染搜索按钮，打开后在同一 `h-14` 容器内显示搜索框。清空按钮调用 `onSearchChange('')`，Escape 同时清空并关闭手机搜索状态。

- [ ] **Step 4: 确认菜单栏测试通过**

Run: `pnpm test -- components/nav-header.test.tsx --reporter=dot`
Expected: PASS。

### Task 2: 删除 QuickBar 并修正定位

**Files:**
- Modify: `components/nav-app.test.tsx`
- Modify: `hooks/use-active-group.test.ts`
- Modify: `components/nav-app.tsx`
- Modify: `hooks/use-active-group.ts`
- Delete: `components/quick-bar.tsx`
- Delete: `components/quick-bar.test.tsx`

- [ ] **Step 1: 写失败集成测试**

修改 `NavHeader` mock，让它渲染测试搜索框并记录 props。删除 QuickBar mock 和断言，新增：

```tsx
expect(latest<HeaderProps>(appMocks.headerProps)).toEqual(
  expect.objectContaining({
    searchQuery: '',
    onSearchChange: expect.any(Function),
  })
)
expect(document.querySelector('[data-sticky-navigation]')).toBeNull()
```

将 active-group 的回退顶部期望从 `112` 改为 `56`，并验证只读取 `[data-nav-header]`。

- [ ] **Step 2: 确认旧结构导致测试失败**

Run: `pnpm test -- components/nav-app.test.tsx hooks/use-active-group.test.ts --reporter=dot`
Expected: FAIL，搜索仍由 QuickBar 承担，回退偏移仍为 112。

- [ ] **Step 3: 删除第二层导航**

在 `NavApp` 中移除 `QuickBar` import、`pinnedBookmarks`、`frequentBookmarks` 和组件渲染，将 `searchQuery`、`setSearchQuery` 传给 `NavHeader`。管理模式提示改为“点击图钉标记重点”。

在 `use-active-group.ts` 中设 `STICKY_HEADER_TOP = 56`，并把选择器缩减为：

```ts
const STICKY_LAYOUT_SELECTORS = ['[data-nav-header]']
```

- [ ] **Step 4: 删除 QuickBar 文件并确认集成测试通过**

Run: `pnpm test -- components/nav-app.test.tsx hooks/use-active-group.test.ts --reporter=dot`
Expected: PASS。

### Task 3: 卡片状态和备注浮层

**Files:**
- Create: `components/bookmark-note.tsx`
- Create: `components/bookmark-card.test.tsx`
- Modify: `components/bookmark-card.tsx`

- [ ] **Step 1: 写卡片失败测试**

mock `useSortable` 为稳定空状态，测试以下行为：

```tsx
expect(screen.getByText('example.com')).toBeTruthy()
expect(screen.getByLabelText('常用，已打开 3 次')).toBeTruthy()
expect(screen.getByLabelText('重点书签')).toBeTruthy()
await user.click(screen.getByRole('button', { name: '查看备注' }))
expect(screen.getByRole('tooltip').textContent).toBe('仅公司网络可用')
expect(onOpen).not.toHaveBeenCalled()
```

另测 `clicks: 2` 不显示火苗、无备注不显示按钮、Escape 关闭浮层、第二行始终是域名。

- [ ] **Step 2: 确认测试因缺少新行为而失败**

Run: `pnpm test -- components/bookmark-card.test.tsx --reporter=dot`
Expected: FAIL，备注仍覆盖域名且状态徽标不存在。

- [ ] **Step 3: 实现 BookmarkNote**

组件接收 `note: string`，内部维护 `open`。按钮停止 click 和 pointer down 冒泡，使用 `onPointerEnter`、`onPointerLeave`、`onFocus`、`onBlur`、`onClick` 和 Escape 控制浮层。浮层使用 `role="tooltip"`，右对齐、最大宽度不超过视口，长文本自动换行并限制高度。

- [ ] **Step 4: 更新 BookmarkCard**

第二行固定渲染 `getDomain(bookmark.url)`。标题行右侧状态区按条件显示：

```tsx
{(bookmark.clicks ?? 0) >= 3 && (
  <Flame aria-label={`常用，已打开 ${bookmark.clicks} 次`} />
)}
{bookmark.pinned && <Pin aria-label="重点书签" />}
{bookmark.note && <BookmarkNote note={bookmark.note} />}
```

管理操作文案改为“标记重点”与“取消重点”，状态区和操作区使用稳定尾部空间，不能重叠。

- [ ] **Step 5: 确认卡片和分组测试通过**

Run: `pnpm test -- components/bookmark-card.test.tsx components/bookmark-group.test.tsx --reporter=dot`
Expected: PASS。

### Task 4: MiniNav 图标

**Files:**
- Create: `public/mininav-icon.png`
- Create: `public/favicon-32.png`
- Create: `public/apple-touch-icon.png`
- Modify: `app/layout.tsx`
- Modify: `components/nav-header.tsx`
- Delete: unused v0/placeholder icon assets confirmed by `rg`

- [ ] **Step 1: 生成源图**

使用 imagegen 生成 1024x1024 PNG：石墨色圆角方形背景、白色房屋轮廓与四格导航网格、一个暖橙色强调格，不使用文字、阴影或细线。

- [ ] **Step 2: 派生尺寸并验证像素**

使用 Pillow 以 LANCZOS 生成 32x32 和 180x180 文件，确认图像非空、RGBA/RGB 正常，32px 下主体仍可辨识。

- [ ] **Step 3: 接入 metadata 和菜单栏**

在 metadata 中声明：

```ts
icons: {
  icon: '/favicon-32.png',
  apple: '/apple-touch-icon.png',
}
```

使用 `next/image` 在标题左侧渲染 22x22 的 `/mininav-icon.png`。

- [ ] **Step 4: 检查旧资产引用后清理**

Run: `rg -n "icon\.svg|icon-light|icon-dark|placeholder-logo|apple-icon" app components lib README.md`
Expected: 无有效引用后删除旧 v0 和 placeholder 图标。

### Task 5: README 个人维护手册

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 重写 README**

按以下顺序编写：当前定位、日常使用、本地测试 BAT、环境变量与存储、导入导出、私人数据规则、维护发布流程、验证命令、技术栈和维护注意事项。明确 `reference/` 永不提交，并移除 v0/Kiro 宣传链接。

- [ ] **Step 2: 核对命令和实现**

Run: `rg -n "test-homedb|pnpm test|pnpm typecheck|BLOB_READ_WRITE_TOKEN|NAV_PASSWORD|reference/|Vercel" README.md`
Expected: 每项维护关键信息都有明确说明。

### Task 6: 完整验证和视觉验收

**Files:**
- Verify: all changed source, test, asset, and documentation files from Tasks 1-5

- [ ] **Step 1: 自动化门禁**

Run: `pnpm test -- --reporter=dot`
Expected: 全部测试通过。

Run: `pnpm typecheck`
Expected: exit 0。

Run: `pnpm lint`
Expected: exit 0，无 warning。

Run: `pnpm build`
Expected: Next.js production build成功。

- [ ] **Step 2: Git 完整性**

Run: `git diff --check`
Expected: 无输出。

Run: `rg -n "^(<<<<<<< .+|=======$|>>>>>>> .+)$" .`
Expected: 无冲突标记。

- [ ] **Step 3: 浏览器验收**

启动本地开发服务器，在 1440x900 和 390x844 检查：页面只有一层 56px 置顶栏；电脑/手机搜索可用；滚动时无遮挡；火苗、图钉和管理按钮不重叠；备注浮层不越界；新图标显示在标签页和菜单栏。

- [ ] **Step 4: 提交并推送**

```bash
git add -A
git commit -m "feat: streamline navigation and bookmark status"
git fetch origin main
git push origin main
```
