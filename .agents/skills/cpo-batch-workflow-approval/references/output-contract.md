# 输出契约

所有结果必须明确“仅核查、未执行”或“已执行”，避免用户误认为建议已经生效。

## 统一结构

```json
{
  "status": "success | no_op | partial_success | blocked | failed | needs_manual_check",
  "mode": "read_only | dry_run | confirmed",
  "summary": "面向用户的简洁摘要",
  "confirmationRequired": true,
  "scope": {
    "total": 0,
    "eligible": 0,
    "approveRecommended": 0,
    "askFirst": 0,
    "rejectRecommended": 0,
    "notEligible": 0
  },
  "approvalPlan": [],
  "changes": [],
  "verification": [],
  "warnings": [],
  "errors": [],
  "nextActions": []
}
```

第一阶段使用 `read_only` 或 `dry_run`，`confirmationRequired=true`，`changes` 为空，并明确“尚未审批”。第二阶段仅在用户明确确认后使用 `confirmed`。

## 逐项审批计划

`approvalPlan` 每项包含：

```json
{
  "businessType": "合同申请",
  "title": "某某服务合同审批",
  "applicant": "申请人姓名",
  "amount": "¥10,000.00",
  "recommendation": "approve_recommended | ask_first | reject_recommended | not_eligible",
  "riskLevel": "none | low | medium | high | critical | unknown",
  "findings": ["已核实的事实或风险线索"],
  "questions": ["需要补充确认的问题"],
  "proposedAction": "review_pass | review_reject | none",
  "proposedComment": "拟写入流程的审批意见"
}
```

不得把数据库主键、内部任务 ID 或 `#<id>` 作为标题、标签或兜底值。没有标题时显示“关联对象标题缺失”并列为数据质量问题。

## 执行结果

`changes` 每项使用业务标题说明：

- 执行了什么动作；
- 流程返回的新状态；
- 审批意见摘要。

`verification` 记录写后读取到的事实，例如“原待办已移出本人待办”“动作记录已生成”“下一步骤已创建”。不要只复述 BFF 返回“成功”。

出现部分成功时：

- `status=partial_success`；
- 分开列出已成功、失败、尚未执行；
- `confirmationRequired=true`；
- 告知用户已停止后续办理，需要重新核查后再确认。

无符合条件的本人审批待办时使用 `no_op`，不得将他人的待办或操作型任务补入结果。

## 面向用户的推荐顺序

1. 一句话说明核查数量及是否执行；
2. 建议直接通过项；
3. 需要先询问项及具体问题；
4. 建议拒绝项及原则性原因；
5. 不可办理项；
6. 精确确认问题，例如“是否通过以上 3 条建议直接通过项？”；
7. 执行后再给逐条验证结果。

合同风险必须在摘要中显著展示；报销的轻微提醒可简洁呈现，但不能隐藏原则性问题。
