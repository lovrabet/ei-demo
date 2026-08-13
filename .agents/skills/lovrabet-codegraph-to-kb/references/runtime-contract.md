# Runtime Contract

Skill push 后的 zip 包就是完整交付产物。lovrabet-codegraph-to-kb 的所有必读规则必须位于 SKILL.md 或 references/ 内。

## 必读文档

- [SKILL.md](../SKILL.md)
- [runtime-contract.md](runtime-contract.md)
- [output-contract.md](output-contract.md)

## 主边界

- 不得依赖 Skill 目录外的仓库文件、绝对路径、file URL 或本机专属配置。
- 文档中的缓存路径、安装路径、示例路径或排障路径不等于运行时包外依赖；只有明确要求读取、链接或执行包外内容时才属于自包含风险。
- 如需承接仓库规范，必须把必要规则内化到本 Skill 包内的 references/ 文件中。
- type=write 只作为模板选择器，不替代业务权限、风险等级和用户确认。

## 运行态入口

- `lovrabet kb list/detail/create/update/search --appcode <app>`：知识库写入与验证的唯一入口。
- `lovrabet data filter --appcode <app> --code <字典数据集code>`：枚举透镜的运行态数据实拉，只读。
- CodeGraph MCP 工具（codegraph_status/files/explore/search）：代码索引查询；不可用时降级为本地 grep/find + Read，降级必须在输出 warnings 中声明。
- 本地文件仅 staging：`.lovrabet/kb/*.md`（挖掘产物）、`.agents/skills/lovrabet-codegraph-to-kb/`（本 Skill 包）。除这两类外不读写包外文件。

## 凭证与登录态

本 Skill 不接触任何第三方凭证。lovrabet CLI 的 AccessKey 由用户本地配置（`.lovrabet.json` / 环境变量）托管，Skill 不读取、不回显、不写入知识正文。

## 第三方候选资产

不调用第三方生成类服务。知识正文完全来自代码与平台运行态数据；推断性结论在正文中显式标注"（推断）"，由用户人工审核后才允许入库。

## 预览 / 写入 / 核对差异

固定顺序：挖掘并生成本地 md → `kb list` 匹配旧条目 → 每条 `kb create/update --dry-run` 预览 → 用户确认 → 正式写入 → 轮询 ragStatus 至 READY → `kb search` 验证命中。dry-run 阶段不写入任何远端内容。

## 状态读回与未知状态处理

条目状态事实源是 `kb list/detail` 返回的 `ragStatus` 与 `ragErrorMessage`（PENDING → INDEXING → READY）。READY 之前不得声称检索可用；ragErrorMessage 非空或长时间停在 INDEXING → needs_manual_check，报告错误信息并建议产品界面处理，不擅自重试覆盖。


## 返回契约

最终输出必须遵守 [output-contract.md](output-contract.md)。本文件只补充运行态安全约束；展示字段、状态枚举、失败暴露和人工处理项以 output-contract.md 为准。

## 失败恢复

- 单条写入失败：记录该条目错误，其余条目继续；重跑前先 `kb list` 按标题确认是否已部分成功，禁止对同标题重复 create。
- 挖掘中断：本地 `.lovrabet/kb/*.md` 已生成部分可保留，重跑时整体重新生成并 `kb update --id` 覆盖（幂等，id 不变）。
- 索引/RAG 异常：`kb detail --id <id>` 取 ragErrorMessage 原样报告，进入 needs_manual_check，由用户在产品界面处理。

## 禁止事项

- 禁止链接或读取 Skill 目录外的 AGENTS.md、wiki、docs、脚本或个人路径作为运行时必读依赖。
- 禁止把说明性的缓存路径、安装路径、示例路径或排障路径包装成运行时必读依赖。
- 禁止在未确认影响范围时执行写入。
- 禁止隐藏失败或把未知状态描述为成功。
