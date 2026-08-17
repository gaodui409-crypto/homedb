# MiniNav - 迷你导航页

个人书签导航站，支持分组管理、拖拽排序、多主题切换、密码保护、云端同步。

## 功能特性

- **分组管理**：创建、编辑、删除、拖拽排序书签分组
- **分组折叠**：点击分组标题折叠/展开，折叠状态随云端同步
- **书签管理**：添加、编辑、删除、跨组拖拽排序
- **书签备注**：为每个书签添加备注说明，卡片上直接显示
- **三种主题**：日间 / 阅读 / 深夜模式
- **背景自定义**：支持预设纯色和自定义壁纸图片（保存在本设备）
- **访问密码**：通过环境变量设置密码保护
- **云端同步**：使用 Vercel Blob 存储数据，多设备同步
- **JSON 导入导出**：支持简洁格式导入，自动生成 id 和 order
- **智能图标**：自动抓取网站 favicon，抓取失败时回退首字母配色头像
- **内置图标**：7 个 VPS/服务器场景图标（服务器、数据库、云服务、终端、存储、安全、监控）
- **自定义图标**：支持为每个书签指定图标 URL
- **点击统计**：记录书签点击次数，高频书签自动进入常用栏
- **响应式布局**：移动端 1 列，平板 2 列，桌面 3-4 列
- **搜索过滤**：实时搜索书签
- **常用应用栏**：置顶书签 + 最常访问快速入口
- **键盘快捷键**：Ctrl+Shift+A（Mac: Cmd+Shift+A）切换管理模式
- **Sticky 导航**：Header 和分类导航栏滚动时固定在顶部

## 部署方式一：Vercel（推荐）

1. Fork 本仓库到你的 GitHub
2. 在 Vercel 导入项目，Framework 选 Next.js
3. 在 Vercel Dashboard → Storage → Create Store → Blob，创建 Blob 存储（自动注入 `BLOB_READ_WRITE_TOKEN`）
4. 在 Settings → Environment Variables 添加 `NAV_PASSWORD`（你的访问密码）
5. 点击 Deploy，绑定自定义域名
6. 访问域名，输入密码，开始使用

## 部署方式二：本地开发

```bash
# 克隆项目
git clone https://github.com/your-username/homedb.git
cd homedb

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可访问。

**注意**：本地开发时如果没有配置 `BLOB_READ_WRITE_TOKEN`，数据将仅保存在 localStorage，不会同步到云端。

## JSON 导入格式（最简）

```json
{
  "groups": [
    {
      "name": "分组名称",
      "bookmarks": [
        { "name": "站点名", "url": "https://example.com" },
        { "name": "带图标", "url": "https://example.com", "icon": "https://icon-url.png" },
        { "name": "内置图标", "url": "http://10.0.0.1", "icon": "builtin:server" },
        { "name": "带备注", "url": "https://example.com", "note": "需要 VPN 访问" }
      ]
    }
  ]
}
```

- `id`、`order`、`color` 等字段可省略，导入时自动生成
- `icon` 字段可选，留空则自动获取网站 favicon；填 `builtin:xxx` 使用内置图标（server / database / cloud / terminal / harddrive / shield / monitor）
- `note` 字段可选，为书签添加备注说明
- IP 地址、内网主机等无法抓取图标的站点会自动使用首字母配色头像

## 环境变量说明

| 变量名 | 说明 | 必填 |
|--------|------|------|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob 存储令牌（创建 Blob Store 后自动注入） | 否（无则仅本地存储） |
| `NAV_PASSWORD` | 访问密码（留空则不需要密码） | 否 |

## 技术栈

- [Next.js](https://nextjs.org) - React 框架
- [React](https://react.dev) - UI 库
- [TypeScript](https://typescriptlang.org) - 类型安全
- [Tailwind CSS](https://tailwindcss.com) - 原子化 CSS
- [shadcn/ui](https://ui.shadcn.com) - UI 组件
- [@dnd-kit](https://dndkit.com) - 拖拽排序
- [Vercel Blob](https://vercel.com/storage/blob) - 云端存储

## 更新日志

### v0.4

**安全加固**
- 新增 `lib/server-auth.ts` 共享鉴权模块，`/api/data` 读写接口在设置密码时强制校验 Bearer token（修复未授权即可覆盖云端数据的漏洞）
- 修复 `timingSafeEqual` 收到畸形 token 时抛异常导致 500 的问题（增加长度保护与异常捕获）
- 登录密码改用时序安全比较，POST 数据增加格式校验
- 清理接口中残留的调试日志

**新功能**
- 智能图标：自动抓取网站 favicon（多服务回退），IP / 内网地址自动使用首字母配色头像
- 内置图标库：精选 7 个 VPS / 服务器场景图标，编辑书签时可一键选择
- 书签备注：为书签添加备注说明，卡片上直接显示
- 点击统计与最常访问：记录点击次数，高频书签自动进入常用栏
- 分组折叠：点击标题折叠/展开，状态随云端同步
- 背景自定义：预设纯色 + 自定义壁纸图片，自动叠加半透明层保证可读性
- 添加书签时根据 URL 自动建议名称

**修复**
- 修复 `bookmark-card.tsx` 中 `role` / `tabIndex` 被拖拽属性覆盖的无障碍问题
- 页脚同步状态在失败时正确显示"同步失败"而非"已同步"

## 相关链接

- [v0 项目](https://v0.app/chat/projects/prj_v0fbhZpp9ZHG4f6UAGaaNkxHzWjj) - 继续在 v0 上开发
- [Next.js 文档](https://nextjs.org/docs) - 了解 Next.js
- [v0 文档](https://v0.app/docs) - 了解 v0

<a href="https://v0.app/chat/api/kiro/clone/gaodui409/homedb" alt="Open in Kiro"><img src="https://pdgvvgmkdvyeydso.public.blob.vercel-storage.com/open%20in%20kiro.svg?sanitize=true" /></a>
