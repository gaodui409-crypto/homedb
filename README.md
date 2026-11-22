# MiniNav

> 自用的个人书签导航站，电脑浏览器为主，手机用于白天临时查找和打开网站。

## 当前定位

- 当前版本：`0.4.0`
- 分组和书签顺序由手动维护，不会根据访问频率自动调整。
- 电脑端使用左侧分组导航，手机端使用滑动抽屉切换分组。
- 顶部只保留一层 56px 菜单栏，搜索框已合并到菜单栏。
- 书签打开次数达到 3 次时显示火苗；“重点”图钉只是标记，不改变排序。
- 卡片第二行始终显示网址域名。备注在电脑端悬浮或聚焦时显示，在手机端轻触备注图标切换显隐。

## 日常使用

1. 按 `/` 或 `Ctrl+K`（macOS 为 `Cmd+K`）直达顶部搜索框，输入名称、网址或备注即可实时过滤；按 `↑` / `↓` 切换命中卡片、按 `Enter` 在新标签页打开并累计打开次数、按 `Esc` 清空退出。
2. 点击书签卡片会在新标签页打开，并累计打开次数。
3. 点击右上角齿轮进入管理模式（或按 `Ctrl+Shift+A` / `Cmd+Shift+A`），可新建、编辑、删除、拖拽排序和标记重点；跨组拖拽按 `Esc` 可取消，删除后底部提供 6 秒一键撤销。
4. 弹窗支持 `Esc` 或点遮罩关闭，填写表单时按 `Ctrl+Enter`（`Cmd+Enter`）可直接保存。
5. 数据异常或大改前先在管理模式中导出 `mininav-export.json`。

## 本地测试工具

项目根目录的 `test-homedb.bat` 是日常入口，双击后按数字选择：

| 选项 | 用途 | 内容 |
| --- | --- | --- |
| `1` | 快速检查 | Vitest + TypeScript + ESLint |
| `2` | 完整门禁 | 快速检查 + Next.js 生产构建 |
| `3` | 开发预览 | 自动选择从 3000 开始的空闲端口，启动开发服务器并打开浏览器 |
| `4` | 生产预览 | 构建后自动选择空闲端口，启动 `next start` 并打开浏览器 |
| `5` | 监听测试 | 在独立窗口持续运行 Vitest |

- 如果缺少 `node_modules`，BAT 会按锁文件执行 `pnpm install --frozen-lockfile`。
- 预览服务器运行在独立窗口，关闭该窗口即可停止服务。
- BAT 闪退时，从项目目录的 `cmd` 窗口运行 `test-homedb.bat`，可保留错误输出。

## 手动启动

需要 Node.js LTS 和 pnpm。若已安装 Node.js 但没有 pnpm，可先启用 Corepack。

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm dev --port 3000
```

打开 [http://localhost:3000](http://localhost:3000)。不要使用 `pnpm dev -- --port 3000`，Next.js 会把额外的 `--` 误认为项目目录。

## 环境变量与存储

| 变量 | 作用 | 未配置时 |
| --- | --- | --- |
| `NAV_PASSWORD` | 页面登录密码，同时保护 `/api/data` 读写 | 不要求登录 |
| `BLOB_READ_WRITE_TOKEN` | 读写 Vercel Blob 中的 `nav-data.json` | 仅存当前浏览器的 localStorage |

本地需要环境变量时，在项目根目录创建不会提交的 `.env.local`：

```dotenv
NAV_PASSWORD=自己的访问密码
BLOB_READ_WRITE_TOKEN=自己的_Vercel_Blob_令牌
```

Vercel 上的变量在 Project Settings > Environment Variables 管理。修改后需要重新部署才会生效。

**注意：**
- 开启 `BLOB_READ_WRITE_TOKEN` 时务必同时配置 `NAV_PASSWORD`，否则 `/api/data` 可被匿名读写。
- 建议在 Vercel 后台只给 **Production** 勾选 `BLOB_READ_WRITE_TOKEN`，让 Preview / Development 自动回退「仅存本机」，避免预览测试误改正式站数据；本地只测界面时也应留空该变量。

### 存储边界

| 数据 | localStorage | Vercel Blob | JSON 导出 |
| --- | --- | --- | --- |
| 分组、书签、顺序、折叠、重点、备注、点击次数 | 是 | 配置 Blob 时是 | 是 |
| 主题、页面标题、自定义背景 | 是 | 否 | 否 |
| 左侧栏折叠状态、登录令牌 | 是 | 否 | 否 |

因此，更换浏览器或设备时，书签可从 Blob 同步，但主题、标题和背景需要在新设备上重新设置。

## 导入与导出

导入文件不能超过 1 MB，顶层必须是包含 `groups` 数组的 JSON 对象。最简格式：

```json
{
  "groups": [
    {
      "name": "VPS",
      "bookmarks": [
        {
          "name": "VPS 01",
          "url": "https://example.com",
          "note": "只能从公司网络访问"
        }
      ]
    }
  ]
}
```

- `id`、`order`、`color` 可省略，导入时会自动生成。
- `url` 必须是完整的 `http://` 或 `https://` 地址。
- `icon` 字段可省略，也可使用完整图片 URL 或 `builtin:server` 等内置图标。
- “覆盖现有”会清空现有数据；“合并保留”会保留现有分组，并按 ID 合并、自动重排顺序号。覆盖前建议先导出备份。
- 导出文件只包含分组和书签数据，不包含密码、Blob 令牌、主题或背景。

### 导入错误含义

- `文件不能超过 1 MB`：导入文件超出大小限制。
- `不是有效的 JSON 文件`：文件语法不是合法 JSON，常见原因是多余逗号、引号不匹配、注释或编码问题。
- `书签格式不对，请检查分组名、名称和网址`：JSON 语法正确，但不符合数据结构，优先检查顶层 `groups`、分组名、书签名和完整 HTTP/HTTPS 网址。

## 私密数据规则

- `reference/` 只用于放本地导出、旧数据和测试样本，已在 `.gitignore` 中忽略，**永远不提交**。
- `.env.local` 中可能有密码和 Blob 令牌，也永远不提交。
- 提交前运行 `git status --short`，确认没有导出 JSON、截图、令牌或其他个人数据。
- 可用 `git check-ignore reference/ -v` 确认私密目录仍被忽略。

## 维护与发布

1. 修改数据逻辑前，先从线上页面导出备份到 `reference/`。
2. 完成代码修改后，双击 `test-homedb.bat` 并选择 `2` 跑完整门禁。
3. 检查变更，只暂存本次要发布的文件。

```powershell
git status --short
git diff --check
git add <本次变更的文件>
git commit -m "feat: 说明本次修改"
git fetch origin main
git status --short --branch
git push origin main
```

4. GitHub `main` 更新后，Vercel 会自动创建部署。
5. 在 Vercel Deployments 中等待状态变为 Ready，再检查线上页面的搜索、分组导航、书签打开和同步状态。
6. 若部署失败，先查看 Vercel Build Logs，不要在未定位原因时覆盖线上数据。

## 验证命令

```powershell
pnpm test -- --reporter=dot
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

其中 `pnpm build` 是最接近 Vercel 构建环境的本地检查，推送前不应省略。

## 技术栈

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS 4
- dnd-kit 拖拽排序
- Zod 数据校验
- Vercel Blob 多设备数据存储
- Vitest + Testing Library

## 维护注意事项

- 不要让火苗、点击次数或重点标记参与分组和书签排序。
- 修改导入结构时保留对旧导出文件的兼容，并先增加失败测试。
- 修改同步逻辑时，同时检查 localStorage 回退、未同步标记和 Blob 首次初始化。
- 移动端只做辅助使用，但每次发布仍要检查 390px 宽度下菜单栏、抽屉和备注浮层不重叠。
