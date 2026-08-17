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

## 产品价值

AI 原生，深入场景，解决真问题。每个业务场景都由 AI 能力贯穿——识别、规则匹配、风险拦截，而不是人工记录 + 事后对账：

| 场景 | AI 在做什么 |
| --- | --- |
| 费用报销 | 报销规则自动匹配，超标 / 超期 / 类别不符智能标记，重复报销与虚假票据自动拦截 |
| 合同审查 | 按主体授权、价税资金、交付验收、知识产权等维度识别风险并给出处置建议 |
| 发票管理 | 发票号码自动查重、定位冲突单据，进销项发票登记、归档、开票履约 |
| 工资发放 | 工资 / 人员成本表自动解析金额与人数，月份校验、合计对账、按主体智能拆单 |
| 审批流转 | 单据发起即进平台原生 Flow，发起拦截、状态回写、批量审批、飞书通知 |
| 客户 360 | 账龄结构分析、催收优先级排序，机会 / 合同 / 收款全链路视图 |

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
