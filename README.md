[项目更新记录](./CHANGELOG.md)

# ei-demo：基于 Lovrabet 的企业采购与财务审批样板应用

这是运行在 Lovrabet 平台上的 React 18 + Vite 微前端样板应用（AppCode `app-4d050189`），演示了一整套企业采购与财务审批业务：费用报销、付款申请、销售/采购合同、发票登记与开具、工资发放、差旅申请、应收合同与客户 360 等单据的申请、审批、台账与审批流接入。**所有业务数据均为演示用虚构数据。**

> 环境要求：**Node.js 20+**。`rabetbase` CLI 不是启动必需项，仅在需要对接 Lovrabet 平台数据时才安装。

---

## 🚀 快速启动

### ① 最快跑起来 —— 纯前端看界面（无需任何账号）

```bash
npm install
npm run start
```

然后浏览器打开 **http://localhost:5173**（默认端口 5173；换端口用 `PORT=3000 npm run start`）。

> 这种方式启动后，页面框架、路由、表单都能正常渲染；但**业务数据来自 Lovrabet 平台**，未登录或没有对应数据模型时列表为空、接口报错，均属预期，原因见[数据从哪来](#数据从哪来)。

### ② 完整体验 —— 对接 Lovrabet 平台数据（推荐，开发日常用这条）

```bash
npm install -g @lovrabet/rabetbase-cli
npm install
rabetbase auth login        # 首次登录平台账号
rabetbase run start
```

默认访问 **https://dev.lovrabet.com:5173**（换端口：`PORT=3000 rabetbase run start`）。

### ③ 对接你自己的 Lovrabet 应用

```bash
rabetbase project init --appcode <你的AppCode>
rabetbase api pull          # 拉取该应用的 SDK 模型配置
rabetbase run start
```

拉取后重点检查 `src/api/api.ts` 中的 AppCode 与模型别名是否匹配页面调用。

### 怎么选

| 你的目的 | 用哪条 | 需要 |
| --- | --- | --- |
| 只看界面 / 读代码 | ① `npm run start` | 仅 Node.js |
| 用平台数据 + 审批流做开发 | ② `rabetbase run start` | rabetbase CLI + 平台账号 |
| 换自己的应用跑起来 | ③ `project init` + `api pull` | 自己的 Lovrabet 应用 |

---

## 数据从哪来

启动前先看这一节，避免误以为项目坏了。

- 前端通过 `@lovrabet/sdk` 请求平台运行态 API（`runtime.lovrabet.com`），登录态以 Cookie 携带（见 `src/utils/api.ts` 的 `credentials: "include"`）。
- 本仓库**不包含数据库结构**（除法务主体等少数表的结构 DDL，见[演示数据与数据库脚本](#演示数据与数据库脚本db)），也不包含任何真实业务数据。
- 没有登录态 / 没有对应数据模型时，页面能渲染但列表为空或请求报错——这是**预期行为**，不是启动失败。
- 需要在本地完整还原演示数据时，参照[演示数据与数据库脚本](#演示数据与数据库脚本db)。

## 功能总览

覆盖「申请 → 审批 → 台账 → 归档」的完整业务闭环：

| 业务域 | 主要页面（路由） | 说明 |
| --- | --- | --- |
| 工作台 | `/workbench` | 待办 / 已办 / 草稿统计，审批趋势 |
| 费用报销 | `/expense-form` | 费用报销申请，费用明细、发票关联 |
| 付款申请 | `/payment-form` | 商务付款申请，供应商、付款计划 |
| 工资发放 | `/salary-payment-form` | 工资 / 个税 / 人员成本付款申请 |
| 差旅申请 | `/travel-form` | 差旅出行申请 |
| 采购 / 销售合同 | `/contract-form`、`/sales-contract-form` | 采购付款合同、对外销售合同申请 |
| 合同台账 | `/contracts` | 合同工作台、收款计划 |
| 发票登记与开具 | `/invoice-form`、`/invoice-archive-form` | 销项开票申请、进项发票归档 |
| 发票台账 | `/invoice-center` | 进销项发票、客户发票中心 |
| 客户 360 | `/customer-360` | 客户视图：机会、合同、收款、跟进 |
| 应收合同 | `/receivable-contract-detail/:id` | 收款合同详情、回款计划 |
| 供应商 / 服务商 | `/partner-form` | 业务伙伴录入 |
| 资质证照 | `/credential-form` | 公司资质管理 |
| 法务协议 | `/legal-agreements` | 法律协议台账、文档生成与导出 |
| 报销规则 | `/expense-rules` | 费用合规规则 |
| 审批中心 | `/approval-center`、`/my-todo`、`/my-done`、`/my-submitted`、`/my-drafts` | 待办 / 已办 / 已提交 / 草稿 |
| 通知测试 | `/notification-test` | 飞书消息推送测试 |

> 完整路由以 `src/pages` 目录为准，`vite-plugin-pages` 会为每个 `.tsx` 文件自动生成对应路由。

## 架构

```text
┌─────────────────────────────────────────────────────────┐
│ 前端（本仓库）                                           │
│  React 18 + TypeScript + Vite 7                          │
│  Ant Design v5 · React Router v6 · echarts               │
│  @ice/stark-app（icestark 微前端，可独立运行 / 嵌入主应用）│
│  vite-plugin-pages（src/pages 文件系统路由）             │
└──────────────┬──────────────────────────────────────────┘
               │ @lovrabet/sdk（models.* CRUD / filter / getList）
               ▼
┌─────────────────────────────────────────────────────────┐
│ Lovrabet 平台                                            │
│  · 运行态 API（https://runtime.lovrabet.com/api/，Cookie）│
│  · 数据模型（src/api/api.ts 注册 44 个模型）             │
│  · BFF 脚本（.rabetbase/bff/：COMMON 公共逻辑 /          │
│    ENDPOINT 接口 / HOOK 数据守卫）                        │
│  · 审批流 Flow（Flowable：发起拦截、状态回写、审批中心）  │
└─────────────────────────────────────────────────────────┘
```

- **数据层**：项目统一从 `src/api/client.ts` 导出 `lovrabetClient`（基于 `@lovrabet/sdk`），模型清单与别名见 `src/api/api.ts`。
- **后端逻辑**：业务规则、读写守卫、流程状态同步由 BFF 脚本承载，不在前端重复实现。
- **审批流**：单据发起走平台 Flow，状态回写业务表，审批动作（通过 / 驳回）由平台审批中心处理。

## 演示数据与数据库脚本（db/）

`db/` 目录下的脚本用于在演示数据库里初始化**虚构演示数据**。**所有脚本都不包含真实凭据**：数据库连接通过环境变量或 gitignored 的本地 JSON 文件解析（见 `db/demo_db.py`）。

### 连接配置

连接解析顺序（`db/demo_db.py`）：

1. 环境变量
   - 演示库：`EI_DEMO_MYSQL_HOST / PORT / USER / PASSWORD / DATABASE`
   - 源库（仅导出结构用）：`YUNTOO_CPO_MYSQL_URL`（`mysql://user:pass@host:port/db`）
2. gitignored 本地文件：`db/.demo-db.json`（演示库）、`db/.src-db.json`（源库），例如：

```json
{ "host": "your-db-host", "port": 3306, "user": "your-user",
  "password": "your-password", "database": "ei-demo" }
```

3. localhost 占位（`127.0.0.1` / `root` / 空密码，通常连不上真实库）。

### 脚本清单

| 脚本 | 作用 | 说明 |
| --- | --- | --- |
| `db/export_and_apply_ddl.py` | 从源库导出表结构并应用到演示库 | 仅结构、不拷贝行数据；源库需自己准备 |
| `db/build_legal_tables.py` | 从数据集元数据生成法务/主体等 6 张表 DDL 并应用 | 元数据来自 `rabetbase dataset detail` |
| `db/seed_config.py` | 灌入字典、报销规则、审批流配置 | 来源为已发布的配置导出；**所有真实用户引用会被重映射为演示管理员**（用户 81「梓骞」） |
| `db/seed_demo_data.py` | 灌入虚构业务数据 | 员工、主体、供应商、客户、机会、合同、收款、各类申请单、发票、工资等 |
| `db/legal-entity-ddl.sql` | 法务 / 主体表结构 DDL | 仓库内唯一提交的结构 DDL |

> **关于完整还原演示数据**：上述脚本面向「在具备对应数据模型的 Lovrabet 演示环境内初始化数据」。完整表结构（`db/yuntoo-cpo-ddl.sql`）属于生成产物、不入库（见 `.gitignore`）。外部开发者要完整还原，需要在平台侧准备好相同数据模型，或用 `rabetbase` 从自己的应用导出结构后再跑初始化脚本。

### 审批流脚本（scripts/）

| 脚本 | 作用 |
| --- | --- |
| `scripts/flow_client.py` | Lovrabet 平台审批流 HTTP 客户端（复用 CLI 登录态） |
| `scripts/migrate_flows.py` | 将业务配置的 7 条已发布流程迁移为平台 Flow 定义并发布 |
| `scripts/mock_platform_flows.py` | 废弃 legacy 自建状态机数据，用平台 Flow 重新 mock 审批演示数据 |

## 目录结构

```text
.
├── src/
│   ├── api/                    # SDK 模型配置（api.ts）+ 统一导出的客户端（client.ts）
│   ├── components/             # 通用业务组件（附件上传、表单布局、金额输入、人员选择等）
│   ├── features/               # 按业务域组织的功能模块（cpo-workflow、invoice-center 等）
│   ├── layouts/MainLayout.tsx  # 主布局（icestark 环境下只渲染 <Outlet/>）
│   ├── pages/                  # 文件系统路由页面（vite-plugin-pages 自动生成路由）
│   ├── router/index.tsx        # 微前端路由适配
│   ├── utils/                  # api/format/query 等工具
│   ├── main.tsx
│   └── style.css
├── db/                         # 数据初始化与种子脚本（连接方式见 db/demo_db.py，凭据不入库）
├── scripts/                    # 审批流迁移辅助脚本
├── docs/quick-start.md         # Rabetbase 子应用快速开始（面向模板使用者）
├── .rabetbase/
│   ├── bff/app-4d050189/       # BFF 脚本（COMMON / ENDPOINT / HOOK）
│   ├── page/app-4d050189/      # 低代码页面配置
│   └── *.lock.json             # BFF / 页面 / SQL 同步清单
├── .agents/skills/             # Lovrabet AI 助手技能（业务操作 / 平台运维类）
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## 技术栈

- `@lovrabet/sdk`：Lovrabet TypeScript SDK 与模型客户端。
- React 18 + TypeScript：页面开发与类型约束。
- React Router v6：页面路由。
- Ant Design v5：企业级 UI 组件。
- Vite v7：本地开发与生产构建。
- `@ice/stark-app`：icestark 微前端运行环境识别与 basename 适配。
- `vite-plugin-pages`：基于 `src/pages` 的文件系统路由。
- BFF 脚本（`.rabetbase/bff/`）：平台后端函数，承载业务规则与数据守卫。

## 开发说明

### 本地脚本

仓库脚本统一通过 CLI 运行：

```bash
rabetbase run start
rabetbase run build
rabetbase run preview
```

底层脚本定义在 `package.json`，目前对应 Vite 的 `start`、`build`、`preview`。不依赖 CLI 时也可以直接执行 `npm run start` 等。

### 微前端入口

`src/main.tsx` 同时支持独立运行和嵌入运行：

- 独立运行时，`isInIcestark()` 为 false，应用渲染到 `#root`；
- 被 Lovrabet 主应用加载时，导出 `mount` / `unmount` 生命周期；
- React root 会缓存到容器上，避免重复创建 root。

`src/router/index.tsx` 会读取 icestark 的 `getBasename()`，因此同一份构建产物可以适配 Lovrabet 页面配置中的 basename。

### 构建产物

```bash
rabetbase run build
```

默认产物：

```text
dist/assets/main.js
dist/assets/main.css
```

需要版本化 CDN 路径时：

```bash
CDN_DOMAIN=https://your-cdn.com/ rabetbase run build
```

构建目录会变成 `dist/<package-name>/<version>/`，Vite `base` 也会指向对应 CDN 地址。

## 接入 Lovrabet 主应用

构建产物上传到 CDN 或静态资源服务器后，在 Lovrabet 应用中配置页面：

```text
页面名称：工作台
路由路径：/workbench
微应用唯一标识：ei-demo
资源加载方式：import
资源加载列表：
  https://your-cdn.com/path/to/assets/main.js
  https://your-cdn.com/path/to/assets/main.css
```

注意事项：

- 路由路径必须和 `src/pages` 生成的路由一致。
- Vite 构建产物必须选择 `import` 加载方式。
- 同一个微前端的多个 Lovrabet 页面可以复用同一组 JS/CSS 资源。
- 如果页面内部还有子路由，保留 `getBasename()` 适配逻辑。

## 常见任务

### 新增页面

```text
src/pages/customer/index.tsx  ->  /customer
src/pages/customer/[id].tsx   ->  /customer/:id
```

如果独立运行时也要在左侧菜单展示该页面，需要同步修改 `src/layouts/MainLayout.tsx`。

### 调用 Lovrabet 数据

优先使用 `src/api/client.ts` 导出的 SDK 客户端。只有 SDK 未覆盖的自定义运行态请求，才使用 `src/utils/api.ts` 自行封装。

### 嵌入时隐藏本地布局

`MainLayout` 已经在 icestark 环境下只返回 `<Outlet />`，因此嵌入 Lovrabet 主应用后不会重复显示本地侧边栏和顶部栏。

## 常见问题

1. **启动后页面能渲染但没有数据 / 接口报错**：这是预期行为——本应用的数据来自 Lovrabet 平台。请确认已 `rabetbase auth login` 登录、AppCode 正确，且应用具备页面用到的数据模型（`rabetbase api pull` 后可查看 `src/api/api.ts`）。只想看界面的话用[方式一](#快速启动)即可。
2. **本地 https 打不开（`https://dev.lovrabet.com:5173`）**：外部环境拿不到平台开发证书时，Vite 会降级为 http。改用 `http://localhost:5173` 访问；平台内开发时先确认已加入证书信任范围。
3. **端口被占用**：执行 `PORT=3000 rabetbase run start`。
4. **路由不生效**：确认页面位于 `src/pages` 下，并使用 `.tsx` 后缀。
5. **SDK 调用失败 / 模型不存在**：执行 `rabetbase api pull`，并检查 `src/api/api.ts` 是否包含正确 AppCode 和页面需要的模型别名。
6. **嵌入后页面空白**：确认 Lovrabet 页面使用 `import` 加载，并指向构建后的 `main.js` 与 `main.css`。
7. **`npm run start` 和 `rabetbase run start` 有什么区别**：底层都是 Vite 的 `start`；`rabetbase run start` 额外做项目上下文检查，且通常配好了登录态与证书。

## 许可证

本项目采用 [Apache License 2.0](./LICENSE) 开源协议，版权信息见 [NOTICE](./NOTICE)。

## 更多文档

- [快速开始（Rabetbase 子应用）](./docs/quick-start.md)
- [更新记录](./CHANGELOG.md)
- [Lovrabet 开放平台文档](https://open.lovrabet.com/docs)
- [TypeScript SDK](https://open.lovrabet.com/docs/lovrabet-sdk/intro)
- [CLI 工具](https://open.lovrabet.com/docs/lovrabet-cli/)
- [MCP](https://open.lovrabet.com/docs/mcp/intro)
