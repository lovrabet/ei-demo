# ei-demo：基于 Lovrabet 的企业采购与财务审批样板应用

基于 Lovrabet 平台的 React 18 + Vite 微前端样板，演示企业采购与财务审批业务。**所有业务数据均为演示用虚构数据。**

## 项目介绍

- **应用**：Lovrabet 平台应用 `app-4d050189`（ei-demo）
- **入口地址**：https://app.lovrabet.com/app/app-4d050189/
  - 应用配置后台：https://app.lovrabet.com/app/app-4d050189/data/intro/
  - 业务详情页：https://app-4d050189.app.lovrabet.com/application-detail/...

**基本功能**：

- 单据申请：费用报销、付款申请、工资发放、差旅申请
- 合同管理：采购 / 销售合同申请、合同台账、收款计划
- 发票管理：销项开票申请、进项发票归档、发票台账
- 审批流转：单据走平台 Flow 审批（待办 / 已办 / 草稿）
- 客户与伙伴：客户 360、供应商 / 服务商、资质证照
- 其他：法务协议、报销规则、飞书消息通知

## 与传统记录型系统的区别

传统记录型系统围绕「记录 + 增删改查」；本项目是 AI 原生、模型驱动、审批流一体化的平台业务应用：

- **业务闭环而非记录**：单据「申请 → 审批 → 台账 → 归档」，状态由流程驱动回写，不是手填状态字段
- **业务规则在数据层强制**：读写守卫、权限过滤、逻辑删除落在 BFF 脚本，绕过 UI 直调接口也过不了守卫
- **审批走平台原生 Flow**：发起即拦截、状态回写、审批中心统一处理，不是自建状态机
- **微前端嵌入主应用**：复用平台登录、菜单、导航壳，不是独立站点
- **AI Agent 驱动开发**：在 Claude Code 等环境中直接描述目标，Agent 调 rabetbase CLI 完成开发
- **前端只是客户端**：数据在平台运行态，通过 `@lovrabet/sdk` 读取

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

## 许可证

[Apache License 2.0](./LICENSE)，版权信息见 [NOTICE](./NOTICE)。
