---
name: yuntoo-ei-i18n
displayName: 企业智能系统多语言开发
description: "启智云图企业智能系统的 i18n 国际化开发能力。用于提取和替换用户可见文案、维护中文/英语/印尼语语言包，并验证翻译 key 完整性；不翻译路由、状态码、字段名或 BFF 参数等运行时协议值。"
example: "把申请单详情页的中文文案翻译成英语和印尼语，并检查语言包"
metadata:
  type: write
---

# 企业智能系统多语言开发

在启智云图企业智能系统 Lovrabet 应用（前端包 `yuntoo-cpo`）中维护 `zh-CN`、`en-US`、`id-ID` 三语资源。当前落地项目：`yuntoo-ei`（`app-381a257e`）、`oa-demo`（`app-4d050189`）。

## 固定架构

- 使用 `@lovrabet/i18n`，统一从 `@/i18n` 导入 `$i18n`。
- 只支持 `zh-CN`、`en-US`、`id-ID`；三份语言包必须同步维护。
- 语言包固定为 `src/locales/zh-CN.json`、`en-US.json`、`id-ID.json`，由 `src/locales/index.ts` 汇总。
- `src/i18n/index.ts` 统一负责语言检测、Lovrabet 全局语言同步、Ant Design locale、dayjs locale 和语言切换。
- 页面不得自行创建 I18n 实例或维护第二套语言状态。

## 翻译边界

翻译按钮、标题、导航、表格列名、筛选项、空状态、校验提示、错误提示和其他用户可见文案。

不要翻译或改写：

- 路由和 URL；
- `bizType`、workflow status、action 等状态码；
- 数据集 code、AppCode、字段名和模型 key；
- BFF 名称、参数名、查询值和前后端通信协议；
- 仅用于测试契约、日志定位或开发注释的内部文本。

业务数据由后端返回时，优先让后端同时返回稳定 code；前端用 code 映射翻译。不要用已翻译的显示文本参与条件判断。

## 执行流程

1. 运行 `npm run i18n:scan`，筛选本次页面中真正面向用户的硬编码文案。
2. 按 `模块.子模块.具体含义` 新增语义 key，例如 `applicationDetail.actions.approve`。复用通用文案时使用 `common.*`。
3. 同时更新三份 JSON；中文保留业务原意，英语和印尼语使用自然、简洁的产品文案。
4. 在组件或工具函数中引入 `$i18n`，把显示文案改为 `$i18n.t("key", "中文默认文案")`。带变量时使用 `$i18n.t("key", { count })`。
5. 对日期、数字、Ant Design 组件使用 `@/i18n` 导出的当前语言配置，不另行硬编码 locale。
6. 运行 `npm run i18n:validate`、相关 Vitest 和 `npm run build`。
7. Review diff，确认三语 key 对齐，且没有误改运行时协议值。

## 校验标准

- `npm run i18n:validate` 必须通过：三份语言包 key 完全一致、值非空、插值变量一致，且代码引用的静态 key 均存在。
- `npm run i18n:scan` 是候选清单，不可机械地全部替换；逐条按翻译边界判断。
- 新增或修改页面时，应添加至少一项验证该模块关键英语和印尼语文案的测试。
- 不以中文 fallback 代替缺失语言包；fallback 只用于异常情况下的可读性。

## 示例

```tsx
import { $i18n } from "@/i18n";

<Button>{$i18n.t("common.save", "保存")}</Button>;
$i18n.t("applicationList.total", { count: 12 });
```
