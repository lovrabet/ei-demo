# 工资付款申请录入契约

## 应用与数据集

- appCode：`app-4d050189`
- 工资付款主表：`235e11a9cb7945c8926b4d31fe64843f`
- 工资付款子表：`19ef166f3d2242a19911ccb8a5685bb8`
- 我方主体：`ab563bb9148947bfb751f8c1aff0d5c7`
- 附件：`ab17964f0efd46f78cecb4969140f257`

## 多草稿参数

`application_drafts` 中的每个对象必须单独调用一次 BFF `cpoSaveDraft`。默认按三个独立付款用途拆分：

```json
[
  {
    "bizType": "salary_payment",
    "values": {
      "title": "杭州启智云图科技有限公司发放2026年7月员工工资",
      "payroll_month": "2026-07-01",
      "expected_pay_date": "2026-07-31",
      "remark": "由工资附件汇总生成，已由财务确认。"
    },
    "items": [
      {
        "internal_legal_entity_id": 1,
        "payment_project": "启智云图2026年7月工资",
        "employee_count": 9,
        "amount": 148615,
        "currency": "CNY",
        "payment_method": "bank_transfer"
      }
    ],
    "attachments": [
      {
        "fileName": "启智云图及上海分公司原始工资表.xlsx",
        "filePath": "启智云图工资文件上传返回的路径",
        "fileType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "sourceDir": "上传返回的目录"
      }
    ]
  },
  {
    "bizType": "salary_payment",
    "values": {
      "title": "杭州梅柚流码科技有限公司发放2026年7月员工工资",
      "payroll_month": "2026-07-01",
      "expected_pay_date": "2026-07-31",
      "remark": "由工资附件汇总生成，已由财务确认。"
    },
    "items": [
      {
        "internal_legal_entity_id": 2,
        "payment_project": "梅柚流码2026年7月工资",
        "employee_count": 1,
        "amount": 10415.3,
        "currency": "CNY",
        "payment_method": "bank_transfer"
      }
    ],
    "attachments": [
      {
        "fileName": "梅柚流码原始工资表.xlsx",
        "filePath": "梅柚流码工资文件上传返回的路径",
        "fileType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "sourceDir": "上传返回的目录"
      }
    ]
  },
  {
    "bizType": "salary_payment",
    "values": {
      "title": "转启智云图科技上海分公司往来款，发放2026年7月员工工资15635.03加上个税1181.67",
      "payroll_month": "2026-07-01",
      "expected_pay_date": "2026-07-31",
      "remark": "本单为启智云图向上海分公司支付往来款，用于发放上海分公司员工工资及个税。"
    },
    "items": [
      {
        "internal_legal_entity_id": 3,
        "payment_project": "2026年7月上海分公司工资及个税往来款",
        "employee_count": 1,
        "amount": 16816.7,
        "currency": "CNY",
        "payment_method": "bank_transfer"
      }
    ],
    "attachments": [
      {
        "fileName": "启智云图及上海分公司原始工资表.xlsx",
        "filePath": "启智云图工资文件上传返回的路径",
        "fileType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "sourceDir": "上传返回的目录"
      }
    ]
  }
]
```

即使启智云图本部与上海分公司来源于同一个 Excel，也必须分别创建第一张和第三张申请，并在两张申请中分别留档该原始附件。第三张不是普通的上海分公司工资单，而是启智云图向上海分公司支付工资及个税往来款。

每张主表的 `amount`、`employee_count` 和 `currency` 由服务端根据该草稿的子表重新汇总，不要绕过 BFF 直接写主表或子表。创建多张草稿时记录每次返回的 `bizId`；任一草稿失败后停止后续创建。

`bizId` 只用于后续 BFF 参数和详情 URL，不作为用户可见标签。每张保存成功后构造：

```text
https://app-4d050189.app.lovrabet.com/application-detail/salary_payment/<bizId>
```

再调用 `cpoGetBizTimeline` 复核该张标题、金额、状态、子表和附件；最终用申请标题作为 Markdown 链接文字。即使一批只成功了部分申请，也必须为每张已创建申请分别返回详情链接。

## 主体查询

创建草稿前查询我方主体数据集：

```bash
lovrabet data filter \
  --appcode app-4d050189 \
  --code ab563bb9148947bfb751f8c1aff0d5c7 \
  --params '{"where":{"status":{"$eq":"ACTIVE"}},"currentPage":1,"pageSize":100}'
```

按 `entity_code` 和主体全称双重匹配。不得只依赖脚本输出的 ID 提示。

## 附件

- 每张申请只上传覆盖其付款项目的原始 Excel，附件类型必须为 `payroll_sheet`。
- 同一源文件覆盖多张申请时，分别为每张申请建立附件记录。
- 不得改名成不含月份和主体的信息；不得用汇总 JSON 代替原始附件。
- 上传必须通过已登录的运行时页面或等价的受认证上传接口完成。
- 工资付款表单页面使用 `AttachmentUpload` 将每个文件上传到 `/api/common/uploadFile`，再把每次返回的 `fileName/filePath/fileType/sourceDir` 全部传给 `cpoSaveDraft`。
- 保存后重新读取工资付款详情，确认附件数量、文件名和可预览性正确。

附件必须按整批输入和单张申请两个层级清点：

1. 先建立整批唯一输入文件清单；同名文件结合大小或哈希判断，不能只按名称去重。
2. 整批唯一输入文件数必须等于取得非空真实 `filePath` 的唯一上传成功数；同一源文件覆盖多张申请时允许复用该路径。
3. 对每张申请，`application_drafts[].attachments` 数量就是预期附件关系数；必须等于 `cpoSaveDraft` 保存返回数和 `cpoGetBizTimeline` 写后读取匹配本次路径集合的数量。
4. 每张申请的文件名与 `filePath` 必须逐项对应，没有遗漏、额外附件、重复关系或错挂申请；复用路径也必须在每张相关申请中分别出现一次。
5. 任一数量或路径集合不一致时立即停止后续草稿和提交，按业务标题报告预期数、实际数以及缺失或重复文件名。仅上传文件但未与对应工资付款申请关联不算成功。

## 权限边界

- “录入”“创建申请”默认只创建或更新草稿。
- 只有用户明确要求“提交审批”时，才调用 `cpoSubmitApplication`。
- 提交前逐张展示标题、月份、付款日期、付款项目金额和人数、合计金额、附件名。
- 用户只授权其中一张时，不得提交其他草稿。
- 不通过 MySQL 直写业务表，不绕过审批 BFF。
- 每张提交成功后使用 `cpoSubmitApplication` 响应中的 `bizId` 生成详情链接，并以该申请的业务标题显示；不得只返回 ID 或笼统的列表页入口。
