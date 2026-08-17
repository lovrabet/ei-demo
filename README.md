# ei-demo：基于 Lovrabet 的企业采购与财务审批样板应用

基于 Lovrabet 平台的 React 18 + Vite 微前端样板，演示企业采购与财务审批业务。**所有业务数据均为演示用虚构数据。**

## 项目介绍

- **应用**：Lovrabet 平台应用 `app-4d050189`（ei-demo）
- **入口地址**：https://app.lovrabet.com/app/app-4d050189/
  - 应用配置后台：https://app.lovrabet.com/app/app-4d050189/admin/dashboard
  - Agent 入口：https://app-4d050189.app.lovrabet.com/chat

**基本功能**：

- 单据申请：费用报销、付款申请、工资发放、差旅申请
- 合同管理：采购 / 销售合同申请、合同台账、收款计划
- 发票管理：销项开票申请、进项发票归档、发票台账
- 审批流转：单据走平台 Flow 审批（待办 / 已办 / 草稿）
- 客户与伙伴：客户 360、供应商 / 服务商、资质证照
- 其他：法务协议、报销规则、飞书消息通知

## 产品价值

AI 原生，深入场景，解决真问题。每个业务场景都由 AI 能力贯穿，而非人工记录 + 事后对账：

**场景 1 · 费用报销**

费用报销是高频易错场景：发票繁多、制度复杂，超标、超期、重复报销、虚假票据难以人工逐张核对。

AI 自动识别票面信息，按企业制度匹配报销规则（金额上限、报销时限、费用类别、发票类型），超标 / 超期 / 类别不符智能标记，重复报销与虚假票据自动拦截，人工只需复核异常项。

**场景 2 · 合同审查**

合同涉及主体授权、价税资金、交付验收、知识产权、违约解除等多个风险维度，人工逐页核验耗时且易漏。

AI 逐页核验合同，按上述维度识别风险并给出处置建议，经授权录入、修正、复核，全流程留痕。

**场景 3 · 发票查重与登记**

发票号码重复使用、一票多报是财务审核的痛点，单靠记忆和翻查难以定位冲突单据。

AI 自动查重，定位冲突报销单与发票；进销项发票智能登记、归档，开票申请与履约状态同步。

**场景 4 · 工资发放**

工资 / 人员成本表结构复杂，金额、人数、月份、主体拆分容易出错，人工对账繁琐。

AI 自动解析表格金额与人数，完成月份校验与合计对账，按主体智能拆分生成付款申请，保留原始附件。

**场景 5 · 审批流转**

单据审批链路长、节点多，状态分散在各业务表，发起与回写靠手工同步。

单据发起即进平台原生 Flow：发起拦截、状态回写、审批中心统一处理，支持批量审批与飞书消息通知。

**场景 6 · 客户 360 与应收**

应收账款账龄不清、催收无优先级，客户信息分散在机会、合同、收款多张表。

AI 分析账龄结构、给出催收优先级建议；客户视图整合机会、合同、收款、跟进全链路。

AI 原生不是叠加功能，而是架构的默认形态：业务规则由平台 BFF 在数据读写层强制（绕过 UI 也过不了守卫），流程由平台原生审批驱动，开发与操作由 AI Agent 完成。传统系统是「人录数据、系统存数据」，这里是「规则系统强制、流程系统驱动、AI 全程参与」。

## 安装

环境要求：Node.js 20+

```bash
npm install
```

对接平台数据时需要 rabetbase CLI（纯前端看界面可跳过）：

```bash
npm install -g @lovrabet/rabetbase-cli
rabetbase auth login
```

## 启动

纯前端看界面：

```bash
npm run start
```

浏览器打开 **https://dev.lovrabet.com:5173**（换端口：`PORT=3000 npm run start`）。

带平台数据开发（推荐）：

```bash
rabetbase run start
```

> 业务数据来自 Lovrabet 平台（通过 `@lovrabet/sdk` 读取），不在本仓库。未登录或缺少数据模型时列表为空、接口报错，属正常现象。

## 项目结构

```text
.
├── src/                  # 前端源码
│   ├── api/              # SDK 模型配置与统一客户端
│   ├── components/       # 通用业务组件
│   ├── features/         # 业务功能模块
│   ├── pages/            # 页面（vite-plugin-pages 自动生成路由）
│   ├── layouts/          # 主布局
│   ├── router/           # 路由
│   └── utils/            # 工具
├── db/                   # 演示数据初始化脚本（虚构数据）
├── scripts/              # 审批流迁移辅助脚本
├── .rabetbase/           # BFF 脚本 / Lovrabet官方页面配置 / 同步清单
├── docs/quick-start.md   # Rabetbase 子应用快速开始
├── .agents/skills/       # Lovrabet AI 助手技能
├── vite.config.ts
└── package.json
```

## 架构

```text
┌─────────────────────────────────────────────────────────┐
│ 前端（本仓库）                                           │
│  React 18 + TypeScript + Vite 7                          │
│  Ant Design v5 · React Router v6 · echarts               │
│  @ice/stark-app（icestark 微前端，可独立运行 / 嵌入主应用）│
│  vite-plugin-pages（src/pages 文件系统路由）             │
└──────────────┬──────────────────────────────────────────┘
               │ 微前端主子应用合并（icestark 嵌入 Lovrabet 主应用）
               │ @lovrabet/sdk → Instant API + Backend Function
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

**BFF 分层（26 COMMON / 35 ENDPOINT / 122 HOOK）**：

- **ENDPOINT（接口层）**：对外暴露的业务函数（`POST /api/endpoint/<appcode>/<name>`），前端直接调用。负责校验入参、编排流程，通过 `bff.execute({ scriptName })` 调 COMMON；平台禁止 ENDPOINT 调 ENDPOINT。
- **COMMON（共享逻辑层）**：可复用能力，不对外暴露，绝大多数为叶子（不调其它 COMMON）：
  - `cpoDatasetMap` 数据集映射：集中登记 40+ 数据集 code，产出 `bizType → 主单元数据`、`物理表名 → model key`、`语义名 → SQL code` 三张映射，屏蔽应用级 code 差异；
  - `cpoDal` 数据访问层：接收 map，返回 `{ model(表名), sql(语义名) }`，BFF 据此读写数据，不硬编码 dataset/sql uuid；
  - `cpoBizResolver` / `cpoDictionary` / `cpoCurrentActor`：读业务单并归一摘要 / 字典 code→label / 当前操作人；
  - `cpoWorkflowScenario` / `cpoWorkflowConfig` / `cpoTaskService` / `cpoWorkflowParticipantService` / `cpoWorkflowNotifier`：流程解析、流程定义、任务服务、抄送授权、审批通知；
  - `cpoActionRecorder`：写 `biz_action_record` 操作流水；
  - 守卫族：`cpo*ReadFilterGuard` / `cpo*ReadOneGuard` / `cpoDirectWriteGuard` / `cpoLogicalDeleteGuard` 等，做行级可见性与写入管控。
- **HOOK（数据守卫层）**：挂在数据集 Instant API 操作前后（`HOOK/<dataset>/<op>/before|after/`），复用 COMMON 守卫对读写做行级过滤 / 写入拦截 / 结果增强。

调用约定：ENDPOINT → COMMON（编排）、HOOK → COMMON（守卫）；COMMON 之间不互调，跨 COMMON 的数据（如 `cpoDatasetMap` 的 map）由调用方取好后传参。

## TODO
[]  **切换为平台原生审批流**：目前经 BFF（`cpoSaveDraft` / `cpoSubmitApplication`）创建的单据走 legacy 自建待办（`biz_task`），只有标准页面创建的记录才接入平台 Flow。后续统一改为平台审批流，让所有入口都走 Flowable。
[] **使用平台 DAL 层做数据集管理**（平台正在建设中）：当前通过自建的 `cpoDatasetMap` / `cpoDal` 做数据集映射与数据访问，待平台统一 DAL 层上线后替换。
[] **用平台 API 访问策略替代大量 Instant API Hooks**（平台正在建设中）：当前通过大量 `HOOK/<dataset>/<op>/before|after` 守卫做行级权限与写入管控，待平台 API 访问策略上线后收敛。

## 许可证

本项目采用 [MIT](./LICENSE) 开源协议。
