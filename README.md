# 餐厅智能点餐系统

基于 Vue 3 + Element Plus + IndexedDB 的纯前端餐厅点餐与结账系统，分为点单模块与管理后台两个独立入口。支持中文、葡萄牙语、英语三语切换。

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue 3 | ^3.4 | 前端框架 (Composition API) |
| Vite | ^5.4 | 构建工具 |
| Element Plus | ^2.7 | UI 组件库 |
| @element-plus/icons-vue | ^2.3 | 图标库 |
| Vue Router | ^4.3 | 路由管理 |
| ECharts | ^5.5 | 图表库 |
| vue-echarts | ^7.0 | Vue 3 ECharts 封装 |
| IndexedDB | 原生 | 浏览器端数据持久化 |

## 项目结构

```
Mozambique/
├── package.json
├── vite.config.js
├── index.html
├── PRD.md                     # 产品需求文档
├── README.md
└── src/
    ├── main.js                # 应用入口 + Element Plus 多语言
    ├── style.css              # 全局样式
    ├── db.js                  # IndexedDB 封装 + 种子数据 (dishes/orders/employees)
    ├── router.js              # 路由定义与守卫
    ├── App.vue                # 根组件
    ├── i18n/
    │   ├── index.js           # i18n 核心（响应式多语言）
    │   ├── zh.js              # 中文翻译
    │   ├── pt.js              # 葡萄牙语翻译
    │   └── en.js              # 英语翻译
    └── views/
        ├── OrderPage.vue      # 点单模块（服务员平板端）
        ├── Login.vue          # 管理员登录
        ├── AdminLayout.vue    # 管理后台布局（侧边栏导航 + 语言切换）
        ├── PendingOrders.vue  # 待结账订单（结账操作 + 服务员筛选）
        ├── MenuManage.vue     # 菜品管理（含库存/上下架）
        ├── OrderHistory.vue   # 订单历史（已结账 + 多条件筛选）
        ├── Reports.vue        # 销售报表（30天趋势 + 图表）
        └── EmployeeManage.vue # 员工管理（新增）
```

## 系统架构

### 点单模块（/order）
- **使用场景**：服务员平板点餐，触屏优化
- **无需登录**（选择服务员身份即可）
- 服务员选择（下拉搜索）、可随时切换
- 左侧菜品分类 + 网格（售罄/下架菜品置灰）
- 右侧购物车 + 桌号选择（1-50 号桌）
- 支持**保存草稿** + **确认提交**
- "我的订单"面板：草稿箱 + 待结账列表
- 草稿可一键恢复继续编辑

### 管理/结账模块（/admin）
- **需要登录**（admin / 123456）
- **待结账订单**：全量或按服务员筛选，支持现金/POS 结账
- **菜品管理**：名称、分类、价格(MZN)、库存、上下架状态
- **订单历史**：按日期/服务员/支付方式筛选，汇总统计
- **报表统计**：30天趋势、分类占比、支付占比、菜品TOP10
- **员工管理**：增删改查，角色（服务员/收银员/管理员）

## 多语言支持

| 语言 | 代码 | 覆盖范围 |
|------|------|----------|
| 中文 | zh | 全部界面文字 |
| Português | pt | 全部界面文字 |
| English | en | 全部界面文字 |

在各页面顶部可通过下拉菜单实时切换语言。语言偏好存储在 localStorage。

## 数据模型

### dishes 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number (自增) | 主键 |
| name | string | 菜品名称 |
| category | string | 所属分类 |
| price | number | 单价（MZN） |
| image | string | 图片路径 |
| stock | number | 库存数量 |
| status | string | active/inactive |

### orders 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number (自增) | 主键 |
| tableNumber | number | 桌号（1-50） |
| waiterId | number | 服务员ID |
| waiterName | string | 服务员姓名快照 |
| items | array | 订单明细 |
| totalAmount | number | 总金额（MZN） |
| status | string | draft/pending/completed |
| paymentMethod | string \| null | 现金/POS机 |
| cashReceived | number \| null | 收款金额 |
| change | number \| null | 找零 |
| createdAt | string (ISO) | 下单时间 |
| paidAt | string (ISO) \| null | 结账时间 |

### employees 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number (自增) | 主键 |
| username | string | 工号 |
| password | string | 密码 |
| name | string | 姓名 |
| role | string | waiter/cashier/admin |
| status | string | active/disabled |

### 种子数据

首次使用时自动写入：
- **10 道菜品**（价格单位：MZN 莫桑比克梅蒂卡尔）
- **4 个员工账号**：admin / cashier01 / waiter01 / waiter02（默认密码 123456）

## 启动方式

```bash
npm install
npm run dev      # 开发服务器 → http://localhost:5173
npm run build    # 生产构建 → dist/
npm run preview  # 预览生产版本
npm run cap:sync # 同步到 Android 项目
npm run cap:open # Android Studio 打开
```

## 构建 APK

```bash
npm run cap:sync
npm run cap:open
```

## 版本历史

| 版本 | 说明 |
|------|------|
| v1.0 | 桌面版：侧边栏导航 + 表格布局 |
| v2.0 | 平板适配版：底部 TabBar + 响应式卡片布局 |
| v3.0 | 点单/结账分离 + 三语切换 + 服务员体系 + MZN货币 |
