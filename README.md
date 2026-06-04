# 餐厅智能点餐系统

基于 Vue 3 + Element Plus + Node.js 后端 的餐厅点餐与结账系统。分为**平板点单**和**前台管理**两个入口，通过同一后端 API 实现多设备数据互通。支持中文、葡萄牙语、英语三语切换。

## 架构

```
┌──────────────────────┐          ┌──────────────────────────────┐
│  平板 APK (Android)   │   WiFi   │     前台电脑 (Windows)         │
│  Vue 3 + Capacitor    │ ◄──────► │                              │
│                       │  HTTP    │  Node.js Server (port 3000)  │
└──────────────────────┘          │  ├─ Express REST API         │
                                  │  ├─ SQLite 数据库存储          │
                                  │  └─ JWT 认证                 │
                                  │                              │
                                  │  Web 管理端 (浏览器)           │
                                  │  http://localhost:3000        │
                                  └──────────────────────────────┘
```

## 技术栈

| 技术 | 用途 |
|------|------|
| Vue 3 + Vite | 前端框架 |
| Element Plus | UI 组件库 |
| Vue Router | 路由 |
| ECharts | 图表 |
| Capacitor | 打包 APK |
| Node.js + Express | 后端 API |
| SQLite (sql.js) | 数据持久化 |
| JWT | 用户认证 |

## 快速开始

### 1. 启动后端服务（在前台电脑上）

```bash
cd server
npm install
npm start
```

输出示例：
```
  Local:   http://localhost:3000
  Network: http://192.168.2.37:3000
```

前台电脑浏览器访问 `http://localhost:3000`，平板端使用 `Network` 地址。

### 2. 开发模式（前端热更新）

```bash
npm install
npm run dev
```

### 3. 构建 APK

```bash
npm run build
npm run cap:sync
npm run cap:open   # 在 Android Studio 中打开并编译
```

## 项目结构

```
Mozambique/
├── server/
│   ├── package.json
│   ├── index.js           # Express 服务 + 所有 API 路由
│   ├── db.js              # SQLite 数据库存储 + 种子数据
│   ├── printer.js         # 小票生成 + Windows 打印
│   └── data.sqlite        # 运行时数据库文件 (自动生成)
├── src/
│   ├── main.js
│   ├── api.js             # 前端 API 客户端
│   ├── router.js
│   ├── App.vue
│   ├── i18n/              # 多语言文件 (zh/pt/en)
│   └── views/
│       ├── OrderPage.vue       # 平板点单
│       ├── Login.vue           # 管理端登录
│       ├── AdminLayout.vue     # 管理端布局
│       ├── PendingOrders.vue   # 待结账订单
│       ├── MenuManage.vue      # 菜品管理
│       ├── OrderHistory.vue    # 订单历史
│       ├── Reports.vue         # 销售报表
│       └── EmployeeManage.vue  # 员工管理
└── README.md
```

## 功能

### 平板端 (/order)
- 服务员登录（工号+密码）
- 选择桌号（1-50）、浏览菜品（按分类筛选）
- 购物车管理、保存草稿、提交订单
- 查看我的草稿和待结账订单
- 三语切换
- 无后台管理入口，服务员无法访问管理后台

### 管理端 (/admin)
- 仅管理员和收银员可登录
- 待结账订单 → 结账（现金/POS机）+ 自动打印小票
- 菜品管理（增删改查 + 排序 + 上架/下架/售罄三态 + 图片上传 + 分类管理含排序 + 中/葡/英三语菜名）
- 订单历史（按日期/服务员/支付方式筛选）
- 销售报表（ECharts 图表）— 仅管理员可见
- 员工管理（增删改查 + 密码设置）— 仅管理员可见

## 角色权限

| 角色 | 权限 |
|------|------|
| 管理员 (admin) | 全部功能：订单管理、菜品管理、报表统计、员工管理 |
| 收银员 (cashier) | 订单管理、菜品管理、订单历史、结账 |
| 服务员 (waiter) | 仅平板端点餐（无后台管理权限） |

## 默认账号

| 工号 | 密码 | 角色 |
|------|------|------|
| admin | 123456 | 管理员 |
| cashier01 | 123456 | 收银员 |
| waiter01 | 123456 | 服务员 |
| waiter02 | 123456 | 服务员 |

## 小票打印机配置

结账时服务器自动打印小票到 Windows 打印机。使用 .NET PrintDocument 精确控制纸张尺寸（58mm × 80mm），内容自动换行，打印完成后自动停止。

### 设置

1. 安装打印机驱动（厂商提供），确保打印机设为**系统默认打印机**
2. 启动服务器：

```bash
# 58mm 热敏纸（默认每行 24 字符）
cd server && npm start

# 80mm 热敏纸
set RECEIPT_WIDTH=42 && set RECEIPT_WIDTH_MM=80 && cd server && npm start

# 指定打印机名称（不设则用系统默认）
set PRINTER_NAME=WHJ717 && cd server && npm start
```

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `PRINTER_NAME` | 打印机名称（不设则用系统默认打印机） | (空) |
| `RECEIPT_WIDTH` | 每行最大字符数 (ASCII)，中文占 2 字符 | 24 |
| `RECEIPT_WIDTH_MM` | 纸张宽度 (mm) | 58 |
| `RECEIPT_HEIGHT_MM` | 小票预估高度 (mm)，影响走纸长度 | 80 |

### 打印原理

通过 .NET `PrintDocument` + 自定义 `PaperSize` 控制纸张尺寸，绕过驱动的 A4 默认设置，解决内容偏移和走纸不停的问题。打印机名称如未指定则自动检测系统默认打印机。

### 查看可用打印机

```bash
curl http://localhost:3000/api/printers -H "Authorization: Bearer <token>"
```

### 重新打印

当打印失败或需要补打小票时，在后台管理端重新打开已完成订单即可补打。

```bash
# 或通过 API 手动补打
curl -X POST http://localhost:3000/api/orders/:id/print -H "Authorization: Bearer <token>"
```

### 注意事项

- 打印失败不会阻塞结账流程，收银员可正常完成结账
- 如果需要补打，可通过 API 或后台管理端操作
- 小票内容跟随系统语言设置（中文/葡萄牙语/English），包括标题、字段标签、菜品名称和支付方式

## 数据存储

- 后端数据存储在 `server/data.sqlite`（SQLite 数据库文件）
- 首次启动自动创建种子数据（10道菜品 + 4个员工）
- 每次保存自动备份到 `server/data.sqlite.bak`

## API 端点

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | /api/auth/login | 公开 | 登录（工号+密码） |
| GET | /api/auth/me | 登录用户 | 获取当前用户信息 |
| GET | /api/dishes | 登录用户 | 菜品列表（支持 category/status/search 筛选） |
| POST | /api/dishes | admin,cashier | 新增菜品 |
| PUT | /api/dishes/:id | admin,cashier | 修改菜品（含排序、状态） |
| DELETE | /api/dishes/:id | admin,cashier | 删除菜品 |
| POST | /api/upload | 登录用户 | 上传菜品图片（base64） |
| GET | /api/categories | 登录用户 | 分类列表 |
| POST | /api/categories | admin,cashier | 新增分类 |
| PUT | /api/categories/:id | admin,cashier | 修改分类（重命名同步更新菜品） |
| DELETE | /api/categories/:id | admin | 删除分类 |
| GET | /api/waiters | 登录用户 | 服务员列表（平板端选人用） |
| GET | /api/orders | 登录用户 | 订单列表（支持 status/waiter_id/table 筛选） |
| POST | /api/orders | 登录用户 | 创建订单（草稿/直接提交） |
| PUT | /api/orders/:id | 登录用户 | 修改订单（更新菜品、金额） |
| POST | /api/orders/:id/submit | 登录用户 | 提交草稿→待结账 |
| POST | /api/orders/:id/checkout | admin,cashier | 结账（现金/POS）+ 自动打印小票 |
| POST | /api/orders/:id/print | admin,cashier | 补打小票 |
| GET | /api/printers | admin,cashier | 列出系统打印机 |
| GET | /api/orders/export | admin,cashier | 导出订单（支持日期/服务员/桌号筛选） |
| GET | /api/employees | admin,cashier | 员工列表 |
| POST | /api/employees | admin | 新增员工 |
| PUT | /api/employees/:id | admin | 修改员工（含密码重置） |
| GET | /api/reports/today | admin,cashier | 今日概览（订单数/营业额） |
| GET | /api/reports/monthly | admin,cashier | 本月概览 |
| GET | /api/reports/monthly-trend | admin,cashier | 近30天每日趋势 |
| GET | /api/reports/category-pie | admin,cashier | 分类点单次数分布 |
| GET | /api/reports/payment-pie | admin,cashier | 支付方式分布 |
| GET | /api/reports/dishes-top | admin,cashier | 菜品销量 Top 10 |
| GET | /api/reports/waiter-rank | admin,cashier | 服务员业绩排行 |
