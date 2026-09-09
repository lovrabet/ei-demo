# 多语言架构与实现方案

本文面向继续维护 `ei-demo` 多语言能力的前端开发者，说明当前国际化架构、运行流程、词包约定、工程工具和扩展方式。

当前实现支持：

- 简体中文：`zh-CN`
- 英语：`en-US`
- 印尼语：`id-ID`

首个完整版本随 `ei-demo@1.1.8` 发布。具体代码变更见提交 [`45e1572`](https://github.com/lovrabet/ei-demo/commit/45e157222d33cf53f09e1909cb9003ed896daabe)，本文不重复逐文件罗列该提交的 diff。

## 1. 目标与边界

本次改造的目标是让语言能力成为应用级基础设施，而不是由各页面分别维护：

- 所有页面共用一个 i18n 实例和同一组语言状态。
- 应用文案、Ant Design 内置文案和 dayjs 日期区域保持一致。
- 独立运行和作为 Lovrabet 微前端运行时采用相同的初始化方式。
- 中文、英语、印尼语词包同步维护，并通过脚本阻止缺键、空值和插值参数漂移。
- 只翻译用户可见文案，不修改路由、状态码、字段名和前后端协议值。

业务数据如果只有稳定 code，前端应使用 code 映射到翻译文案；不得让翻译后的展示文本参与条件判断、请求参数或状态流转。

## 2. 总体架构

```mermaid
flowchart LR
    A[Lovrabet 主应用语言 Cookie] --> B[@lovrabet/i18n]
    B --> C[src/i18n/index.ts]
    D[src/locales 三语词包] --> C
    C --> E[$i18n.t 业务文案]
    C --> F[Ant Design ConfigProvider]
    C --> G[dayjs locale]
    C --> H[HTML lang 属性]
    C --> I[顶部语言选择器]
    I --> J[$i18n.setLang]
    J --> K[刷新页面]
    K --> B
```

核心模块如下：

| 模块 | 职责 |
| --- | --- |
| [`src/i18n/index.ts`](../src/i18n/index.ts) | 声明支持语言、初始化 `$i18n`、检测当前语言、映射 Ant Design/dayjs locale、提供切换方法 |
| [`src/locales/index.ts`](../src/locales/index.ts) | 汇总三份业务词包并交给 `@lovrabet/i18n` |
| `src/locales/*.json` | 保存中文、英语和印尼语文案 |
| [`src/main.tsx`](../src/main.tsx) | 把当前语言应用到 Ant Design、dayjs 和 HTML 文档 |
| [`src/layouts/MainLayout.tsx`](../src/layouts/MainLayout.tsx) | 提供用户可见的语言切换入口 |
| [`scripts/i18n-check.mjs`](../scripts/i18n-check.mjs) | 校验词包与代码静态引用，并扫描疑似未翻译中文 |
| [`.agents/skills/yuntoo-ei-i18n/SKILL.md`](../.agents/skills/yuntoo-ei-i18n/SKILL.md) | 约束后续 Agent 的翻译范围、实施步骤和验收标准 |

## 3. 运行时初始化

### 3.1 统一实例

应用只在 `src/i18n/index.ts` 创建一个 `I18n` 实例：

```ts
setConfig({ langList: ["zh-CN", "en-US", "id-ID"] });

export const $i18n = new I18n({
  locale: locales,
  componentName: APPLICATION_CODE,
  packageName: APPLICATION_PACKAGE,
});
```

`setConfig` 必须先于 `new I18n()` 执行。页面和业务模块统一从 `@/i18n` 导入 `$i18n`，不得自行创建第二个实例或维护另一份语言状态。

### 3.2 语言检测

`@lovrabet/i18n` 通过全局语言 Cookie 与 Lovrabet 主应用保持一致。应用启动时调用 `$i18n.getLang()`，再经过本地白名单校验：

- 检测到 `zh-CN`、`en-US` 或 `id-ID` 时直接使用。
- 检测到不支持的语言时回退到 `zh-CN`。
- `allowLangs` 也会再次过滤，只向用户展示当前应用真正支持的语言。

### 3.3 组件库、日期与文档语言

当前语言在应用渲染前同步到三处：

1. `ConfigProvider locale={antdLocale}`：切换 Ant Design 表格、分页、日期组件等内置文案。
2. `dayjs.locale(dayjsLocale)`：统一日期区域设置，其中中文映射为 `zh-cn`，印尼语映射为 `id`。
3. `document.documentElement.lang = currentLanguage`：让浏览器和辅助技术识别页面语言。

目前三种语言均为从左到右书写，因此 `document.documentElement.dir` 固定为 `ltr`。

## 4. 语言切换方案

顶部导航通过 `allowLangs` 生成语言菜单。用户选择语言后执行：

```ts
export function setApplicationLanguage(language: TLanguage) {
  if (!isSupportedLanguage(language)) return;
  $i18n.setLang(language);
  window.location.reload();
}
```

这里采用“持久化语言后刷新页面”的方案，而不是运行时逐组件热切换。原因是当前大量枚举标签和配置对象会在模块加载时调用 `$i18n.t()`，完整刷新可以保证这些模块级常量、Ant Design locale、dayjs locale 和页面文案在同一个生命周期内保持一致。

该方案实现简单且状态可靠，代价是切换语言会产生一次整页刷新。若未来改成无刷新切换，需要同时改造模块级翻译常量、应用状态订阅、Ant Design/dayjs 更新机制，并补充跨页面回归测试。

## 5. 业务文案接入

### 5.1 基本写法

用户可见文案使用语义化 key，并保留中文默认文案：

```tsx
import { $i18n } from "@/i18n";

<Button>{$i18n.t("common.save", "保存")}</Button>;
```

带动态值时，在三份词包中使用同名占位符：

```tsx
$i18n.t("applicationList.total", { count });
```

中文默认文案只用于异常情况下保持可读性，不能替代三份词包中的正式条目。

### 5.2 Key 设计

Key 按“模块、子模块、具体含义”组织，例如：

- `common.save`
- `nav.approvalCenter`
- `applicationDetail.status.approved`
- `expenseForm.validation.amountRequired`

通用动作和状态优先复用 `common.*`；业务含义不同的同名中文不得为了减少 key 而强行复用。

词包允许平铺 dotted key 与嵌套对象并存，校验脚本会在比较前将其递归展开。中文词包是键集合基准，英语和印尼语必须具有完全相同的展开后 key。

### 5.3 翻译边界

应翻译：

- 页面标题、按钮、导航、表格列名和筛选项。
- 表单标签、占位符、校验提示和错误提示。
- 空状态、确认提示、状态展示和打印文案。
- 对最终用户可见的附件、合同、付款、报销等业务标签。

不应翻译：

- 路由、URL、AppCode、Dataset code 和数据库字段名。
- `bizType`、workflow status、action 等稳定枚举值。
- BFF 名称、参数名、请求值和前后端通信协议。
- 仅用于日志定位、测试契约或开发说明的内部文本。

日期、数字和金额应依据 `currentLanguage` 格式化；例如列表金额使用 `toLocaleString(currentLanguage)`，避免继续固定使用中文区域格式。

## 6. 词包维护工具

`package.json` 提供四个命令：

| 命令 | 用途 |
| --- | --- |
| `npm run i18n:validate` | 校验三语 key、非空值、插值占位符和代码中的静态引用 |
| `npm run i18n:scan` | 在完整校验后，列出疑似仍含用户可见硬编码中文的代码行 |
| `npm run i18n:merge` | 将 `scripts/i18n-entries/*.json` 的批量条目合并到三份词包并稳定排序 |
| `npm run i18n:missing` | 从常见 `$i18n.t`/辅助函数调用中查找中文词包缺失 key |

### 6.1 完整性校验

`i18n:validate` 会执行以下检查：

1. 三份语言文件均存在且 JSON 可解析。
2. 展开后的值必须是非空字符串。
3. 英语、印尼语与中文的 key 集合完全一致。
4. 同一个 key 在三种语言中的 `{placeholder}` 集合一致。
5. 代码里直接使用的静态 `$i18n.t("key")` 必须能在词包中找到。

截至 `1.1.8`，校验结果为 3 种语言、3730 个展开后 key、167 个被静态检测到的引用 key。

### 6.2 扫描与批量合并

`i18n:scan` 是启发式候选扫描器，会排除测试、API 客户端、词包和已位于 `$i18n.t()` 调用范围内的行。扫描结果必须人工判断，不能机械替换，因为中文字符串也可能是协议值或内部标识。

大规模改造时，可以先把 `{ key, zh, en, id }` 条目按模块写入 `scripts/i18n-entries/*.json`，再运行 `i18n:merge`。合并器会：

- 同时写入三份词包。
- 检查批次之间同 key 的中文冲突。
- 保留已有翻译，不覆盖已存在的 key。
- 按 key 排序，降低后续 diff 噪声。

## 7. 设计决策与权衡

| 决策 | 收益 | 代价或注意事项 |
| --- | --- | --- |
| 使用 `@lovrabet/i18n` 和全局 Cookie | 与主应用语言保持一致，微前端和独立运行共用实现 | 依赖平台语言 Cookie 契约 |
| 只创建一个 `$i18n` 实例 | 避免语言状态分叉，页面接入方式统一 | 所有模块必须从 `@/i18n` 导入 |
| 明确三语白名单 | 不会误展示没有完整词包的语言 | 新增语言必须同时修改白名单、词包和 locale 映射 |
| 切换语言后刷新 | 模块级常量、组件库和日期状态能够一次性一致更新 | 用户会经历一次页面刷新 |
| 中文作为 key 集合基准 | 贴合当前业务文案维护流程 | 不能只补英语或印尼语而不补中文 key |
| 翻译调用保留中文 fallback | 词包异常时页面仍可读 | fallback 不得掩盖缺失词包，发布前仍必须校验 |
| 静态脚本作为质量门禁 | 无需引入完整测试框架即可阻止常见词包错误 | 动态 key、包装函数和语义翻译质量仍需人工 Review |

## 8. 新增或修改文案的标准流程

1. 运行 `npm run i18n:scan`，定位候选硬编码文案。
2. 判断字符串是否属于用户可见展示层，确认不是运行时协议值。
3. 设计语义化 key；通用文案优先复用 `common.*`。
4. 同时补齐 `zh-CN`、`en-US`、`id-ID`，并保持插值占位符一致。
5. 在代码中从 `@/i18n` 导入 `$i18n`，替换展示文案。
6. 日期、数字或组件库文案需要区域化时，复用 `currentLanguage`、`antdLocale` 和 `dayjsLocale`。
7. 运行 `npm run i18n:validate` 和 `npm run build`。
8. Review diff，重点确认没有翻译路由、状态码、字段名或请求参数。

如果变更覆盖关键业务路径，还应人工切换三种语言，检查页面布局、长文本折行、表单校验、弹窗、打印视图和导出内容。

## 9. 发布与验证

生产构建通过 `CDN_DOMAIN` 生成版本化资源路径：

```bash
CDN_DOMAIN=https://g.lovrabet.com/ npm run build
```

当前版本的 CDN 资源和线上菜单切换过程已经完成，发布操作细节由 `lovrabet-cdn-menu-release` Skill 管理。后续发布应继续遵循“校验 → 构建 → 上传 CDN → 验证资源 → 菜单 dry-run → 更新既有资源 → 线上回查”的顺序。

## 10. 已知限制与后续建议

- `currentLanguage` 是应用启动时计算的常量，因此当前必须刷新页面才能完整切换语言。
- 静态校验只保证词包结构和可识别引用正确，不能评价翻译是否自然、业务术语是否统一。
- 包装函数、动态 key 和运行时拼接 key 不一定能被静态正则完整识别，需要人工 Review。
- `i18n:scan` 只能给出疑似硬编码中文，可能包含合理的协议文本或漏掉非中文硬编码文案。
- 当前 `package.json` 没有自动化 UI 测试脚本；关键页面的三语布局和交互仍需人工回归。
- 如果新增 RTL 语言，需要把固定的 `dir="ltr"` 改造成按语言映射，并检查全部布局。

建议下一阶段补充：

1. 核心页面的英语和印尼语渲染测试。
2. 产品术语表及翻译 Review 责任人。
3. CI 中的 `npm run i18n:validate` 与生产构建门禁。
4. 长文本、打印视图和导出文件的多语言视觉回归。

## 11. Suggested Skills

后续 Agent 接手相关工作时，建议按任务选择：

- `$yuntoo-ei-i18n`：新增或审查三语文案、维护词包、确认翻译边界。
- `$lovrabet-cdn-menu-release`：构建版本化资源、发布 CDN、更新并验证既有菜单资源。
- `$codeup-push`：提交并同步 Codeup/GitHub，输出变更与验证摘要。
- `$documentation`：更新本文档或补充面向开发者的架构、维护和发布说明。
