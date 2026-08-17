# ei-demo：基于 Lovrabet 的企业采购与财务审批样板应用

基于 Lovrabet 平台的 React 18 + Vite 微前端样板，演示企业采购与财务审批业务（报销、付款、合同、发票、工资、差旅、客户 360 等）。**所有业务数据均为演示用虚构数据。**

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
