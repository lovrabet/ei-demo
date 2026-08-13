# 运行时契约

本 Skill 面向启智云图企业智能系统应用 `app-4d050189`。身份、权限、当前处理人和流程状态均以 Backend Function 的实时校验为准。

## 核心关系

- 待办任务通过 `biz_type + biz_id` 关联业务主记录。
- `biz_task` 表示流程步骤；`biz_action_record` 表示已发生的流程动作。
- `biz_relation` 连接合同、付款、发票、报销等业务对象。
- 附件、发票关联、费用明细、薪资明细、合同付款计划等由业务时间线聚合读取。
- 内部 ID 只用于 API 参数、数据关联和幂等校验，不能作为面向用户的名称。

不得绕过这些关系猜测数据，也不得用业务标题反查后直接修改底表。

## 读取本人待办

```bash
lovrabet bff exec cpoGetMyTodoList \
  --appcode app-4d050189 \
  --params '{"page":1,"pageSize":100}' \
  --format json
```

可选参数：

- `bizType`：限定业务类型；
- `page`：从 1 开始；
- `pageSize`：分页大小。

响应包含 `paging` 和 `tableData`。必须依据 `totalCount` 完整翻页，不能只读取第一页。服务端会按当前登录用户筛选待办，并排除业务主记录已不存在的任务。

每条待办包含任务数据和 `bizSummary`。面向用户使用 `bizSummary.title`、`applicantName`、`amount`、`statusLabel` 等业务字段；若标题缺失，显示“关联对象标题缺失”，不能使用 `#<id>` 兜底。

## 读取业务时间线

```bash
lovrabet bff exec cpoGetBizTimeline \
  --appcode app-4d050189 \
  --params '{"bizType":"<bizType>","bizId":"<bizId>"}' \
  --format json
```

重点响应字段：

- `biz`、`summary`：业务主记录和摘要；
- `tasks`、`actions`、`currentTask`：流程任务和动作历史；
- `canAct`、`availableActions`：当前用户是否可办理及可用动作；
- `attachments`、`invoiceLinks`：附件和发票关联；
- `expenseItems`、`salaryItems`、`contractPaymentPlans`：业务明细；
- `businessContext.metrics`、`businessContext.risks`、`relatedDocuments`：聚合指标、已有风险线索和关联单据；
- `related`：伙伴、合同、付款计划、银行回单等关联对象。

候选任务只有在 `currentTask.id` 与待办任务一致、`canAct=true` 且可用动作包含目标动作时才可办理。任务、金额、申请人、附件或风险状态发生变化时，必须重新形成建议。

## 报销专项读取

需要核对适用报销规则时：

```bash
lovrabet bff exec cpoListEffectiveExpenseRules \
  --appcode app-4d050189 \
  --params '{}' \
  --format json
```

需要核查发票重复时，优先按报销申请读取：

```bash
lovrabet bff exec cpoCheckInvoiceDuplicates \
  --appcode app-4d050189 \
  --params '{"expenseId":"<expenseId>"}' \
  --format json
```

也可在只有发票号时传 `invoiceNos`。重复检查不可用或台账覆盖不足时，结论只能是“未完成重复核验”，不能写“已确认无重复”。

## 推进工作流

```bash
lovrabet bff exec cpoAdvanceWorkflow \
  --appcode app-4d050189 \
  --params '{
    "bizType":"<bizType>",
    "bizId":"<bizId>",
    "taskId":"<taskId>",
    "action":"review_pass",
    "comment":"<审批意见>",
    "payload":{}
  }' \
  --format json
```

本 Skill 可使用的动作只有：

- `review_pass`：用户确认后通过；
- `review_reject`：用户逐项明确确认并给出理由后拒绝。

服务端会校验当前状态、当前任务、当前处理人、动作范围和下一处理人。出现 `TASK_ASSIGNEE_MISMATCH`、状态冲突、动作不可用等错误时，停止该批次后续写入并重新读取。

## 安全与恢复

- 单批最多 20 条，严格串行执行。
- 每条写前重新读取，每条写后立即验证。
- 不对写操作盲目重试；先确认服务端是否已经成功推进。
- 不直接更新业务主表、任务表、动作表或系统字段。
- `is_deleted` 是 Lovrabet 自动维护的系统字段；Instant API 的删除走平台 delete。只有明确绕过 Instant API 的底层 SQL 才可按数据库语义读取该字段，本 Skill 不使用 SQL 修改它。
- 命令或脚本不得持久化口令、令牌、完整 DSN 或临时客户端配置。
