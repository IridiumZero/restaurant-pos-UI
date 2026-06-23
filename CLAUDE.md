# CLAUDE.md — 项目上下文

> Claude Code 在每次新会话启动时自动读取此文件。保持更新以便快速上手。

---

## 项目身份

**餐厅智能点餐系统 (Restaurant POS)** — 面向莫桑比克餐厅的双端收银系统。

- **平板点单端**：Vue 3 + Capacitor → Android APK，服务员在餐桌旁点餐
- **前台管理端**：同一 Vue 3 代码库，浏览器访问，收银/管理员使用
- **后端**：Node.js + Express + SQLite（sql.js），运行在前台 Windows 电脑上
- **目标市场**：莫桑比克（货币 MT，三语：中文/葡萄牙语/English）
- **GitHub**：`https://github.com/Iridium0/restaurant-pos`

---

## 目录结构

```
Mozambique/
├── server/                  # 后端
│   ├── index.js             # Express 服务 + 所有 API 路由 + WebSocket + 审计日志（~1310行）
│   ├── db.js                # SQLite 数据库层（sql.js），含表结构、迁移、索引、CRUD、种子数据（~650行）
│   ├── printer.js           # 双打印模块：厨打58mm + 小票80mm + PowerShell C# PrintDocument（~445行）
│   ├── data.sqlite          # 运行时 SQLite 数据库文件
│   ├── data.sqlite.bak      # 每次 save 前自动备份
│   ├── backups/             # 带时间戳的备份（最多保留 7 个）
│   └── uploads/             # 菜品图片（UUID 命名）
├── src/                     # 前端 Vue 3
│   ├── main.js              # 入口：挂载 Vue + Element Plus + i18n + Router
│   ├── App.vue              # 根组件（仅 <router-view>）
│   ├── router.js            # Hash 路由（APK 兼容），含导航守卫（认证+角色）
│   ├── api.js               # API 客户端（动态 baseURL、自动 401 处理、30s 超时）
│   ├── style.css            # 全局样式
│   ├── i18n/                # 轻量 i18n（非 vue-i18n）
│   │   ├── index.js         # t() 函数、getDishName/CategoryName/Remark、货币格式化
│   │   ├── state.js         # 语言状态管理（locale）
│   │   └── zh.js / pt.js / en.js  # 各 ~354 个翻译键
│   ├── components/           # 可复用组件（从大页面中拆分）
│   │   ├── DishDetailDialog.vue    # 平板端：菜品详情 + 口味选择 + 加入购物车
│   │   ├── DishEditDialog.vue      # 管理端：菜品编辑表单 + 多图上传 + 口味配置
│   │   ├── CategoryManageDialog.vue # 管理端：分类 CRUD + 排序
│   │   └── OrderDetailDialog.vue   # 详情弹窗：菜品列表 + 退菜 + 加菜 + 补打
│   └── views/               # 页面组件
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
├── dist/                    # Vite 构建输出（Express 生产模式 serve 此目录）
├── .github/workflows/
│   └── build-apk.yml        # CI：push main 自动构建 APK
├── capacitor.config.json    # appId: com.restaurant.pos, androidScheme: http
├── vite.config.js           # base: './', proxy /api → :3000
└── PRD.md                   # 产品需求文档
```

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + Vite 5 + Element Plus 2.7 + Vue Router 4 + ECharts 5 |
| 移动端 | Capacitor 8（打包 Android APK） |
| 后端 | Node.js + Express 4 + cors + jsonwebtoken + ws |
| 数据库 | SQLite（sql.js，WASM 编译，纯 Node.js 运行，无需原生依赖） |
| 认证 | JWT（7天有效期）+ bcryptjs 密码哈希 + 会话互斥（token_version） |
| 实时通信 | WebSocket（ws 库，心跳检测 30s 间隔） |
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
set PRINTER_NAME=WHJ717 && cd server && npm start

# 指定厨房打印机
set KITCHEN_PRINTER_NAME=KP-58 && cd server && npm start

# APK 构建
npm run build && npx cap sync && cd android && ./gradlew assembleDebug
# 或直接 push main 触发 GitHub Actions
```

**重要**：服务器必须在用户自己的终端中启动，不要通过脚本后台运行（Qoder CLI 子进程退出后会留下幽灵端口绑定，导致 EADDRINUSE 或静默挂起）。

---

## API 端点一览

| 前缀 | 端点 | 认证 |
|---|---|---|
| `GET /api/health` | 健康检查 | 无 |
| `POST /api/auth/login` | 登录，返回 JWT（7天有效，5分钟10次限制） | 无 |
| `GET /api/auth/me` | 当前用户信息 | JWT |
| `GET/POST/PUT/DELETE /api/dishes` | 菜品 CRUD | 修改需 admin/cashier |
| `POST /api/upload` | 图片上传（base64，5MB限制） | JWT |
| `GET/POST/PUT/DELETE /api/categories` | 分类 CRUD（重命名同步菜品） | 删除需 admin |
| `GET/POST/PUT/DELETE /api/flavors` | 口味模板 CRUD | 修改需 admin |
| `GET/PUT /api/dishes/:id/flavors` | 菜品-口味关联 | 修改需 admin/cashier |
| `GET /api/orders` | 订单列表（分页：page/pageSize） | JWT |
| `POST /api/orders` | 创建订单（草稿/直接提交 + 自动厨打） | JWT |
| `PUT /api/orders/:id` | 修改订单（仅 pending/draft 状态） | JWT |
| `POST /api/orders/:id/submit` | 提交草稿→待结账 + 厨打 | JWT |
| `POST /api/orders/:id/cancel` | 取消整个订单 | admin/cashier |
| `DELETE /api/orders/:id` | 删除订单 | admin |
| `POST /api/orders/:id/add-items` | 加菜（追加菜品 + 加菜厨打） | JWT |
| `POST /api/orders/:id/cancel-item` | 退菜单品（部分/全部 + 退菜厨打） | admin/cashier/waiter |
| `POST /api/orders/:id/kitchen-reprint` | 补打厨打 | admin/cashier |
| `POST /api/orders/:id/checkout` | 结账（现金/POS）+ 自动打印小票 | admin/cashier |
| `POST /api/orders/:id/reopen` | 重新打开已结账订单 | admin/cashier |
| `POST /api/orders/:id/print` | 补打小票 | admin/cashier |
| `GET /api/printers` | 列出系统打印机（含当前和厨房打印机） | admin/cashier |
| `GET /api/orders/export` | 订单导出（日期/服务员/桌号筛选） | admin/cashier |
| `GET /api/employees` | 员工列表 | admin/cashier |
| `POST /api/employees` | 新增员工 | admin |
| `PUT /api/employees/:id` | 修改员工（含密码重置，改密码踢旧会话） | admin |
| `GET /api/waiters` | 服务员列表（平板端选人用） | JWT |
| `GET /api/reports/today` | 今日概览（订单数/营业额） | admin/cashier |
| `GET /api/reports/monthly` | 本月概览 | admin/cashier |
| `GET /api/reports/monthly-trend` | 近30天每日趋势 | admin/cashier |
| `GET /api/reports/category-pie` | 分类点单次数分布 | admin/cashier |
| `GET /api/reports/payment-pie` | 支付方式分布 | admin/cashier |
| `GET /api/reports/dishes-top` | 菜品销量 Top 10 | admin/cashier |
| `GET /api/reports/waiter-rank` | 服务员业绩排行 | admin/cashier |
| `GET /api/db/info` | 数据库/备份文件信息 | admin |
| `POST /api/db/backup` | 手动备份数据库 | admin |
| `POST /api/db/restore` | 恢复数据库（从备份文件） | admin |

---

## 数据库核心表

- **employees** — 员工（username/password/name/role/status/token_version）
- **dishes** — 菜品（三语名称/多分类/价格/多图/备注/排序/状态/images JSON数组）
- **categories** — 分类（三语名称/排序）
- **orders** — 订单（桌号/服务员/金额/状态/支付方式/收款/找零）
- **order_items** — 订单明细（菜品快照/数量/厨打状态/单品状态/口味选项JSON）
- **flavors** — 口味模板（三语名称/选项JSON数组/排序）
- **dish_flavors** — 菜品-口味关联（dish_id/flavor_id/required/排序）

默认账户：`admin` / `cashier01` / `waiter01` / `waiter02`，密码均为 `123456`

---

## 当前开发状态（截至 2026-06-23）

**最近提交（最新在前）：**
1. `16e7adf` fix: Bug修复 + 性能优化 — 分类筛选/草稿取消失败/报表N+1/厨打持久化/全表扫描
2. `fb5e908` Merge feat/kitchen-printing: 多图上传、口味选项、厨打优化及全面审查修复
3. `760ad1f` feat: 多图上传、口味选项、厨打优化及全面代码审查修复
4. `f111965` feat: 国际化补全 — 后端错误码 + 前端离线模式翻译 + Tab 样式修复
5. `322c5bf` fix: 分类 Tab 选中态内联 style 兜底 + CSS class 名对齐
6. `8355f16` fix: 分类 Tab 改用原生按钮，彻底解决选中态样式不生效
7. `9f190e7` fix: 修复分类 Tab 栏选中状态样式无区分的问题
8. `71f867b` fix: WebSocket 改为单例连接 + 指数退避，消除控制台刷屏报错
9. `f923586` fix: 修复服务员端草稿和待结账列表无数据的问题
10. `63aad9a` feat: 第二阶段优化 - 分页/离线/实时推送/打包优化/API测试

**之前里程碑：**
- JSON → SQLite 迁移（`c485b5f`）
- 三语国际化 + 双入口架构（`def9bad`）
- APK 图片路径修复 + Capacitor androidScheme 改为 http
- 审计日志系统（audit_logs 表 + GET /api/audit-logs）

**活跃开发领域：** 厨房打印系统、多图上传、口味选项系统、WebSocket 实时推送、离线模式、代码审查修复、性能优化

---

## 关键设计决策 & 注意事项

1. **Hash 路由**：使用 `createWebHashHistory`，因为 APK WebView 不支持 HTML5 History 模式
2. **相对路径 base**：Vite `base: './'` 确保 APK 加载本地资源
3. **HTTP 明文**：APK 使用 `androidScheme: http` + `cleartext: true`，因为内网 WiFi 环境
4. **图片路径**：前端发送时存相对路径，APK 端显示时 prepend serverUrl（`64f40c8`）
5. **密码哈希**：使用 bcryptjs（替代原始 SHA-256），更安全
6. **备份机制**：每次写操作触发 persist → temp file → 备份旧文件 → 原子重命名；backups/ 目录最多保留 7 个带时间戳的备份
7. **多分类**：dishes.category 用逗号分隔存储（非关联表），支持中英文逗号
8. **订单快照**：order_items 存储 dish_name/dish_price 快照，防止菜品修改影响历史订单
9. **服务器 URL 动态检测**：APK 端尝试从 localStorage 或 `location.origin` 获取，自动跳过 Capacitor WebView 的 `https://localhost` URL
10. **数据库索引**：`_migrateIndexes()` 自动创建 9 个索引（orders_status/waiter_id/table_status/paid_at, order_items_order_id, dish_flavors_dish_id/flavor_id, audit_logs_created_at/action）
11. **Dashboard.vue**：旧版点餐页面，已废弃但保留在代码库中
12. **双打印机系统**：厨房打印机（58mm/20字符每行）+ 小票打印机（80mm/32字符每行），可分别指定不同打印机
13. **CJK 字体回退**：C# PrintDocument 使用 Consolas (Latin) + Microsoft YaHei (CJK) 逐字符渲染，JS 端 charWidth 与 C# IsCjk 范围保持一致
14. **小票多语言**：小票模板含中/葡双语（始终），菜品名称从 dishes 表查翻译名；order_items 仅存中文快照
15. **Vite ESM**：根 `package.json` 设 `"type": "module"` 消除 Vite CJS 弃用警告，`server/package.json` 设 `"type": "commonjs"` 保持服务端 `require()` 兼容
16. **会话互斥**：每次登录递增 token_version，旧 token 自动失效；WebSocket 连接也需要认证
17. **登录速率限制**：5 分钟窗口内最多 10 次尝试（按 IP）
18. **图片上传验证**：MIME 类型 + 文件大小（5MB）+ 文件头魔术字节校验
19. **口味系统**：flavors 表存储模板（含三语选项），dish_flavors 关联表，order_items.flavors 存储选中口味的 JSON
20. **WebSocket 实时推送**：订单创建/更新/提交/结账/取消/删除/退菜 等事件广播到所有已认证客户端
21. **优雅关闭**：SIGINT/SIGTERM 触发数据库持久化后退出
22. **订单分页**：GET /api/orders 支持 page/pageSize 参数
23. **厨打状态跟踪**：order_items 记录 kitchen_status (new/printed/cancelled/cancel_pending) 和 printed_qty
24. **同步更新 README.md**：每次修改项目代码时需要同步更新 README.md
25. **审计日志**：audit_logs 表记录关键操作（删单/退菜/删菜品/删分类/删口味/恢复数据库/员工变更），含 IP 追踪
26. **persist 批量合并**：`persist()` 使用 setImmediate 合并同一 tick 的多次调用，减少磁盘 I/O
27. **报表查询优化**：category-pie 和 dishes-top 一次性加载所有 dishes 到 Map，消除 N+1 查询
28. **API 查询优化**：热路径中 `find()`/`findOne()` 替换为 `findBy()`/`findOneBy()` 利用 SQLite 索引
29. **组件拆分**：大页面组件拆分为可复用子组件 — DishDetailDialog/DishEditDialog/CategoryManageDialog/OrderDetailDialog
30. **图片压缩**：前端上传前自动压缩（大图缩放到 1024px + JPEG 85% 质量），小 PNG (<200KB) 保持原格式

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

# 运行测试
npm test
```

---

## 已知待优化项

1. **Dashboard.vue 废弃未删除** — 占用代码库空间，建议清理
2. ~~无数据库索引~~ ✅ 已修复 — `_migrateIndexes()` 自动创建 9 个索引
3. **OrderPage.vue 仍较大** — 已拆分出 DishDetailDialog 和 OrderDetailDialog，主文件仍有 ~2000 行，可进一步拆分购物车面板和菜品网格
4. ~~MenuManage.vue 过大~~ ✅ 已修复 — 拆分出 DishEditDialog 和 CategoryManageDialog，主文件缩减至 ~570 行
5. **无单元测试** — 缺少后端 API 测试和前端组件测试
6. ~~WebSocket 无断线重连~~ ✅ 已修复 — ws.js 实现单例 + 指数退避重连 (3s→30s)
7. ~~图片无压缩~~ ✅ 已修复 — DishEditDialog 中上传前 Canvas 压缩（1024px + JPEG 85%）
8. ~~无操作日志~~ ✅ 已修复 — audit_logs 表 + auditLog() 函数，覆盖删单/退菜/删菜品/删分类/删口味/恢复数据库/员工变更
9. **JWT 密钥默认值硬编码** — 生产环境应通过 JWT_SECRET 环境变量覆盖
10. **CORS 全开放** — 局域网场景可接受，但建议生产环境限制来源
11. **无 HTTPS** — 纯 HTTP 明文传输，JWT token 存在局域网嗅探风险（内网场景可接受）
