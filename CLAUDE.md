# CLAUDE.md — 项目上下文

> Claude Code 在每次新会话启动时自动读取此文件。保持更新以便快速上手。

---

## 项目身份

**餐厅智能点餐系统 (Restaurant POS)** — 面向莫桑比克餐厅的双端收银系统。

- **平板点单端**：Vue 3 + Capacitor → Android APK，服务员在餐桌旁点餐
- **前台管理端**：同一 Vue 3 代码库，浏览器访问，收银/管理员使用
- **后端**：Node.js + Express + SQLite（sql.js），运行在前台 Windows 电脑上
- **目标市场**：莫桑比克（货币 MT，三语：中文/葡萄牙语/English）
- **GitHub**：`https://github.com/IridiumZero/restaurant-pos`

---

## 目录结构

```
Mozambique/
├── server/                  # 后端
│   ├── index.js             # Express 服务器 + 全部 API 路由（~490行）
│   ├── db.js                # SQLite 数据库层（sql.js），含表结构、迁移、CRUD、种子数据
│   ├── data.sqlite          # 运行时 SQLite 数据库文件
│   ├── data.sqlite.bak      # 每次 save 前自动备份
│   ├── backups/             # 带时间戳的备份（最多保留 7 个）
│   ├── printer.js           # 小票生成（多语言）+ Windows 打印（.NET PrintDocument）
│   └── uploads/             # 菜品图片
├── src/                     # 前端 Vue 3
│   ├── main.js              # 入口：挂载 Vue + Element Plus + i18n + Router
│   ├── App.vue              # 根组件（仅 <router-view>）
│   ├── router.js            # Hash 路由（APK 兼容），含导航守卫（认证+角色）
│   ├── api.js               # API 客户端（动态 baseURL、自动 401 处理）
│   ├── style.css            # 全局样式
│   ├── i18n/                # 轻量 i18n（非 vue-i18n）
│   │   ├── index.js         # t() 函数、getDishName/CategoryName/Remark、货币格式化
│   │   ├── zh.js / pt.js / en.js  # 各 ~267 个翻译键
│   └── views/               # 页面组件
│       ├── OrderPage.vue    # 平板点餐页（最大组件 ~23KB）
│       ├── Login.vue        # 登录页
│       ├── AdminLayout.vue  # 管理端布局 + 侧边栏
│       ├── PendingOrders.vue # 待结账订单管理
│       ├── MenuManage.vue   # 菜品/分类 CRUD + 图片上传
│       ├── OrderHistory.vue # 已完成订单历史 + 导出
│       ├── Reports.vue      # ECharts 报表仪表盘
│       ├── EmployeeManage.vue # 员工管理
│       └── Dashboard.vue    # 旧版点餐页（已废弃，保留未删）
├── android/                 # Capacitor 生成的 Android 项目
├── dist/                    # Vite 构建输出（Express 生产模式 serve 此目录）
├── .github/workflows/
│   └── build-apk.yml        # CI：push main 自动构建 APK
├── capacitor.config.json    # appId: com.restaurant.pos, androidScheme: http
├── vite.config.js           # base: './', proxy /api→:3000
├── PRD.md                   # 产品需求文档（463行，v1.0, 2026-05-19）
└── README.md                # 项目 README
```

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + Vite 5 + Element Plus 2.7 + Vue Router 4 + ECharts 5 |
| 移动端 | Capacitor 8（打包 Android APK） |
| 后端 | Node.js + Express 4 + cors + jsonwebtoken |
| 数据库 | SQLite（sql.js，WASM 编译，纯 Node.js 运行，无需原生依赖） |
| CI | GitHub Actions（ubuntu-latest, Java 21, Android SDK 35） |

---

## 如何运行

```bash
# 开发模式
cd server && npm run dev          # 后端 :3000（--watch 热重载）
cd .. && npm run dev              # 前端 :5173（Vite 代理 /api → :3000）

# 生产模式
npm run build                     # 构建前端到 dist/
cd server && npm start            # Express serve dist + API（单端口 :3000）

# 指定小票打印机（Windows）
set PRINTER_NAME=你的打印机名称 && cd server && npm start

# APK 构建
npm run build && npx cap sync && cd android && ./gradlew assembleDebug
# 或直接 push main 触发 GitHub Actions
```

---

## API 端点一览

| 前缀 | 端点 | 认证 |
|---|---|---|
| `POST /api/auth/login` | 登录，返回 JWT（7天有效） | 无 |
| `GET /api/auth/me` | 当前用户信息 | JWT |
| `GET/POST/PUT/DELETE /api/dishes` | 菜品 CRUD | 修改需 admin/cashier |
| `GET/POST/PUT/DELETE /api/categories` | 分类 CRUD | 删除需 admin |
| `GET/POST/PUT /api/orders` | 订单 CRUD + 提交/结账/取消/重开/打印 | JWT |
| `GET/POST/PUT /api/employees` | 员工 CRUD | admin |
| `GET /api/reports/*` | 销售报表（7个端点） | JWT |
| `POST /api/upload` | 图片上传（base64） | JWT |
| `GET /api/orders/export` | 订单导出 | JWT |
| `GET /api/printers` | 列出系统打印机 | JWT |
| `GET/POST /api/db/*` | 数据库信息/备份/恢复 | admin |

---

## 数据库核心表

- **employees** — 员工（username/password/name/role/status/token_version）
- **dishes** — 菜品（三语名称/多分类/价格/图片/状态/sort_order）
- **categories** — 分类（三语名称/sort_order）
- **orders** — 订单（桌号/服务员/金额/状态/支付方式/找零）
- **order_items** — 订单明细（菜品快照：名称+价格+数量+小计）

默认账户：`admin` / `cashier01` / `waiter01` / `waiter02`，密码均为 `123456`

---

## 当前开发状态（截至 2026-06-04）

**最近 5 个提交聚焦：**
1. APK 图片路径修复（prepend server URL）
2. 会话互斥（同账号新登录踢旧会话）、订单取消、桌台冲突检测（409）、备份轮转、401 处理
3. Capacitor androidScheme 改为 http（解决混合内容拦截）
4. 忽略 Capacitor WebView 保存的 localhost URL
5. APK 服务器检测跳过 HTML 响应

**之前里程碑：**
- JSON → SQLite 迁移（`c485b5f`）
- 三语国际化 + 双入口架构（`def9bad`）

**活跃开发领域：** APK 兼容性稳定、SQLite 后端加固、会话管理、小票打印（多语言）

---

## 关键设计决策 & 注意事项

1. **Hash 路由**：使用 `createWebHashHistory`，因为 APK WebView 不支持 HTML5 History 模式
2. **相对路径 base**：Vite `base: './'` 确保 APK 加载本地资源
3. **HTTP 明文**：APK 使用 `androidScheme: http` + `cleartext: true`，因为内网 WiFi 环境
4. **图片路径**：前端发送时存相对路径，APK 端显示时 prepend serverUrl（`64f40c8`）
5. **密码哈希**：使用 SHA-256（非 bcrypt），因为 sql.js 无原生加密模块
6. **备份机制**：每次写操作触发 persist → temp file → 备份旧文件 → 原子重命名
7. **多分类**：dishes.category 用逗号分隔存储（非关联表）
8. **订单快照**：order_items 存储 dish_name/dish_price 快照，防止菜品修改影响历史订单
9. **服务器 URL 动态检测**：APK 端尝试从 localStorage 或 `location.origin` 获取，自动跳过 Capacitor WebView 的 `https://localhost` URL
10. **无显式索引**：PRD 指定了索引但当前 schema 未创建（仅主键）
11. **Dashboard.vue**：旧版点餐页面，已废弃但保留在代码库中
12. **小票打印**：通过 .NET `PrintDocument` + 自定义 `PaperSize`（58mm 热敏纸，7pt Consolas 字体，20 字符/行），绕过驱动 A4 默认设置。文本通过 UTF-8 临时文件传递以避免 PowerShell 中文编码问题。使用 `PRINTER_NAME` 环境变量指定打印机，打印失败不阻断结账流程
13. **小票多语言**：小票模板含中/葡/英三语（标题、字段标签、支付方式、致谢语），结账时前端传 `lang` 参数，菜品名称从 `dishes` 表查翻译名。`order_items` 仅存中文快照，翻译名在打印时动态查询
14. **Vite ESM**：根 `package.json` 设 `"type": "module"` 消除 Vite CJS 弃用警告，`server/package.json` 设 `"type": "commonjs"` 保持服务端 `require()` 兼容
15. **同步更新 README.md**：每次修改项目代码时需要同步更新 README.md

---

## 常用命令

```bash
# 启动开发服务器
cd server && node --watch index.js    # 后端热重载
npx vite --host 0.0.0.0              # 前端（允许局域网访问）

# 构建 & APK
npm run build
npx cap sync
cd android && ./gradlew assembleDebug

# 查看 APK 在模拟器
adb install android/app/build/outputs/apk/debug/app-debug.apk

# 数据库操作
# data.sqlite 是二进制文件，通过 API 或 db.js 操作
# 备份自动管理：backups/ 保留最近 7 个
```
