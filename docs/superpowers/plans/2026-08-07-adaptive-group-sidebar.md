# Adaptive Group Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, collapsible desktop group sidebar and a swipeable mobile group drawer without changing navigation data or ordering.

**Architecture:** Derive a small sidebar view model from the existing sorted groups, keep active-section tracking in a dedicated hook, and share one presentational group list between desktop and mobile containers. `NavApp` owns the responsive composition and navigation state; the existing store remains unchanged.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Vaul, Radix Tooltip, Lucide icons, Vitest.

---

## File Map

- Create `lib/sidebar-navigation.ts`: pure sidebar item, preference, and active-id helpers.
- Create `lib/sidebar-navigation.test.ts`: unit coverage for counts, fixed order, disabled search results, storage failures, and active fallback.
- Create `hooks/use-active-group.ts`: `IntersectionObserver` lifecycle and clicked-target handoff.
- Create `components/group-sidebar.tsx`: shared list, desktop sidebar, mobile drawer, and edge-swipe opener.
- Modify `components/nav-header.tsx`: add the mobile navigation trigger.
- Modify `components/quick-bar.tsx`: remove duplicate horizontal group navigation.
- Modify `components/bookmark-group.tsx`: expose stable group section metadata and scroll margin.
- Modify `components/nav-app.tsx`: build sidebar items, connect active tracking, and compose the new layout.
- Modify `app/globals.css`: reduced-motion behavior for sidebar and smooth-scroll transitions.

### Task 1: Sidebar View Model and Preference

**Files:**
- Create: `lib/sidebar-navigation.test.ts`
- Create: `lib/sidebar-navigation.ts`

- [ ] **Step 1: Write failing view-model tests**

Cover these exact behaviors:

```ts
const groups = [
  { id: 'vps', name: 'VPS', color: '#3B82F6', order: 0, bookmarks: [
    { id: 'v1', name: 'VPS 01', url: 'https://v1.example.com', order: 0 },
    { id: 'v2', name: 'VPS 02', url: 'https://v2.example.com', order: 1 },
  ] },
  { id: 'docs', name: '资料', color: '#10B981', order: 1, bookmarks: [] },
]

expect(buildSidebarItems(groups, '')).toMatchObject([
  { id: 'vps', count: 2, disabled: false },
  { id: 'docs', count: 0, disabled: false },
])
expect(buildSidebarItems(groups, '02')).toMatchObject([
  { id: 'vps', count: 1, disabled: false },
  { id: 'docs', count: 0, disabled: true },
])
expect(resolveActiveGroupId(['vps', 'docs'], 'missing')).toBe('vps')
```

Also assert that `readSidebarCollapsed` returns `false` for missing/throwing storage and that `writeSidebarCollapsed` stores `1` or removes the key without propagating storage errors.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
& '.\node_modules\.bin\vitest.cmd' run lib/sidebar-navigation.test.ts --reporter=dot
```

Expected: FAIL because `sidebar-navigation.ts` does not exist.

- [ ] **Step 3: Implement the pure helpers**

Use these public types and signatures:

```ts
import type { Group } from './types'

export const SIDEBAR_COLLAPSED_KEY = 'mininav_sidebar_collapsed'

export interface SidebarItem {
  id: string
  name: string
  color: string
  count: number
  disabled: boolean
}

type ReadStorage = Pick<Storage, 'getItem'>
type WriteStorage = Pick<Storage, 'setItem' | 'removeItem'>

export function buildSidebarItems(groups: Group[], query: string): SidebarItem[]
export function resolveActiveGroupId(groupIds: string[], currentId: string | null): string | null
export function readSidebarCollapsed(storage: ReadStorage): boolean
export function writeSidebarCollapsed(storage: WriteStorage, collapsed: boolean): void
```

`buildSidebarItems` must preserve input order. Match the existing search semantics: case-insensitive bookmark name or URL. Catch storage exceptions and fall back to expanded state.

- [ ] **Step 4: Run focused and full tests**

Expected: focused tests pass, then all 20 existing tests plus the new tests pass.

- [ ] **Step 5: Commit**

```powershell
git add -- lib/sidebar-navigation.ts lib/sidebar-navigation.test.ts
git commit -m "test: define sidebar navigation behavior"
```

### Task 2: Active Group Tracking

**Files:**
- Create: `hooks/use-active-group.ts`
- Modify: `lib/sidebar-navigation.test.ts`
- Modify: `lib/sidebar-navigation.ts`

- [ ] **Step 1: Add failing selection tests**

Add a pure entry selector so observer ordering can be tested without a DOM:

```ts
expect(selectClosestVisibleGroup([
  { id: 'vps', top: -180, isIntersecting: true },
  { id: 'docs', top: 118, isIntersecting: true },
], 112)).toBe('docs')
expect(selectClosestVisibleGroup([], 112)).toBeNull()
```

- [ ] **Step 2: Run the focused test and confirm RED**

Expected: FAIL because `selectClosestVisibleGroup` is missing.

- [ ] **Step 3: Implement selector and hook**

Add this signature to the pure module:

```ts
export function selectClosestVisibleGroup(
  entries: Array<{ id: string; top: number; isIntersecting: boolean }>,
  anchorTop: number
): string | null
```

Create the hook with this interface:

```ts
export function useActiveGroup(groupIds: string[]): {
  activeGroupId: string | null
  setActiveGroupId: React.Dispatch<React.SetStateAction<string | null>>
}
```

Observe elements named `group-${id}` with a top root margin matching the 112px sticky header area. Recreate and disconnect the observer when `groupIds` changes. Resolve a deleted or filtered active id through `resolveActiveGroupId`.

- [ ] **Step 4: Run focused and full tests, then typecheck**

Expected: all tests and `tsc --noEmit` pass.

- [ ] **Step 5: Commit**

```powershell
git add -- lib/sidebar-navigation.ts lib/sidebar-navigation.test.ts hooks/use-active-group.ts
git commit -m "feat: track the active bookmark group"
```

### Task 3: Shared and Desktop Sidebar

**Files:**
- Create: `components/group-sidebar.tsx`

- [ ] **Step 1: Implement shared sidebar content**

Expose these component contracts:

```ts
interface GroupSidebarContentProps {
  items: SidebarItem[]
  activeGroupId: string | null
  collapsed?: boolean
  onSelect: (id: string) => void
}

type DesktopGroupSidebarProps = GroupSidebarContentProps
```

Render native buttons with color swatch, truncated name, count, `disabled`, and `aria-current="location"`. In collapsed mode retain a stable 56px item width and use existing Radix tooltip components for the full name. The desktop container must be `hidden lg:flex`, sticky below the 56px header, internally scrollable, and 220px/56px wide without resizing its controls.

- [ ] **Step 2: Implement local preference behavior**

Read `readSidebarCollapsed(localStorage)` in the desktop owner and write every explicit toggle through `writeSidebarCollapsed`. Preference failure must leave the current in-memory state usable.

Add a `.sidebar-transition` class in `app/globals.css` for width/transform transitions and disable those transitions together with smooth scrolling inside `@media (prefers-reduced-motion: reduce)`.

- [ ] **Step 3: Run ESLint and typecheck**

Expected: no warnings or type errors.

- [ ] **Step 4: Commit**

```powershell
git add -- components/group-sidebar.tsx app/globals.css
git commit -m "feat: add collapsible desktop group sidebar"
```

### Task 4: Mobile Drawer and Header Trigger

**Files:**
- Modify: `components/group-sidebar.tsx`
- Modify: `components/nav-header.tsx`

- [ ] **Step 1: Add controlled mobile navigation props**

Extend `NavHeaderProps` with:

```ts
navigationOpen: boolean
onNavigationOpenChange: (open: boolean) => void
```

Add a `Menu` icon button before the title. It is visible below `lg`, uses `aria-label="打开分组导航"`, `aria-expanded`, and calls `onNavigationOpenChange(true)`.

- [ ] **Step 2: Implement the mobile drawer**

Expose:

```ts
interface MobileGroupDrawerProps extends GroupSidebarContentProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}
```

Use existing `Drawer`, `DrawerContent`, `DrawerHeader`, `DrawerTitle`, and `DrawerDescription` with `direction="left"`. Set width to `min(78vw, 320px)`, lock background scrolling through Vaul, and close after a successful enabled item selection.

Close the controlled drawer first, then call the shared selection callback in `requestAnimationFrame` so positioning occurs after the overlay begins releasing focus and scroll locks.

- [ ] **Step 3: Add edge-swipe opening**

When the drawer is closed, render a fixed 20px left-edge gesture zone below the header. Track one pointer sequence and open only when horizontal movement is at least 48px, vertical drift is at most 32px, and movement is rightward. Use `touch-action: pan-y`; never intercept ordinary vertical scrolling.

- [ ] **Step 4: Run ESLint and typecheck**

Expected: no warnings or type errors.

- [ ] **Step 5: Commit**

```powershell
git add -- components/group-sidebar.tsx components/nav-header.tsx
git commit -m "feat: add swipeable mobile group drawer"
```

### Task 5: App Integration and Duplicate Navigation Removal

**Files:**
- Modify: `components/nav-app.tsx`
- Modify: `components/quick-bar.tsx`
- Modify: `components/bookmark-group.tsx`

- [ ] **Step 1: Simplify QuickBar**

Remove the `groups` prop and the horizontal group-link list. Keep a stable search row aligned to the right and preserve the current pinned row. Do not change bookmark opening behavior.

Import `normalizeSearchQuery` from `lib/sidebar-navigation` and use its normalized value in the existing `filteredGroups` bookmark filter. Both the sidebar counts and rendered search results must therefore trim and lowercase through the same helper.

- [ ] **Step 2: Mark scroll targets**

Add `data-group-id={group.id}` to each `BookmarkGroup` section and increase its scroll margin only as needed to clear the sticky header and QuickBar. Keep the existing section id `group-${group.id}`.

- [ ] **Step 3: Compose the responsive layout in NavApp**

Add state and derivations:

```ts
const [navigationOpen, setNavigationOpen] = useState(false)
const sidebarItems = useMemo(
  () => buildSidebarItems(sortedGroups, searchQuery),
  [sortedGroups, searchQuery]
)
const visibleGroupIds = useMemo(
  () => sidebarItems.filter((item) => !item.disabled).map((item) => item.id),
  [sidebarItems]
)
const { activeGroupId, setActiveGroupId } = useActiveGroup(visibleGroupIds)
```

Create one `handleGroupSelect(id)` that verifies the element exists, sets active state, and calls `scrollIntoView({ behavior: 'smooth', block: 'start' })`. Pass it to both sidebar containers.

Place `DesktopGroupSidebar` and the existing QuickBar/main/footer content in a flex layout below `NavHeader`; the main content wrapper must use `min-w-0 flex-1`. Mount `MobileGroupDrawer` beside the layout with controlled open state. Do not change DnD/store/modal logic.

- [ ] **Step 4: Run complete automated verification**

Run Vitest, strict ESLint, `tsc --noEmit`, and `next build`. Expected: all exit 0.

- [ ] **Step 5: Commit**

```powershell
git add -- components/nav-app.tsx components/quick-bar.tsx components/bookmark-group.tsx
git commit -m "feat: integrate responsive group navigation"
```

### Task 6: Browser and Regression Verification

**Files:**
- Potentially modify: `components/group-sidebar.tsx`
- Potentially modify: `components/nav-app.tsx`
- Potentially modify: `components/nav-header.tsx`
- Potentially modify: `components/quick-bar.tsx`
- Potentially modify: `components/bookmark-group.tsx`
- Potentially modify: `hooks/use-active-group.ts`
- Potentially modify: `lib/sidebar-navigation.ts`
- Potentially modify: `lib/sidebar-navigation.test.ts`
- Potentially modify: `app/globals.css`

- [ ] **Step 1: Start a local development server**

Run the project-local Next binary on an unused port with the window hidden. Confirm `/` returns HTTP 200.

- [ ] **Step 2: Verify desktop behavior at 1440x900**

Check: all group names visible, counts correct, current highlight follows scrolling, clicking jumps with no header overlap, collapse width is stable, tooltip appears, refresh restores collapse state, search dims zero-match groups, and admin reorder updates the list.

- [ ] **Step 3: Verify mobile behavior at 390x844**

Check: no fixed sidebar, menu trigger opens a left drawer, edge swipe opens it, left swipe/overlay/Escape close it, selecting a group closes and navigates, background does not scroll under the drawer, and text does not overlap.

- [ ] **Step 4: Verify themes and reduced motion**

Check light, sepia, and dark contrast. Emulate reduced motion and confirm transitions no longer animate substantially.

- [ ] **Step 5: Fix discovered defects with focused regression coverage**

For each defect, add or update the closest pure unit test when practical, reproduce the failure, make the smallest correction, and rerun the focused test.

- [ ] **Step 6: Run final gates and stop temporary servers**

Run all tests, strict ESLint, typecheck, production build, `git diff --check`, and confirm no test listener remains. Expected: every command exits 0.

- [ ] **Step 7: Commit final verification fixes if any**

```powershell
git add -- components/group-sidebar.tsx components/nav-app.tsx components/nav-header.tsx components/quick-bar.tsx components/bookmark-group.tsx hooks/use-active-group.ts lib/sidebar-navigation.ts lib/sidebar-navigation.test.ts app/globals.css
if (-not (git diff --cached --quiet)) { git commit -m "fix: polish responsive group navigation" }
```
