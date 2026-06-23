# 餐厅智能点餐系统

基于 Vue 3 + Element Plus + Node.js 后端的餐厅点餐与结账系统。分为**平板点单**和**前台管理**两个入口，通过同一后端 API 实现多设备数据互通。支持中文、葡萄牙语、英语三语切换。面向莫桑比克市场，货币为 MT（梅蒂卡尔）。

## 架构

```
┌──────────────────────┐          ┌──────────────────────────────┐
│  平板 APK (Android)   │   WiFi   │     前台电脑 (Windows)         │
│  Vue 3 + Capacitor    │ ◄──────► │                              │
│                       │  HTTP +  │  Node.js Server (port 3000)  │
│                       │  WS      │  ├─ Express REST API         │
└──────────────────────┘          │  ├─ WebSocket 实时推送        │
                                  │  ├─ SQLite 数据库存储          │
                                  │  ├─ JWT 认证 + 会话互斥       │
                                  │  └─ 双打印机（厨房+小票）      │
                                  │                              │
                                  │  Web 管理端 (浏览器)           │
                                  │  http://localhost:3000        │
                                  └──────────────────────────────┘
```

## 技术栈

| 技术 | 用途 |
|------|------|
| Vue 3 + Vite 5 | 前端框架 |
| Element Plus 2.7 | UI 组件库 |
| Vue Router 4 | Hash 路由（APK 兼容） |
| ECharts 5 + vue-echarts | 报表图表 |
| Capacitor 8 | 打包 Android APK |
| WebSocket (ws) | 实时订单推送 |
| Node.js + Express 4 | 后端 API |
| SQLite (sql.js) | 数据持久化（WASM，无需原生依赖） |
| JWT (jsonwebtoken) | 用户认证（7 天有效期） |
| bcryptjs | 密码哈希 |

## 快速开始

### 1. 启动后端服务（在前台电脑上）

```bash
cd server
npm install
npm start
```

输出示例：
```
  ========================================
    Restaurant POS Server v1.0
  ========================================

  Local:   http://localhost:3000
  Network: http://192.168.2.43:3000
  API:     http://192.168.2.43:3000/api
  WS:      ws://192.168.2.43:3000/ws

  Press Ctrl+C to stop
```

前台电脑浏览器访问 `http://localhost:3000`，平板端使用 `Network` 地址。

> **注意**：服务器必须在独立终端中启动，不要通过脚本后台运行（子进程退出可能导致端口残留）。

### 2. 开发模式（前端热更新）

```bash
npm install
npm run dev
```

前端运行在 `:5173`，Vite 代理 `/api` 请求到后端 `:3000`。

### 3. 生产模式

```bash
npm run build            # 构建前端到 dist/
cd server && npm start   # Express 同时 serve dist + API（单端口 :3000）
```

### 4. 构建 APK

```bash
npm run build
npx cap sync
cd android && ./gradlew assembleDebug
# 或直接 push main 分支触发 GitHub Actions 自动构建
```

## 项目结构

```
Mozambique/
├── server/
│   ├── package.json         # 后端依赖（commonjs）
│   ├── index.js             # Express 服务 + 所有 API 路由 + WebSocket（~1109行）
│   ├── db.js                # SQLite 数据库层 + 迁移 + CRUD + 种子数据（~540行）
│   ├── printer.js           # 双打印模块：厨打58mm + 小票80mm（~445行）
│   ├── data.sqlite          # 运行时 SQLite 数据库文件（自动生成）
│   ├── data.sqlite.bak      # 每次写操作前自动备份
│   ├── backups/             # 带时间戳的备份（最多保留 7 个）
│   └── uploads/             # 菜品图片（UUID 命名）
├── src/
│   ├── main.js              # 入口：Vue + Element Plus + Router
│   ├── App.vue              # 根组件
│   ├── router.js            # Hash 路由 + 导航守卫（认证+角色）
│   ├── api.js               # API 客户端（动态 baseURL、超时、401 处理）
│   ├── style.css            # 全局样式
│   ├── i18n/                # 轻量 i18n（非 vue-i18n）
│   │   ├── index.js         # t() 函数、getDishName/getCategoryName 等
│   │   ├── state.js         # 语言状态管理
│   │   └── zh.js / pt.js / en.js  # 各 ~354 个翻译键
│   └── views/
│       ├── OrderPage.vue    # 平板点餐页（~2053行，最大组件）
│       ├── Login.vue        # 登录页（~232行）
│       ├── AdminLayout.vue  # 管理端布局 + 侧边栏（~495行）
│       ├── PendingOrders.vue # 待结账订单管理 + 结账 + 加菜/退菜（~889行）
│       ├── MenuManage.vue   # 菜品/分类/口味 CRUD + 多图上传（~1264行）
│       ├── OrderHistory.vue # 已完成订单历史 + 导出（~180行）
│       ├── Reports.vue      # ECharts 报表仪表盘（~129行）
│       ├── EmployeeManage.vue # 员工管理（~312行）
│       └── Dashboard.vue    # 旧版点餐页（已废弃，保留未删）
├── android/                 # Capacitor 生成的 Android 项目
├── dist/                    # Vite 构建输出
├── .github/workflows/
│   └── build-apk.yml        # CI：push main 自动构建 APK
├── capacitor.config.json    # appId: com.restaurant.pos, androidScheme: http
├── vite.config.js           # base: './', proxy /api → :3000
├── package.json             # 前端依赖（ESM）
├── PRD.md                   # 产品需求文档
├── CLAUDE.md                # Claude Code 项目上下文
└── README.md
```

## 功能

### 平板端 (/order)

- 服务员登录（工号 + 密码）
- 选择桌号（1-50）、浏览菜品（按分类 Tab 筛选，支持多分类菜品）
- 口味选项系统（辣度/甜度/温度/份量等，管理员可配置模板，每道菜可关联口味）
- 购物车管理、保存草稿、提交订单（自动打印厨房票）
- 加菜功能（追加菜品到已有订单，自动打印加菜厨打）
- 查看我的草稿和待结账订单
- 离线模式（断网时可缓存操作，恢复网络后同步）
- 三语切换（中文/葡萄牙语/English）
- 无后台管理入口，服务员无法访问管理后台

### 管理端 (/admin)

- 仅管理员和收银员可登录
- **待结账订单**：结账（现金/POS机）+ 自动打印小票（含找零信息）、加菜、退菜（部分退/全退）、补打厨打
- **菜品管理**：增删改查 + 排序 + 上架/下架/售罄三态 + 多图上传（最多 4 张，首张为封面）+ 三语菜名/备注 + 口味关联
- **分类管理**：增删改查 + 排序 + 三语名称（重命名自动同步菜品）
- **口味管理**：增删改查 + 选项配置（三语）— 仅管理员
- **订单历史**：按日期/服务员/支付方式筛选 + 导出
- **销售报表**（ECharts）：今日概览、本月概览、30天趋势、分类分布、支付方式分布、菜品 Top10、服务员排行 — 仅管理员和收银员
- **员工管理**：增删改查 + 密码设置 — 仅管理员
- **数据库管理**：备份/恢复/查看备份列表 — 仅管理员
- **实时推送**：WebSocket 连接，订单创建/更新/结账/取消实时同步到所有客户端

### 厨房打印

- 新订单提交 → 自动打印厨打（58mm 热敏纸，20 字符/行）
- 加菜 → 打印加菜厨打（标注"加菜/ADICIONAL"）
- 退菜 → 打印退菜厨打（标注"退菜/CANCELADO" + 退菜原因）
- 补打 → 手动补打厨打（标注"补打/REIMPR"）
- 厨打内容：中/葡双语，菜品名称 + 数量 + 口味选项（双语），不含备注
- 打印状态跟踪：new → printed / cancelled

### 小票打印

- 结账自动打印（80mm 热敏纸，32 字符/行）
- 小票内容：中/葡双语，含单号、桌号、服务员、时间、菜品明细、合计、支付方式、收款/找零
- 已取消菜品不出现在小票上
- 补打小票：通过后台管理端或 API 操作
- 打印失败不阻塞结账流程

## 角色权限

| 角色 | 权限 |
|------|------|
| 管理员 (admin) | 全部功能：订单管理、菜品管理、报表统计、员工管理、数据库备份/恢复、口味管理 |
| 收银员 (cashier) | 订单管理（含加菜/退菜/补打厨打）、菜品管理、订单历史、结账、报表 |
| 服务员 (waiter) | 仅平板端点餐、加菜（无后台管理权限） |

## 默认账号

| 工号 | 密码 | 角色 |
|------|------|------|
| admin | 123456 | 管理员 |
| cashier01 | 123456 | 收银员 |
| waiter01 | 123456 | 服务员 |
| waiter02 | 123456 | 服务员 |

## 打印机配置

系统支持**双打印机**：厨房打印机（58mm）和结账小票打印机（80mm），可分别指定不同打印机。

### 环境变量

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `PRINTER_NAME` | 小票打印机名称（不设则用系统默认） | (空) |
| `KITCHEN_PRINTER_NAME` | 厨房打印机名称（不设则同 PRINTER_NAME） | (空) |
| `RECEIPT_WIDTH` | 小票每行最大字符数 (ASCII) | 32 |
| `RECEIPT_WIDTH_MM` | 小票纸张宽度 (mm) | 80 |
| `RECEIPT_HEIGHT_MM` | 小票纸张高度 (mm) | 80 |
| `KITCHEN_WIDTH` | 厨打每行最大字符数 (ASCII) | 20 |
| `KITCHEN_WIDTH_MM` | 厨打纸张宽度 (mm) | 58 |
| `KITCHEN_HEIGHT_MM` | 厨打纸张高度 (mm) | 80 |
| `LAN_IP` | 手动指定局域网 IP（跳过自动检测） | (自动检测) |
| `PORT` | 服务端口 | 3000 |

### 启动示例

```bash
# 默认配置（小票 80mm，厨打 58mm，系统默认打印机）
cd server && npm start

# 指定打印机
set PRINTER_NAME=WHJ717 && set KITCHEN_PRINTER_NAME=KP-58 && cd server && npm start

# 手动指定局域网 IP
set LAN_IP=192.168.1.100 && cd server && npm start
```

### 打印原理

通过 .NET `PrintDocument` + 自定义 `PaperSize` 控制纸张尺寸，绕过驱动的 A4 默认设置。CJK 字符（中文）使用 Microsoft YaHei 字体，Latin 字符使用 Consolas 字体，逐字符渲染实现字体回退。UTF-8 BOM 临时文件传递文本，避免 PowerShell 中文编码问题。

### 查看可用打印机

```bash
curl http://localhost:3000/api/printers -H "Authorization: Bearer <token>"
```

## 数据存储

- 后端数据存储在 `server/data.sqlite`（SQLite 数据库文件）
- 首次启动自动创建种子数据（员工 + 菜品 + 分类 + 口味模板）
- 每次写操作自动持久化到磁盘 + 备份到 `data.sqlite.bak`
- 带时间戳备份（`backups/` 目录，最多保留 7 个，自动轮转）
- 管理端支持手动备份和恢复
- 优雅关闭：Ctrl+C 触发 SIGINT，自动保存数据库后退出

## WebSocket

服务器在 `/ws` 路径提供 WebSocket 连接，用于实时推送订单变更到所有已认证客户端。

事件类型：`order_created`、`order_updated`、`order_submitted`、`order_checkout`、`order_cancelled`、`order_deleted`、`order_reopened`、`order_item_cancelled`

连接后需发送 `{ "type": "auth", "token": "<JWT>" }` 进行认证，心跳间隔 30 秒。

## API 端点

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/health | 公开 | 健康检查 |
| POST | /api/auth/login | 公开 | 登录（工号+密码，5分钟内10次限制） |
| GET | /api/auth/me | 登录用户 | 获取当前用户信息 |
| GET | /api/dishes | 登录用户 | 菜品列表（category/status/search 筛选） |
| POST | /api/dishes | admin,cashier | 新增菜品（含多图、三语、备注） |
| PUT | /api/dishes/:id | admin,cashier | 修改菜品 |
| DELETE | /api/dishes/:id | admin,cashier | 删除菜品 |
| POST | /api/upload | 登录用户 | 上传菜品图片（base64，5MB限制，png/jpg/gif/webp） |
| GET | /api/categories | 登录用户 | 分类列表 |
| POST | /api/categories | admin,cashier | 新增分类 |
| PUT | /api/categories/:id | admin,cashier | 修改分类（重命名同步更新菜品） |
| DELETE | /api/categories/:id | admin | 删除分类 |
| GET | /api/flavors | 登录用户 | 口味模板列表 |
| POST | /api/flavors | admin | 新增口味模板 |
| PUT | /api/flavors/:id | admin | 修改口味模板 |
| DELETE | /api/flavors/:id | admin | 删除口味模板（级联清理关联） |
| GET | /api/dishes/:id/flavors | 登录用户 | 获取菜品关联的口味 |
| PUT | /api/dishes/:id/flavors | admin,cashier | 设置菜品口味关联 |
| GET | /api/waiters | 登录用户 | 服务员列表（平板端选人用） |
| GET | /api/orders | 登录用户 | 订单列表（status/waiter_id/table/page/pageSize） |
| POST | /api/orders | 登录用户 | 创建订单（草稿/直接提交 + 自动厨打） |
| PUT | /api/orders/:id | 登录用户 | 修改订单（仅 pending/draft 状态） |
| POST | /api/orders/:id/submit | 登录用户 | 提交草稿→待结账 + 厨打 |
| POST | /api/orders/:id/cancel | admin,cashier | 取消整个订单 |
| POST | /api/orders/:id/add-items | 登录用户 | 加菜（追加菜品 + 加菜厨打） |
| POST | /api/orders/:id/cancel-item | 全部角色 | 退菜单品（部分/全部 + 退菜厨打） |
| POST | /api/orders/:id/kitchen-reprint | admin,cashier | 补打厨打 |
| DELETE | /api/orders/:id | admin | 删除订单 |
| POST | /api/orders/:id/checkout | admin,cashier | 结账 + 自动打印小票 |
| POST | /api/orders/:id/reopen | admin,cashier | 重新打开已结账订单 |
| POST | /api/orders/:id/print | admin,cashier | 补打小票 |
| GET | /api/printers | admin,cashier | 列出系统打印机（含当前和厨房打印机） |
| GET | /api/orders/export | admin,cashier | 导出订单（日期/服务员/桌号筛选） |
| GET | /api/employees | admin,cashier | 员工列表 |
| POST | /api/employees | admin | 新增员工 |
| PUT | /api/employees/:id | admin | 修改员工（含密码重置，改密码踢旧会话） |
| GET | /api/reports/today | admin,cashier | 今日概览（订单数/营业额） |
| GET | /api/reports/monthly | admin,cashier | 本月概览 |
| GET | /api/reports/monthly-trend | admin,cashier | 近30天每日趋势 |
| GET | /api/reports/category-pie | admin,cashier | 分类点单次数分布 |
| GET | /api/reports/payment-pie | admin,cashier | 支付方式分布 |
| GET | /api/reports/dishes-top | admin,cashier | 菜品销量 Top 10 |
| GET | /api/reports/waiter-rank | admin,cashier | 服务员业绩排行 |
| GET | /api/db/info | admin | 数据库/备份文件信息 |
| POST | /api/db/backup | admin | 手动备份数据库 |
| POST | /api/db/restore | admin | 恢复数据库（从备份文件） |

## 数据库表结构

| 表名 | 说明 |
|------|------|
| employees | 员工（username/password/name/role/status/token_version） |
| dishes | 菜品（三语名称/多分类/价格/多图/备注/排序/状态） |
| categories | 分类（三语名称/排序） |
| orders | 订单（桌号/服务员/金额/状态/支付方式/收款/找零） |
| order_items | 订单明细（菜品快照/数量/厨打状态/单品状态/口味选项） |
| flavors | 口味模板（三语名称/选项JSON/排序） |
| dish_flavors | 菜品-口味关联（dish_id/flavor_id/required/排序） |
