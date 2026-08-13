---
name: lovrabet-codegraph-to-kb
displayName: 代码知识挖掘入库
description: "从 Lovrabet 应用的源码仓库（.rabetbase 的 BFF/SQL/page 与业务源码）经 CodeGraph 索引挖掘数据集元数据缺失的业务知识——实体-数据集映射、BFF 业务目录、工作流状态机、写入门禁与权限、枚举字典——结构化上传到应用知识库并验证检索。触发词：代码挖掘知识库、codegraph 知识库、从代码抽取业务知识、同步知识库、数据集缺少业务语义。不用于：直接读写业务数据、管理平台角色/菜单权限、替代 dataset detail 查字段结构。"
example: "把这个应用的代码业务知识挖掘并同步到知识库"
metadata:
  type: write
---

# lovrabet-codegraph-to-kb 代码知识挖掘入库

## 内部要求

执行前必须读取并遵守 [runtime-contract.md](references/runtime-contract.md) 和 [output-contract.md](references/output-contract.md)。挖掘方法论细节读取 [extraction-playbook.md](references/extraction-playbook.md)。

## 使用边界

- 能做：从代码仓库挖掘业务语义知识，生成结构化 Markdown，经 `lovrabet kb create/update` 写入目标应用的 personal 知识库，并验证 RAG 检索可用。
- 不能做：不写任何业务数据（data create/update/delete 一律禁止）；不管理平台侧角色-菜单-API 权限（只声明边界）；不杜撰代码中不存在的业务语义（推断必须显式标注）；正文不写明文凭证、AccessKey、签名 URL。

## 输入门禁

缺任一项必须停止并报告 blocked：

1. **代码源**：当前工作目录是含 `.rabetbase/`（或用户指定的源码目录）的仓库；
2. **目标应用**：明确的 `--appcode`（用户给出，或从 `.rabetbase.json` 的 apps/defaultApp 解析，或 `lovrabet app list` 语义匹配后向用户确认）；
3. **入库授权**：用户明确要求"上传到知识库/同步知识库"。只挖掘不入库时，止于 dry-run 输出。

## 与现有能力集成

- **CodeGraph MCP**（codegraph_status / codegraph_files / codegraph_explore / codegraph_search）：确认索引覆盖、定位符号与文件；无 codegraph 时降级为 grep/find + Read。
- **lovrabet kb list/create/update/search/detail**：知识库写入与验证，全部命令带 `--appcode <目标应用>`。
- **lovrabet data filter**：实拉运行态字典/配置数据（枚举透镜）；只读。
- 本地文件仅用于 staging：`.lovrabet/kb/<topic>.md`。

## 平台能力优先

知识库写入、字典数据读取、检索验证一律走 lovrabet 平台命令。本地脚本只允许做：文本抽取（grep/awk 提取脚本头注释）、格式整理、HOOK 目录矩阵统计。不得用本地脚本模拟 kb 写入或绕过 dry-run 确认。

## 第三方服务边界

不调用任何第三方服务。知识正文来源于代码与平台运行态数据，涉及具体用户ID/姓名白名单时按"用户自己系统的业务数据"处理，可写入但不扩散到其他应用。

## SOP 工作流

1. **dry-run（挖掘 + 预览）**：按 extraction-playbook 五透镜挖掘 → 生成 `.lovrabet/kb/*.md` → `lovrabet kb list --appcode <app>` 按标题判断 create 还是 update（update 先 `kb detail`）→ 每条跑 `kb create/update --dry-run` → 向用户展示条目清单与摘要。**此阶段不写入。**
2. **用户确认**：用户明确说"上传/提交/确认"后才进入写入；确认范围是本次 dry-run 展示的条目全集或子集。
3. **confirmed 写入**：逐条执行正式 `kb create`（新主题）或 `kb update --id <id>`（已有条目，保持 id 稳定）。记录返回的 id 与 version。
4. **只读核对**：轮询 `kb list` 直到每条 `ragStatus=READY`（PENDING/INDEXING 需等待，`ragErrorMessage` 非空按失败处理）；再 `kb search --query <核心关键词>` 验证命中，报告 score。
5. **checkpoint**：把 KB id ↔ 本地文件 ↔ 数据源的映射写入项目 memory（或仓库内映射文档），供增量同步复用。

## 业务状态流转

知识库条目状态：`none → create(PENDING) → INDEXING → READY`。READY 前不得声称检索可用；`ragErrorMessage` 非空 → needs_manual_check，报告错误并建议产品界面处理。KB 无删除命令，废弃条目提示用户到产品界面删除。

## 展示规范

最终输出按 output-contract：status / mode / summary / scope / changes / verification / warnings / errors / nextActions。changes 列每条 KB 的 id、标题、version、ragStatus；verification 列 kb search 命中结果。部分条目失败 → partial_success，失败的进 errors 和 nextActions。

## 失败恢复

- 某条 create/update 失败：记录失败条目，其余继续；不得对同标题重复 create（先 `kb list` 确认是否已写入成功）。
- ragStatus 长时间非 READY：`kb detail --id <id>` 查看 ragErrorMessage，报告 needs_manual_check。
- 重跑挖掘是幂等的：同一数据源重新生成 md 后 `kb update --id` 覆盖即可，条目 id 不变。
