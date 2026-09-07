# 运行时契约

本 Skill 面向启智云图企业智能系统应用 `app-4d050189`。身份、权限、当前处理人和流程状态均以 Lovrabet 平台 Flow 的实时校验为准。

## 核心关系

- 待办、已办和审批动作均来自 Lovrabet 平台 Flow API；不读取或写入 `biz_task`。
- `biz_action_record` 只保留业务审计用途，不作为工作流状态机。
- `biz_relation` 连接合同、付款、发票、报销等业务对象。
- 附件、发票关联、费用明细、薪资明细、合同付款计划等由业务时间线聚合读取。
- 内部 ID 只用于 API 参数、数据关联和幂等校验，不能作为面向用户的名称。

不得绕过这些关系猜测数据，也不得用业务标题反查后直接修改底表。

## 读取本人待办

打开应用 `/my-todo` 页面读取平台 Flow 待办；页面调用平台 `/api/approve/todo`，并按 Dataset 与业务 ID 批量补充业务摘要。不得调用旧的自建待办 Backend Function，也不得用业务表状态推断当前处理人。

## 读取业务时间线

```bash
lovrabet bff exec cpoGetBizTimeline \
  --appcode app-4d050189 \
  --params '{"bizType":"<bizType>","bizId":"<bizId>"}' \
  --format json
```

重点响应字段：

- `biz`、`summary`：业务主记录和摘要；
- 平台 Flow 面板：流程节点和动作历史；
- `attachments`、`invoiceLinks`：附件和发票关联；
- `expenseItems`、`salaryItems`、`contractPaymentPlans`：业务明细；
- `businessContext.metrics`、`businessContext.risks`、`relatedDocuments`：聚合指标、已有风险线索和关联单据；
- `related`：伙伴、合同、付款计划、银行回单等关联对象。

只有平台待办页当前仍显示为本人可办理的任务才可操作。任务、金额、申请人、附件或风险状态发生变化时，必须重新形成建议。

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

审批只能在 Lovrabet 平台 `/my-todo` 页面调用平台 `/api/flow/approve` 完成。通过和拒绝都必须逐项获得用户明确确认；平台会校验当前任务、当前处理人和流程状态。出现任务已被办理、处理人变化或状态冲突时，停止本批次剩余操作并重新读取待办。

## 安全与恢复

- 单批最多 20 条，严格串行执行。
- 每条写前重新读取，每条写后立即验证。
- 不对写操作盲目重试；先确认服务端是否已经成功推进。
- 不直接更新业务主表、平台流程数据、审计表或系统字段。
- `is_deleted` 是 Lovrabet 自动维护的系统字段；Instant API 的删除走平台 delete。只有明确绕过 Instant API 的底层 SQL 才可按数据库语义读取该字段，本 Skill 不使用 SQL 修改它。
- 命令或脚本不得持久化口令、令牌、完整 DSN 或临时客户端配置。
