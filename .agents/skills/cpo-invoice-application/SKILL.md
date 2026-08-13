---
name: cpo-invoice-application
displayName: 发票与开票申请助手
description: "在启智云图企业智能系统中创建和提交销项开票申请、登记真实进销项发票，并按金额维护开票申请履约及应收期次开票分摊。用户提供开票材料或发票文件时必须主动上传、逐项关联业务单并清点数量。"
example: "帮我按这份客户合同申请开票，并在实际开票后关联到对应收款期次"
metadata:
  type: write
---

# 发票与开票申请助手

## 先识别业务对象

本 Skill 管理四种不同事实，不得混写：

1. **销项开票申请**：我方向客户申请开票的审批单。业务类型为 `invoice_application`，数据集 `ae51202c44e140828ba87e4571094d1a`，表 `invoice_application`。申请中没有真实票号、开票日期或票面文件。
2. **真实发票**：已经收到或已经开出的票据。业务类型为 `invoice`，数据集 `fc11e2d760b94b2ca2ccf0485ed40ca8`，表 `invoice_record`。进项和销项都在这里登记。
3. **开票申请履约**：一份申请可以由多张真实销项发票履约，一张真实发票也可以履约多份申请；每条关系记录金额。数据集 `392bcb15b9124da69bb8329eb5c4ecf2`，表 `invoice_application_fulfillment`。
4. **应收期次开票分摊**：一张真实销项发票可以按金额分摊到一个或多个 CRM 收款期次，一个期次也可以由多张发票覆盖。数据集 `c8962eed35894816b4d7462986037299`，表 `receivable_invoice_allocation`。

发票、付款和回款是相互关联但独立发生的事实。不得因为已经付款就伪造发票，也不得因为已经开票就推断已经回款。例如首期已收或已付 5,500 元但暂未开票，最终一张 9,500 元发票可以按 5,500 元和 4,000 元分摊到两期。

## 系统边界

- AppCode：`app-4d050189`
- CRM 客户应用：`app-3147d70e`
- CRM 客户公司数据集：`ec47b800609c4db994e1300f774d7c9f`
- CRM 收款合同、收款期次通过当前应用客户端提供的模型读取，不创建跨应用客户端
- 附件数据集：`ab17964f0efd46f78cecb4969140f257`
- 销项开票申请草稿只调用 `cpoSaveDraft`
- 销项开票申请提交只调用 `cpoSubmitApplication`
- 真实进项发票归档只调用 `cpoArchiveIncomingInvoice`
- 已开具销项发票登记只调用 `cpoRegisterIssuedInvoice`
- 开票申请与实际发票履约只调用 `cpoFulfillInvoiceApplication`
- 销项发票、客户回款与收款期次分摊只调用 `cpoManageReceivableSettlement`
- 后续审批动作只调用 `cpoAdvanceWorkflow`
- 不得直接修改流程状态、申请人、提交时间等受控字段，也不得直接写履约或分摊关系表
- `is_deleted` 是平台系统字段，任何 Skill、BF、Hook 或脚本都不得读取、筛选、赋值或更新；删除调用 Lovrabet `delete`，业务撤销使用受控 BF

## 判断方向与处理路径

- **我方向客户申请开票**：创建 `invoice_application` 并提交审批；审批通过不代表已经开票。
- **我方已经实际开票**：创建 `invoice_direction=outgoing` 的 `invoice_record`，上传真实票面文件，再登记为已核验；根据事实关联开票申请和收款期次。
- **供应商或其他对方向我方开票**：创建 `invoice_direction=incoming` 的 `invoice_record`，上传真实票面文件，再直接归档，不进入销项开票申请审批流。
- **报销中的票据**：使用报销申请 Skill，通过 `items[].invoices` 登记并关联；不要在本 Skill 中再造一张重复发票。

## 附件主动处理与数量门禁

用户只要在当前开票申请或真实发票上下文中提供文件，就视为要求随对应业务单留档，不需要再次输入“请上传附件”。先按文件名、大小及可用哈希建立输入附件清单，逐个调用 `lovrabet file upload` 并仅使用响应中的真实 `fileName/filePath/fileType/sourceDir`。保存业务草稿取得真实 `bizId` 后，按对象建立附件关系：

- 开票申请资料：`biz_type=invoice_application`、`attachment_type=invoice_application_material`
- 真实进项或销项发票票面：`biz_type=invoice`、`attachment_type=invoice`

开票申请资料不能冒充真实发票，真实发票票面也不能只关联到开票申请。每个文件都必须关联到用户本次指定的正确业务对象；同一持久文件复用到多个业务对象时，可以只上传一次，但每个业务对象都必须各自建立附件关系。

在提交开票申请、归档进项发票或登记已开销项发票前，必须通过 `cpoGetBizTimeline` 和附件数据写后读取完成核对：

- 用户提供的唯一文件数 = 取得非空真实 `filePath` 的唯一上传成功数
- 每个业务对象的预期附件关系数 = 实际创建关系数 = 写后读取匹配本次路径集合的数量
- 文件名与路径逐项一致，无遗漏、额外项、重复关系或错挂对象

任何数量或路径集合不一致时立即停止后续提交、归档或登记，报告每个业务对象的预期数、实际数和缺失或重复文件名。文件上传成功但没有关联到正确业务单不算完成，不得以备注或“后补附件”代替。

## 对方公司与名称快照

发票票面公司名称是业务事实，供应商或客户主数据关联是可选的治理关系：

- 对方能匹配现有客户或供应商时，可以关联现有主体，同时保存票面名称快照。
- 匹配不到时，先询问用户是“新建并关联主体”还是“仅使用票面名称”。
- 用户选择仅使用名称时，不得为了通过校验而伪造 `partner_id`；进项发票至少保留真实 `seller_name`。
- 用户明确要长期维护该主体时，使用现有抽屉或弹窗完成新建并回填，不新开浏览器窗口。
- 模糊查询应按公司名称关键字搜索，不要求用户知道内部 ID。

任何用户可见关系都必须显示公司名、合同名、申请标题、发票号或收款期次名。不得显示 `伙伴 #36`、`发票 #13` 等内部 ID；缺少标题时显示“关联对象标题缺失”并提示修正数据。

## 创建销项开票申请

`cpoSaveDraft` 的 `bizType` 必须是 `invoice_application`。允许的 `values` 字段：

- `application_title`：申请标题，提交必填
- `request_type`：默认 `customer_invoice`
- `crm_company_id`、`customer_name_snapshot`：CRM 客户逻辑引用及名称快照
- `crm_contract_id`、`contract_title_snapshot`：CRM 收款合同逻辑引用及标题快照，可选
- `seller_name`：我方开票主体，提交必填
- `buyer_name`、`buyer_tax_no`、`buyer_address_phone`、`buyer_bank_account`：购方信息；购方名称提交必填
- `requested_amount`、`requested_tax_amount`、`requested_total_amount`：申请金额；价税合计提交时必须大于 0
- `currency`：默认 `CNY`
- `tax_rate`：小数，例如 `0.06`
- `invoice_type`：`vat_special`、`vat_normal`、`other`
- `invoice_content`：开票内容，提交必填
- `invoice_medium`：`electronic`、`paper`、`other`
- `receiver_name`、`receiver_phone`、`receiver_email`
- `payment_condition_snapshot`：按合同事实记录“先收款后开票”“先开票后收款”等条件；不得把实际是否到账写成推断值
- `remark`

示例：

```bash
lovrabet bff exec --appcode app-4d050189 --name cpoSaveDraft --params '{
  "bizType": "invoice_application",
  "values": {
    "application_title": "某客户技术服务费开票申请",
    "request_type": "customer_invoice",
    "customer_name_snapshot": "某客户有限公司",
    "contract_title_snapshot": "某客户年度技术服务合同",
    "seller_name": "杭州启智云图科技有限公司",
    "buyer_name": "某客户有限公司",
    "requested_amount": 8962.26,
    "requested_tax_amount": 537.74,
    "requested_total_amount": 9500,
    "currency": "CNY",
    "tax_rate": 0.06,
    "invoice_type": "vat_normal",
    "invoice_content": "技术服务费",
    "invoice_medium": "electronic",
    "payment_condition_snapshot": "按合同约定节点开票",
    "remark": "覆盖第一期 5500 元和第二期 4000 元"
  }
}'
```

更新草稿或驳回单据时增加 `bizId`。关联 CRM 合同时，可随草稿传入 `relations`：

```json
[
  {
    "relationType": "bills_crm_contract",
    "targetBizType": "crm_contract",
    "targetBizId": 123
  }
]
```

内部 ID 仅用于参数和数据连接，不得作为最终答复中的显示文本。

提交审批：

```bash
lovrabet bff exec --appcode app-4d050189 --name cpoSubmitApplication --params '{
  "bizType": "invoice_application",
  "bizId": 123,
  "comment": "按客户合同申请开具技术服务费发票"
}'
```

提交前必须确认标题、客户名称、我方主体、购方名称、发票类型、开票内容和正数申请价税合计完整；用户提供过申请资料时还必须确认附件数量门禁通过。审批通过后状态为 `reviewed`；只有实际发票履约金额覆盖申请总额后，申请才是 `completed`。

开票申请资料附件使用 `biz_type=invoice_application`、`attachment_type=invoice_application_material`。资料附件不是实际发票票面，不得冒充发票附件。

## 登记真实进项发票

真实进项发票先用 `cpoSaveDraft` 保存 `bizType=invoice`，至少记录：

- `invoice_direction=incoming`
- `invoice_no`、`invoice_date`
- `seller_name`、`buyer_name`
- `invoice_type`、正数 `total_amount`
- `partner_id` 可选；有现成供应商则关联，没有时只保存真实销售方名称

上传至少一份真实发票附件后调用：

```bash
lovrabet bff exec --appcode app-4d050189 --name cpoArchiveIncomingInvoice --params '{"invoiceId":123}'
```

附件必须使用 `biz_type=invoice`、`attachment_type=invoice`，且 `file_path` 来自真实上传结果。至少一份真实发票文件及用户本次提供的全部票面文件都必须通过数量门禁；没有真实文件时不得伪造路径。归档会校验归属、方向、必填字段和重复票号；不要再调用销项开票申请提交接口。

## 登记实际销项发票并履约

实际开票完成后，先用 `cpoSaveDraft` 创建 `bizType=invoice`、`invoice_direction=outgoing` 的真实发票记录，填写真实票号、开票日期、购销双方、金额、类型，并主动上传及关联用户提供的全部 `biz_type=invoice`、`attachment_type=invoice` 票面文件；数量门禁通过后再调用：

```bash
lovrabet bff exec --appcode app-4d050189 --name cpoRegisterIssuedInvoice --params '{"invoiceId":456}'
```

把真实发票按金额履约到审批通过的开票申请：

```bash
lovrabet bff exec --appcode app-4d050189 --name cpoFulfillInvoiceApplication --params '{
  "op": "fulfill",
  "invoiceApplicationId": 123,
  "invoiceId": 456,
  "amount": 9500,
  "remark": "实际发票已开具"
}'
```

BF 会同时限制申请累计履约金额不超过申请总额、发票累计履约金额不超过票面价税合计。撤销错误关系使用 `op=cancel` 和 `fulfillmentId`，不得直接删除关系表记录。

## 分摊到应收期次

只有真实销项发票才能分摊至 CRM 收款期次。对每个期次调用：

```bash
lovrabet bff exec --appcode app-4d050189 --name cpoManageReceivableSettlement --params '{
  "op": "allocateInvoice",
  "crmContractId": 100,
  "receivablePlanId": 201,
  "invoiceId": 456,
  "amount": 5500,
  "remark": "覆盖第一期"
}'
```

同一张 9,500 元发票覆盖第二期时，再对对应期次分摊 4,000 元。BF 会校验发票金额上限、期次计划金额上限，并重算期次已开票和已回款汇总。撤销使用 `op=cancelInvoiceAllocation` 和 `allocationId`。

客户实际回款分摊也由同一 BF 管理，使用 `op=allocateReceipt` 或 `op=cancelReceiptAllocation`；开票分摊和回款分摊不可互相替代。

## 查询与成功反馈

```bash
lovrabet bff exec --appcode app-4d050189 --name cpoGetBizTimeline --params '{"bizType":"invoice_application","bizId":123}'
lovrabet bff exec --appcode app-4d050189 --name cpoGetBizTimeline --params '{"bizType":"invoice","bizId":456}'
lovrabet bff exec --appcode app-4d050189 --name cpoGetInvoiceCenter --params '{}'
```

操作成功后必须重读并说明实际结果：申请是草稿、已提交、已审核还是已完成；真实发票是已登记还是仍缺附件；合同期次是已开票、部分回款还是已回款。不要把“审批通过”描述成“已开票”，也不要把“已开票”描述成“已收款”。

详情链接分别使用真实业务类型：

```markdown
[查看“某客户技术服务费开票申请”详情](https://app-4d050189.app.lovrabet.com/application-detail/invoice_application/123)
[查看发票“26337000000000000001”详情](https://app-4d050189.app.lovrabet.com/application-detail/invoice/456)
```

链接文字优先使用申请标题或发票号码，其次使用明确的业务名称；不得用内部 ID 兜底。
