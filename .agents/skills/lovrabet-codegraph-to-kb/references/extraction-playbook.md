# 代码知识挖掘 Playbook（五透镜）

从代码挖掘"数据集元数据没有的业务知识"。数据集一般只记录字段、类型、基础关联；以下五类语义只存在于代码和运行态数据里。按透镜逐一抽取，每个透镜产出一个候选知识库主题。

## Lens 0：索引确认（前置）

1. `codegraph_status` 看索引文件数；`codegraph_files --path <目录>` 验证目标目录（尤其 `.rabetbase/`）已被索引。
2. 未覆盖时检查 `.gitignore` 是否忽略了该目录；codegraph 的 watcher 通常跟随 gitignore。
3. 无 codegraph 环境时降级：`find .rabetbase -type f` + `grep` + Read，方法论不变。

## Lens 1：实体-数据集映射

**抽什么**：业务键 ↔ 数据集名 ↔ 数据表 ↔ 数据集 code；模型键约定（如 `dataset_<code>`）；主单展示字段约定（标题/状态/金额/申请人列名）。

**怎么抽**：

```bash
grep -rn 'DATASET_CODES\|const DATASETS' .rabetbase/bff/ --include='*.js' -A 25
```

- 优先找"映射型"COMMON（如 *DatasetMap），它是单一事实源；各 ENDPOINT 内联的 DATASET_CODES 作为补充域（法务、报价等）。
- 注意 code 是否带 `dataset_` 前缀，两种形态都要记录。
- `.rabetbase/sql/**/*.sql` 头部注释有 sqlCode/sqlName/dbId，抽成自定义 SQL 清单。

## Lens 2：BFF 业务目录

**抽什么**：每个 ENDPOINT/COMMON 的业务语义、入参、返回、编排约束。

**怎么抽**：批量提取脚本头 doc 块：

```bash
for f in .rabetbase/bff/app-*/ENDPOINT/*.js .rabetbase/bff/app-*/COMMON/*.js; do
  echo "=== $f ==="; awk '/^\/\*\*/,/\*\//' "$f" | head -30
done
```

- 关注 `[脚本描述]`、`[接口路径]`、`[HTTP 请求体参数]`、`[返回数据结构]` 标记。
- **必抽平台编排约束**：COMMON→COMMON 禁互调、ENDPOINT→ENDPOINT 禁互调、leaf COMMON 清单——这类约束只在注释里，是"为什么这么拆"的答案。
- 按业务域分组（生命周期/查询/关联/规则……），不要按字母序平铺。

## Lens 3：流程与状态机

**抽什么**：每个业务类型的状态流转全图、动作清单、任务类型、角色、副作用。

**怎么抽**：

- 找 workflow 配置读取器（如 *WorkflowConfig）：区分**数据驱动层**（步骤配置表生成 submit/review 动作）与**代码内置层**（STATIC_ACTIONS 收尾动作）。两层都要画，只画一层会误导。
- 用 ASCII 图画每个 bizType 的 `from --action--> to`，标注生成的任务类型与角色、同步更新的字段（如 bank_status）、终态。
- 申请人自助动作（撤回/作废）单独成节：允许条件 + 副作用（释放关联、保留票据）。
- 留痕约定：流水表字段、时间线由哪个接口聚合。

## Lens 4：门禁与权限

**抽什么**：直写封堵表、平台删除语义、行级可见性、更新守卫、审计写保护、错误码。若删除由 Lovrabet 系统字段自动维护，应明确记录“业务代码不得读写该字段”，不要把旧兼容逻辑当成现行架构。

**怎么抽**：

- HOOK 矩阵来自目录结构本身：`find .rabetbase/bff/app-*/HOOK -name '*.js'`，按 `<dataset>/<operation>/<timing>` 归纳。先总结**基线**（每个数据集都有的钩子），再列**超基线**的特殊钩子——矩阵全量平铺不可读。
- 守卫型 COMMON（*Guard）：直写封堵的"正确写入口"提示、读全量白名单分类、更新权限规则，逐个抽。
- **必须声明权限边界**：代码层（HOOK/BFF 守卫，绕不过）vs 平台层（角色-菜单-API、row-roles，不在仓库内）。只声明边界存在，不猜平台层配置内容。
- 错误码表：从 guard 脚本的 throw 语句抽 `ERROR_CODE` → 含义 → 处理建议。

## Lens 5：枚举与字典

**抽什么**：字典分类全集（category → code=label）、代码内置枚举规则、权限白名单成员。

**怎么抽**：

```bash
lovrabet data filter --appcode <app> --code <字典数据集code> \
  --params '{"select":["category","code","label"],"pageSize":500}' \
  --format compress
```

- 运行态数据是**快照**，文档头部必须标注拉取日期并声明"字典可由业务后台修改，需要定期重拉同步"。
- 代码内置规则（如 RELATION_RULES 可关联对象白名单）与字典分开列——改字典不生效的那些必须标"需改代码"。
- 前端下拉若统一走字典接口（如 *GetDictionaryOptions），写一句"前端不硬编码枚举"的结论即可，不必平铺前端 options。

## 写作规范（所有产出条目共用）

1. **一个主题一篇**，标题稳定（更新靠标题匹配旧条目）。
2. 开头引用块：来源（仓库/目录/数据源）、应用 appcode、挖掘日期。
3. 表格优先；状态机用 ASCII 图；错误码必带处理建议。
4. 推断性结论显式标注"（推断）"；代码没写的语义不补脑。
5. 不写明文凭证、AccessKey、签名 URL。
6. 结尾给"同步策略"：本篇数据源是什么、何时需要重跑。

## 入库规范

1. staging：`.lovrabet/kb/<kebab-topic>.md`。
2. `kb list` 按标题匹配：已存在 → `kb detail` 后 `kb update --id`；不存在 → `kb create`。先 `--dry-run`，用户确认后正式执行。
3. 轮询 `ragStatus` 至 READY；`kb search` 用条目核心关键词验证命中。
4. 记录映射：KB id ↔ 标题 ↔ 本地文件 ↔ 数据源（写入项目 memory 或仓库映射文档）。
5. 增量同步：代码 diff 只重挖受影响透镜；运行态数据类条目（Lens 5）按快照日期定期重拉。
