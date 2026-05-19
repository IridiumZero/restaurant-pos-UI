# 餐厅智能点餐系统

基于 Vue 3 + Element Plus + Node.js 后端 的餐厅点餐与结账系统。分为**平板点单**和**前台管理**两个入口，通过同一后端 API 实现多设备数据互通。支持中文、葡萄牙语、英语三语切换。

## 架构

```
┌──────────────────────┐          ┌──────────────────────────────┐
│  平板 APK (Android)   │   WiFi   │     前台电脑 (Windows)         │
│  Vue 3 + Capacitor    │ ◄──────► │                              │
│                       │  HTTP    │  Node.js Server (port 3000)  │
└──────────────────────┘          │  ├─ Express REST API         │
                                  │  ├─ JSON 文件存储             │
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
| JSON 文件存储 | 数据持久化 |
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
│   ├── db.js              # JSON 文件存储 + 种子数据
│   └── data.json          # 运行时数据文件 (自动生成)
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

### 管理端 (/admin)
- 待结账订单 → 结账（现金/POS机）+ 模拟打印小票
- 菜品管理（增删改查 + 库存 + 上下架）
- 订单历史（按日期/服务员/支付方式筛选）
- 销售报表（ECharts 图表）
- 员工管理（增删改查 + 重置密码）

## 默认账号

| 工号 | 密码 | 角色 |
|------|------|------|
| admin | 123456 | 管理员 |
| cashier01 | 123456 | 收银员 |
| waiter01 | 123456 | 服务员 |
| waiter02 | 123456 | 服务员 |

## 数据存储

- 后端数据存储在 `server/data.json`（JSON 文件）
- 首次启动自动创建种子数据（10道菜品 + 4个员工）
- 建议定期备份 `data.json` 文件

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 登录 |
| GET | /api/dishes | 菜品列表 |
| POST | /api/dishes | 新增菜品 |
| PUT | /api/dishes/:id | 修改菜品 |
| DELETE | /api/dishes/:id | 删除菜品 |
| GET | /api/orders | 订单列表 |
| POST | /api/orders | 创建订单 |
| PUT | /api/orders/:id | 修改订单 |
| POST | /api/orders/:id/checkout | 结账 |
| GET | /api/employees | 员工列表 |
| POST | /api/employees | 新增员工 |
| GET | /api/reports/* | 报表数据 |
