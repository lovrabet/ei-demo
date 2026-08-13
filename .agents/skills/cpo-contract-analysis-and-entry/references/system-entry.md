# 系统录入与数据修正规则

## 应用与数据边界

- Lovrabet 应用：`app-4d050189`
- 付款合同保存在启智云图企业智能系统财务域。
- 客户收款合同和应收计划保存在已并入当前项目的 CRM 业务域，通过当前应用 BFF 访问，不创建跨应用客户端。

### 付款合同相关数据集

| 业务对象 | 表 | 数据集 code |
| --- | --- | --- |
| 合同 | `contract_application` | `53869993f80f45ae8ef6cdf051d8e355` |
| 合作方 | `business_partner` | `68c70907e27c481cbefb96dd3906936e` |
| 付款计划 | `contract_payment_plan` | `08e17d8ba3a24e938fef89816c8f4ccb` |
| 付款申请 | `payment_application` | `7da208a5059b4b13896d7c7ae29c8492` |
| 发票 | `invoice_record` | `fc11e2d760b94b2ca2ccf0485ed40ca8` |
| 发票关联 | `biz_invoice_link` | `9dd0d102219145ddbb67d1c247a84fb9` |
| 附件 | `attachment` | `ab17964f0efd46f78cecb4969140f257` |

## 新建付款合同草稿

先按名称、对方和金额查重，并完成合同风险审查。确认不存在后调用：

```bash
lovrabet bff exec --appcode app-4d050189 \
  --name cpoSaveDraft \
  --params '{
    "bizType":"contract",
    "values":{
      "contract_name":"年度认证服务合同",
      "direction":"payable",
      "contract_type":"certification",
      "our_role":"party_a",
      "partner_id":123,
      "amount":60000,
      "currency":"CNY",
      "start_date":"2026-06-05",
      "end_date":null,
      "remark":"申请背景：2026 年度高新技术企业认定服务",
      "contract_assessment":"## 客观评价\n\n服务范围与合同金额明确，分期合计与合同总额一致。\n\n## 注意事项\n\n- 首期付款后补齐对应发票\n- 项目交付物和验收材料需留档\n\n## 风险与处置\n\n- **中风险**：审计费支付节点不明确；提交前与乙方书面确认触发条件。"
    }
  }' --format compress
```

使用返回的 `bizId` 同步付款计划：

```bash
lovrabet bff exec --appcode app-4d050189 \
  --name cpoSyncContractPaymentPlans \
  --params '{
    "contractId":123,
    "plans":[
      {
        "phase_no":1,
        "phase_name":"首付款",
        "planned_amount":35000,
        "currency":"CNY",
        "planned_pay_date":"2026-06-09",
        "trigger_condition":"合同签订后支付",
        "status":"pending",
        "remark":"金额组成及日期证据"
      }
    ]
  }' --format compress
```

`cpoSyncContractPaymentPlans` 会保护已关联付款申请或处理中的计划；不得绕过锁定状态强改。

录入前先把用户提供的合同正文、补充协议、签章页和审批材料建立为输入附件清单。用户已经提供文件即表示要求随本次合同申请留档，不需要再追问是否上传。逐个上传清单中的唯一文件，并将返回的持久 `filePath` 写入附件数据集；只保存 `filePath`，不要保存临时预览 URL：

```bash
lovrabet file upload --appcode app-4d050189 \
  --file "<合同绝对路径>" --format compress
```

每个文件都必须以 `biz_type=contract`、真实合同 `biz_id`、`attachment_type=contract_file` 建立附件关系。附件必须使用明确的业务文件名；内部 ID 只用于 `biz_id` 和调用参数，不向用户展示。

写后按该合同和附件类型重读，执行数量及集合核对：

1. 输入唯一文件数必须等于取得非空真实 `filePath` 的唯一上传成功数；
2. 同一文件复用于当前合同不必重复上传，但必须计入当前合同的预期业务关系数；
3. 预期业务关系数、实际创建关系数和写后读取时匹配本次路径集合的数量必须相等；
4. 文件名和 `filePath` 必须逐项对应，不得漏传、漏关联、额外关联或重复关联；
5. 任一项不一致时停止提交，报告预期数、实际数以及缺失或重复的文件名。仅上传到文件服务但未关联合同不算成功。

合同专家结论必须进入 `contract_assessment`，以 Markdown 保存，至少包含 `## 客观评价` 和 `## 注意事项`；存在风险时增加 `## 风险与处置`，并写明总体等级、审查结论、未解决风险和提交前条件。`remark` 只保存申请背景和一般补充说明。完整风险 JSON 仍保留在 Skill 结果中。

## 历史记录修正

普通 Lovrabet 更新可以安全完成时，先通过 `lovrabet data filter/getOne` 锁定唯一记录，再调用受权限控制的 BFF 或 Instant API，写后重新读取。

历史合同、已付款计划、错连主体或附件迁移涉及锁定记录、多个数据集或数据库事务时，运行时 Skill 不直接执行 SQL，返回 `needs_developer_migration` 并生成交接清单：

1. 每个对象的业务标题、合同号或法定名称；
2. 当前有效记录数和预期唯一数量；
3. 当前错误值、目标值及合同页码或履约证据；
4. 分期合计、已付或已收合计及状态依据；
5. 需要复用的附件文件名、哈希和业务关系；
6. 受影响的数据集 code 和写后查询条件；
7. 明确要求开发流程使用幂等迁移、事务、运行时数据库环境变量和写后数据集复核。

运行时 Skill 不接收、保存或输出数据库连接串。开发迁移完成后，通过 Lovrabet 重新读取所有受影响数据集，确认平台可见值与中文标签正确：

```bash
lovrabet dataset detail --appcode app-4d050189 \
  --code <dataset-code> --format compress

lovrabet data filter --appcode app-4d050189 \
  --code <dataset-code> --params '<业务键过滤条件>' --format compress
```

## 状态与事实

- 合同审批通过且完成签署：工作流状态可为 `signed`。
- 已签署且正在履约：履约状态为 `in_progress`。
- 付款计划只有在存在付款确认依据时才标记 `paid` 并记录实付金额和时间。
- 审批“已完成”不能单独证明银行付款；若历史迁移规则将其标为 `paid_confirmed`，必须在备注中说明证据来源并列出银行回单待补。
- 应开票但系统无发票时保留缺口，不创建虚构发票。

## 客户收款合同

- 使用客户合同、应收计划、客户回款和销项发票模型。
- 客户合同不写入 `contract_application` 形成重复主档。
- 通过当前应用的 `cpoManageReceivableContract` 等 BFF 维护；调用前读取实时 BFF contract。
- 收款计划、到账事实和销项发票分别保存，不把计划状态当作真实到账。

## 提交审批

默认只保存草稿。只有用户明确要求提交时调用：

```bash
lovrabet bff exec --appcode app-4d050189 \
  --name cpoSubmitApplication \
  --params '{"bizType":"contract","bizId":123,"comment":"提交合同审核"}' \
  --format compress
```

提交前重新展示合同、风险等级与处置状态、合作方、金额、分期和附件摘要，并确认附件输入、上传、关联和写后读取数量及路径集合完全一致。只有 `entry_gate=ready`、附件复核通过且用户明确要求提交时才执行；其余状态仅保存草稿或停止。

保存或提交成功后，使用 BFF 返回的真实 `bizType/bizId` 生成详情链接，并重读合同详情验证状态。付款合同链接为 `https://app-4d050189.app.lovrabet.com/application-detail/contract/<bizId>`；客户收款合同使用 `crm_contract`。最终用合同名称展示链接，不向用户单独展示内部 ID。
