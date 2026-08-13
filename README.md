[项目更新记录](./CHANGELOG.md)

# oa-demo：Lovrabet 企业采购与审批样板应用

这是运行在 Lovrabet 平台上的 React 18 + Vite 微前端样板应用（AppCode `app-4d050189`），演示了一整套企业采购与财务审批业务：费用报销、付款申请、销售/采购合同、发票登记与开具、工资发放、差旅申请、应收合同与客户 360 等单据的申请、审批、台账与审批流接入。**所有业务数据均为演示用虚构数据。**

该样板展示了完整的前后端开发形态：

- 前端通过 `@lovrabet/sdk` 调用平台数据模型，`vite-plugin-pages` 按 `src/pages` 生成路由，构建后以 icestark 微前端方式嵌入 Lovrabet 主应用；
- 后端使用 BFF 脚本（`.rabetbase/bff/` 下的 COMMON / ENDPOINT / HOOK）承载业务规则与数据守卫；
- 审批流接入 Lovrabet 平台原生 Flow（Flowable）：单据发起后由平台拦截并转发起审批，状态回写到业务表，审批人从平台审批中心处理。

项目的日常使用方式不是让开发者记住一组命令，而是在 Claude Code、Cursor、Codex 等 Agent 环境里直接描述开发目标。`rabetbase` CLI 提供项目配置、模型同步、构建检查、菜单接入等能力，Agent 根据你的 Prompt 调用这些能力完成开发任务。

## 公开文档

- [Lovrabet 开放平台文档](https://open.lovrabet.com/docs)
- [TypeScript SDK](https://open.lovrabet.com/docs/lovrabet-sdk/intro)
- [CLI 工具](https://open.lovrabet.com/docs/lovrabet-cli/)
- [MCP](https://open.lovrabet.com/docs/mcp/intro)
- [快速开始（本仓库）](./docs/quick-start.md)

## 技术栈

- `@lovrabet/sdk`：Lovrabet TypeScript SDK 与模型客户端。
- React 18 + TypeScript：页面开发与类型约束。
- React Router v6：页面路由。
- Ant Design v5：企业级 UI 组件。
- Vite v7：本地开发与生产构建。
- `@ice/stark-app`：icestark 微前端运行环境识别与 basename 适配。
- `vite-plugin-pages`：基于 `src/pages` 的文件系统路由。
- BFF 脚本（`.rabetbase/bff/`）：平台后端函数，承载业务规则与数据守卫。

## 目录结构

```text
.
├── src/
│   ├── api/                    # CLI 生成的 SDK 模型配置 + 统一导出的 SDK 客户端
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
├── docs/quick-start.md
├── .rabetbase/
│   ├── bff/app-4d050189/       # BFF 脚本（COMMON / ENDPOINT / HOOK）
│   ├── page/app-4d050189/      # 低代码页面配置
│   └── *.lock.json             # BFF / 页面 / SQL 同步清单
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## 内置页面

项目使用 `vite-plugin-pages`，路由由 `src/pages` 下的文件自动生成。主要页面：

| 文件                                 | 路由                        | 用途                                    |
| ------------------------------------ | --------------------------- | --------------------------------------- |
| `src/pages/index.tsx`                | `/`                         | Rabetbase 开发指南（AppCode 状态、MCP/CLI 配置、文档导航） |
| `src/pages/workbench/index.tsx`      | `/workbench`                | 工作台（待办/已办/草稿统计）             |
| `src/pages/expense-form/index.tsx`   | `/expense-form`             | 费用报销申请                             |
| `src/pages/payment-form/index.tsx`   | `/payment-form`             | 付款申请                                 |
| `src/pages/salary-payment-form/index.tsx` | `/salary-payment-form` | 工资发放申请                             |
| `src/pages/travel-form/index.tsx`    | `/travel-form`              | 差旅申请                                 |
| `src/pages/sales-contract-form/index.tsx` | `/sales-contract-form`  | 销售合同申请                             |
| `src/pages/contract-form/index.tsx`  | `/contract-form`            | 采购合同申请                             |
| `src/pages/invoice-form/index.tsx`   | `/invoice-form`             | 发票登记                                 |
| `src/pages/invoice-archive-form/index.tsx` | `/invoice-archive-form` | 进项发票归档                             |
| `src/pages/invoice-center/index.tsx` | `/invoice-center`           | 发票台账                                 |
| `src/pages/contracts/index.tsx`      | `/contracts`                | 合同台账                                 |
| `src/pages/application-list/index.tsx` | `/application-list`       | 单据列表                                 |
| `src/pages/approval-center/index.tsx` | `/approval-center`         | 审批中心（待办/已办/已提交）             |
| `src/pages/my-todo/index.tsx`        | `/my-todo`                  | 我的待办                                 |
| `src/pages/my-done/index.tsx`        | `/my-done`                  | 我的已办                                 |
| `src/pages/my-submitted/index.tsx`   | `/my-submitted`             | 我提交的                                 |
| `src/pages/my-drafts/index.tsx`      | `/my-drafts`                | 我的草稿                                 |
| `src/pages/customer-360/index.tsx`   | `/customer-360`             | 客户 360                                 |
| `src/pages/legal-agreements/index.tsx` | `/legal-agreements`        | 法律协议台账                             |
| `src/pages/expense-rules/index.tsx`  | `/expense-rules`            | 费用规则                                 |
| `src/pages/notification-test/index.tsx` | `/notification-test`      | 飞书消息测试                             |

新增页面时，在 `src/pages` 下添加 `.tsx` 文件即可。例如 `src/pages/customer/index.tsx` 会生成 `/customer` 路由。

## 快速开始

### 环境要求

- Node.js 20+
- 已安装 `rabetbase` CLI；需要拉取真实 API 配置时还需要完成登录

```bash
npm install -g @lovrabet/rabetbase-cli
rabetbase --help
```

模板本身不内置 `rabetbase` 依赖，`rabetbase run start` 等命令依赖全局 CLI。

### 克隆后启动

```bash
npm install
rabetbase run start
```

本地服务默认打开：

```text
https://dev.lovrabet.com:5173
```

需要换端口时可执行 `PORT=3000 rabetbase run start`。

### 拉取 SDK 配置

如果当前目录还没有配置 AppCode，先执行：

```bash
rabetbase project init --appcode app-4d050189
rabetbase api pull
```

项目统一从 `src/api/client.ts` 导出 SDK 客户端：

```typescript
import { lovrabetClient } from "@/api/client";

const models = lovrabetClient.getModelList();
const data = await lovrabetClient.models.expenseApplication.filter({
  currentPage: 1,
  pageSize: 20,
});
```

模型别名来自生成后的 `src/api/api.ts`，实际使用前请以该文件为准。

## 开发说明

### 本地脚本

仓库脚本统一通过 CLI 运行：

```bash
rabetbase run start
rabetbase run build
rabetbase run preview
```

底层脚本定义在 `package.json`，目前对应 Vite 的 `start`、`build`、`preview`。

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
微应用唯一标识：oa-demo
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

1. 端口被占用：执行 `PORT=3000 rabetbase run start`。
2. HTTPS 证书获取失败：确认本地开发域名已加入平台开发证书信任范围（`rabetbase` CLI 会自动处理证书）。
3. 路由不生效：确认页面位于 `src/pages` 下，并使用 `.tsx` 后缀。
4. SDK 调用失败：执行 `rabetbase api pull`，并检查 `src/api/api.ts` 是否包含正确 AppCode 和模型别名。
5. 嵌入后页面空白：确认 Lovrabet 页面使用 `import` 加载，并指向构建后的 `main.js` 与 `main.css`。

## 更多文档

- [快速开始](./docs/quick-start.md)
- [更新记录](./CHANGELOG.md)
- [Lovrabet 开放平台文档](https://open.lovrabet.com/docs)
