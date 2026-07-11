---
name: testing-homedb
description: Test HomeDB authentication, bookmark validation/persistence, and JSON import flows end-to-end in the browser.
---

# Testing HomeDB

## Devin Secrets Needed

- None for local-only testing.
- `HOMEDB_TEST_BLOB_READ_WRITE_TOKEN` is optional for cloud persistence tests.
  It must belong to an isolated Vercel Blob test store, not the user's personal
  production store. Map it to `BLOB_READ_WRITE_TOKEN` when starting the app.

## Setup

1. Install dependencies with
   `npx --yes pnpm@10.13.1 install --frozen-lockfile`.
2. Start isolated password mode without Blob:
   `env -u BLOB_READ_WRITE_TOKEN NAV_PASSWORD=devin-local-test-password npx --yes pnpm@10.13.1 dev`.
3. Open `http://localhost:3000`.
4. Clear local storage before deterministic tests. Relevant keys are
   `mininav_token`, `mininav_data`, `mininav_theme`, `mininav_title`, and
   `mininav_bg`.

The Vercel preview might redirect to Vercel authentication. Prefer local mode
unless preview access is already available.

## Authentication migration test

1. Set `mininav_token` to `no-auth-required` while `NAV_PASSWORD` is configured.
2. Reload the page.
3. Confirm “请输入访问密码” is shown instead of the dashboard.
4. Enter the disposable local password and confirm the three default groups
   render.

## Bookmark validation and persistence test

1. Click the top-right “进入管理模式” button.
2. Click “添加书签” in a group.
3. Submit `javascript:alert(1)` and confirm “请输入有效的网址” appears without
   closing the modal.
4. Replace the URL with `example.com` and save.
5. Hover the new card and use its `aria-label="编辑书签"` action; confirm the URL
   field is `https://example.com/`.
6. Reload and confirm the card remains.

## Import validation test

Use a JSON file with otherwise plausible data and a bookmark URL such as
`javascript:alert(1)`. Import it through the visible “导入” button. Confirm the
parse-error alert appears, the “导入数据” overwrite/merge modal does not open,
and existing cards remain unchanged.

## Evidence

Record one continuous browser session with annotations for:

- stale-token rejection;
- successful password login;
- unsafe URL rejection;
- normalized HTTPS storage;
- persistence after reload;
- unsafe import rejection.

Capture full-screen screenshots for the validation error, normalized edit
dialog, persisted card, and import alert.
