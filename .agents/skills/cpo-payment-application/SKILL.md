---
name: cpo-payment-application
displayName: 付款申请助手
description: "在启智云图企业智能系统中创建、保存草稿、提交和查询商务付款申请。用户提供付款材料时必须主动上传、逐项关联申请单并清点数量；不得绕过受控 Backend Function 直接修改付款及银行状态。"
example: "按合同的首个待付款计划，帮我创建一份付款申请草稿"
metadata:
  type: write
---

# 付款申请助手

## 适用场景

当用户要新建、保存草稿、提交、查询启智云图企业智能系统的付款申请，或希望按合同付款计划发起付款时使用本 Skill。对应前端页面是 `/payment-form`，标准列表页提交后跳转到 `/ce56ba4ceec8471cbddf4068ea9c397a`。

## 后端边界

- AppCode：`app-4d050189`
- 主数据集：付款申请 `7da208a5059b4b13896d7c7ae29c8492`，表 `payment_application`
- 合同付款计划数据集：`08e17d8ba3a24e938fef89816c8f4ccb`，表 `contract_payment_plan`
- 合同申请数据集：`53869993f80f45ae8ef6cdf051d8e355`
- 商业伙伴数据集：`68c70907e27c481cbefb96dd3906936e`
- 附件数据集：`ab17964f0efd46f78cecb4969140f257`
- 创建/更新草稿只能调用 `cpoSaveDraft`
- 查询合同、付款计划、首个待付款计划和历史付款只能调用 `cpoGetContractPaymentContext`
- 合同草稿中的付款计划只能调用 `cpoSyncContractPaymentPlans` 同步
- 提交审批只能调用 `cpoSubmitApplication`
- 付款后续制单、提交银行、确认付款等动作只能调用 `cpoAdvanceWorkflow`
- 不要直接 update 付款申请的 `status`、`bank_status`、银行确认字段，也不要直接修改付款计划的 `status`、`linked_payment_application_id`、实付字段
- `is_deleted` 是 Lovrabet 平台系统字段，Skill、BF、Hook 和脚本不得读取、筛选、赋默认值或更新；删除业务记录时调用 Lovrabet `delete` 或受控 BF

## 允许写入字段

调用 `cpoSaveDraft` 时，`values` 只使用这些字段：

- `partner_id`：收款方商业伙伴 id
- `contract_id`：关联合同 id，可选
- `payment_plan_id`：合同付款计划 id，可选；传入后服务端校验其属于所选合同、未取消且仍允许付款。同一期允许分多笔付款申请
- `payment_type`：付款类型，值为 `contract_payment`、`reimbursement`、`vendor_payment`、`certification`、`cloud`、`telecom`、`other`
- `title`：付款标题，必填
- `amount`：付款金额，单位元
- `planned_amount_snapshot`：计划金额快照；传入付款计划后由服务端按计划值覆盖
- `currency`：默认 `CNY`
- `payment_phase_no`：付款期次
- `payment_phase_name`：期次名称
- `total_phase_count`：总期数
- `phase_trigger_condition`：触发条件
- `liaison_user_id`：接口人 id
- `liaison_name_snapshot`：接口人姓名快照
- `expected_pay_date`：预计付款时间，格式 `YYYY-MM-DD HH:mm:ss`
- `planned_pay_date_snapshot`：计划付款日快照；传入付款计划后由服务端按计划值覆盖
- `plan_variance_reason`：本次金额或日期与计划不一致时的原因
- `bank_account_snapshot`：收款银行账户快照
- `remark`：备注说明，可选

## 关联合同

付款表单只把状态为 `submitted`、`reviewed`、`signed` 的合同作为可选关联合同。选择合同后，必须先查询付款上下文：

```bash
lovrabet bff exec --appcode app-4d050189 --name cpoGetContractPaymentContext --params '{
  "contractId": 123
}'
```

响应包含：

- `plans`：合同的全部有效付款计划，按 `phase_no` 升序
- `pendingPlan`：第一个仍有未申请余额的 `pending` / `processing` 计划；创建付款时默认使用它
- `paymentHistory`：该合同的历史付款申请

如果合同明确 `payment_requirement=not_required`，不得为它创建合同付款。需要付款但尚未维护计划时，可先补齐计划；确属无合同临时付款时才创建不关联计划的付款申请。若用户明确选择其他仍有余额的计划，则使用所选计划，不要强制改回第一个。

合同下 0～N 个付款计划使用 `cpoSyncContractPaymentPlans` 保存：

```bash
lovrabet bff exec --appcode app-4d050189 --name cpoSyncContractPaymentPlans --params '{
  "contractId": 123,
  "plans": [
    {
      "phase_no": 1,
      "phase_name": "首付款",
      "planned_amount": 50000,
      "currency": "CNY",
      "planned_pay_date": "2026-08-31",
      "trigger_condition": "合同签署后",
      "status": "pending"
    }
  ]
}'
```

`status` 允许商务选择：

- `pending`：待支付，会进入自动付款队列
- `paid`：已支付，适用于合同申请前已经完成付款的情况
- `not_required`：无需支付

`processing` 和 `cancelled` 是系统内部状态，不能由合同保存请求创建。仅合同 `draft` / `rejected` 状态可同步计划；没有实际付款申请的 `pending` / `paid` / `not_required` 计划可继续修正或删除，已有实际付款的计划不能删除或改写。手工标记 `paid` 只记录计划事实，不创建虚假的付款申请历史。

## 创建草稿

```bash
lovrabet bff exec --appcode app-4d050189 --name cpoSaveDraft --params '{
  "bizType": "payment",
  "values": {
    "partner_id": 1001,
    "contract_id": 123,
    "payment_plan_id": 456,
    "payment_type": "contract_payment",
    "title": "XX 服务费首付款",
    "amount": 50000,
    "currency": "CNY",
    "expected_pay_date": "2026-08-31 00:00:00",
    "bank_account_snapshot": "开户行 / 户名 / 账号",
    "remark": "供应商要求月底前付款"
  }
}'
```

更新已有草稿或驳回单据时增加 `bizId`。

传入 `payment_plan_id` 后，`contract_id`、付款期次、期次名称、总期数、触发条件、计划金额快照和计划付款日快照由 `cpoSaveDraft` 根据计划补齐。`amount` 和 `expected_pay_date` 仍可修改；单笔或累计申请额超过计划金额时必须填写 `plan_variance_reason`。保存后由 `cpoPaymentPlanSummary` 根据该计划下所有有效付款申请重算处理中、已付金额和剩余金额；兼容字段 `linked_payment_application_id` 只记录最近一笔，不是唯一关系。

## 付款与进项发票核销

付款和发票是两个独立发生的事实，系统不能强制固定先后顺序：

- 可以先取得发票再付款，也可以先付款、待供应商交付后补票。
- 一笔付款可由 0～N 张进项发票覆盖；一张进项发票也可按金额覆盖 0～N 笔付款。
- 发票未到时付款仍可提交，但详情应显示待补发票金额；发票补到后再做核销，不能伪造发票号或附件。
- 核销金额累计不得超过付款金额，也不得超过发票票面金额。
- 例如首期先付 5,500 元、供应商最终开具 9,500 元发票、再支付二期 4,000 元时，同一张实际发票应分别向两笔付款分摊 5,500 元和 4,000 元。

归档进项发票时，可由发票能力把 `paymentAllocations` 一并传给 `cpoSaveDraft`。事后补充或解除核销由管理员调用 `cpoManageDocument360` 的 `allocate_invoice` / `remove_invoice_allocation`；核销事实以 `biz_invoice_link.relation_type=payment_coverage` 为准，不以备注或附件文件名推断。

## 保存并提交

```bash
lovrabet bff exec --appcode app-4d050189 --name cpoSubmitApplication --params '{
  "bizType": "payment",
  "bizId": 123,
  "comment": "提交付款申请"
}'
```

提交要求 `payment` 已配置启用的第一步审批人。用户提供过付款材料时，还必须先完成所有材料的上传、申请单关联和写后数量复核；不能忽略附件后继续提交。

## 成功结果与详情链接

`cpoSaveDraft` 或 `cpoSubmitApplication` 成功后，必须使用该次响应中的真实 `bizType` 和 `bizId` 构造详情地址，并调用 `cpoGetBizTimeline` 重读标题、金额和状态。在最终答复中返回：

```markdown
[查看“XX 服务费首付款”付款申请](https://app-4d050189.app.lovrabet.com/application-detail/payment/123)
```

链接文字使用付款标题，不显示内部 ID。保存草稿时明确写“已保存草稿”，提交时明确写“已提交审批”；如果写后重读失败，仍返回按成功响应构造的链接，并提示金额或状态尚未复核。

## 附件

付款申请本身可按业务规则没有材料，但用户只要在创建、更新或提交付款申请的上下文中提供合同付款依据、验收材料、付款通知等文件，就视为要求随申请留档。Skill 必须主动建立输入附件清单并逐个调用 `lovrabet file upload`，不需要用户再次要求上传。只使用上传响应中的真实 `fileName/filePath/fileType/sourceDir`。

先保存付款草稿取得真实 `bizId`，再为每个文件在附件数据集中创建一条关系。付款材料附件类型是 `approval_material`：

```json
{
  "biz_type": "payment",
  "biz_id": 123,
  "attachment_type": "approval_material",
  "file_name": "付款材料.pdf",
  "file_path": "20260618/xxx-付款材料.pdf",
  "uploaded_by": "申请人姓名"
}
```

随后调用 `cpoGetBizTimeline`，按 `biz_type=payment`、真实 `biz_id`、`attachment_type=approval_material` 核对本次路径集合。必须满足：用户提供的唯一文件数等于唯一上传成功数，预期附件关系数等于实际关系数和写后读取匹配数；每个文件名与 `filePath` 恰好对应一次，没有遗漏、额外项或重复关系。同一持久文件路径即使复用，也必须为当前付款申请建立并核实业务关系。

任一数量或路径不一致时，停止提交并报告预期数、实际数及缺失或重复文件名。上传到文件服务但未关联付款申请不算成功，也不得用备注中的文件名替代附件。

银行回单如需关联到确认付款动作，使用 `cpoAdvanceWorkflow` 的 `payload.bank_receipt_attachment_id`，不要直接改主表银行字段。

确认付款成功后，`cpoAdvanceWorkflow(action=confirm_paid)` 会按该计划下所有付款记录汇总实付金额；累计达到计划金额才标记为 `paid`，部分付款保持 `processing`。取消或驳回一笔付款后同样重算，不会错误释放同一期的其他付款。银行失败重试不删除原付款关系。

## 查询

```bash
lovrabet data getOne --appcode app-4d050189 --code 7da208a5059b4b13896d7c7ae29c8492 --params '{"id":123}'
lovrabet bff exec --appcode app-4d050189 --name cpoGetBizTimeline --params '{"bizType":"payment","bizId":123}'
lovrabet bff exec --appcode app-4d050189 --name cpoGetContractPaymentContext --params '{"contractId":456}'
```
