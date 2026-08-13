# 输出与结构化分析约定

## 分析 JSON

使用以下结构保存分析结果；未知事实使用 `null`，不要使用猜测值：

```json
{
  "intent": "analyze",
  "source": {
    "files": ["/absolute/path/contract.pdf"],
    "page_count": 7,
    "sha256": ["..."],
    "evidence_notes": ["双方签章版"]
  },
  "contract": {
    "name": "高新技术企业认定服务合同",
    "document_contract_no": null,
    "system_contract_no": "FS-202606050002",
    "direction": "payable",
    "contract_type": "certification",
    "our_role": "party_a",
    "currency": "CNY",
    "total_amount": 60000,
    "sign_date": "2026-06-05",
    "start_date": "2026-06-05",
    "end_date": null,
    "term_text": "至约定服务完成",
    "contract_assessment": "## 客观评价\n\n本合同服务目标明确，金额与分期合计一致；现有证据支持保存合同草稿。\n\n## 注意事项\n\n- 首期付款后补齐对应发票\n- 审计服务开始前书面确认交付物和验收口径\n\n## 风险与处置\n\n- **中风险**：审计费支付节点不明确；提交前由业务人员与乙方书面确认触发条件。"
  },
  "parties": [
    {"role": "party_a", "name": "杭州启智云图科技有限公司", "is_our_entity": true},
    {"role": "party_b", "name": "杭州果然知识产权有限公司", "is_our_entity": false}
  ],
  "service_items": [
    {"name": "国家高新技术企业认定", "quantity": null, "amount": 20000, "evidence": "第2页2.1"},
    {"name": "发明专利快速预审", "quantity": 1, "amount": 20000, "evidence": "第2页2.1"},
    {"name": "软件著作权", "quantity": 12, "amount": 5000, "evidence": "第2页2.1"},
    {"name": "高新审计", "quantity": 3, "amount": 15000, "evidence": "第2页2.1、2.2.1"}
  ],
  "payment_plans": [
    {
      "phase_no": 1,
      "phase_name": "首期综合服务费",
      "amount": 35000,
      "currency": "CNY",
      "planned_pay_date": "2026-06-09",
      "date_basis": "historical_record",
      "trigger_condition": "合同签订后支付",
      "status": "paid",
      "evidence": "第2页2.1.1、2.1.2；飞书付款审批",
      "payment_evidence": {
        "type": "paid_confirmed_record",
        "title": "高新技术企业认定服务合同首期费用35000元"
      }
    },
    {
      "phase_no": 2,
      "phase_name": "高新审计费",
      "amount": 15000,
      "currency": "CNY",
      "planned_pay_date": null,
      "date_basis": "unknown",
      "trigger_condition": "完成年审及专项审计3份；付款前需与乙方确认具体支付时点",
      "status": "pending",
      "evidence": "第2页2.1、2.2.1",
      "payment_evidence": null
    },
    {
      "phase_no": 3,
      "phase_name": "高企认定尾款",
      "amount": 10000,
      "currency": "CNY",
      "planned_pay_date": null,
      "date_basis": "explicit",
      "trigger_condition": "高新技术企业认定审批成功并完成政府网站公示后3日内",
      "status": "pending",
      "evidence": "第2页2.1.1",
      "payment_evidence": null
    }
  ],
  "counterparty": {
    "name": "杭州果然知识产权有限公司",
    "unified_credit_code": null,
    "contact_name": "瞿秀梦",
    "contact_phone": "19906837869",
    "contact_email": null,
    "address": "杭州市拱墅区长浜路718号新天地T1写字楼12层",
    "bank_name": "中国工商银行杭州武林支行营业室",
    "bank_account": "1202021209980376743",
    "missing_fields": ["unified_credit_code", "contact_email"]
  },
  "invoice": {
    "clause": "每次收款后5个工作日内开具增值税普通发票",
    "matched_records": [],
    "missing_evidence": ["首期发票"]
  },
  "risk_review": {
    "overall_level": "medium",
    "decision": "pass_with_conditions",
    "reviewed_dimensions": [
      "parties_authority",
      "subject_scope",
      "amount_tax",
      "payment_collection",
      "delivery_acceptance",
      "invoice_refund",
      "term_renewal_termination",
      "breach_liability",
      "ip_confidentiality_data",
      "compliance_qualification",
      "dispute_resolution",
      "blanks_conflicts"
    ],
    "summary": "合同可保存草稿，但审计费支付节点需要确认。",
    "conditions": ["提交前确认高新审计费的付款触发条件"],
    "no_material_risks_reason": null
  },
  "risks": [
    {
      "category": "payment_collection",
      "level": "medium",
      "code": "AUDIT_PAYMENT_DATE_UNKNOWN",
      "title": "审计费支付节点不明确",
      "evidence": "第2页2.1及2.2.1",
      "impact": "可能产生付款时点争议或提前付款风险",
      "recommendation": "提交前由业务人员与乙方书面确认触发条件",
      "resolution_status": "open",
      "blocks_submission": true
    }
  ]
}
```

`intent` 取值：`analyze`、`record`、`correct`。写入任务使用 `record` 或 `correct`，校验器会提高合作方付款资料要求。

`contract.contract_assessment` 是写入合同主档的 Markdown 原文，必须至少包含二级标题 `## 客观评价` 和 `## 注意事项`；存在风险时应增加 `## 风险与处置`。它用于审批和履约人员快速阅读，但不能省略 `risk_review` 和 `risks` 中的结构化风险证据。

## 用户结果

按以下顺序返回：

1. 执行状态：`analysis_only`、`needs_confirmation`、`ready_to_record`、`needs_developer_migration`、`written_verified` 或 `failed`；
2. 合同摘要：双方、方向、金额、签章与期限；
3. 风险结论：总体等级、是否可提交、关键风险、影响和建议，并给出可入库的 Markdown 版合同评价与注意事项；
4. 服务与分期表：每期金额、日期或触发条件、状态和证据；
5. 合作方完整性：已核验字段、修正字段、仍缺字段；
6. 系统结果：新建或修正的业务对象，用标题或业务编号展示；合同草稿保存或提交成功时必须附带可点击的合同详情链接；
7. 待办：法务确认、补充条款、银行回单、发票、信用代码、模糊日期等。

不要向用户展示 `伙伴 #36`、`付款 #10`、数据集主键或关系 ID。无法解析业务标题时显示“关联对象标题缺失”，并修正聚合查询。

## 详情链接

只使用写操作实际返回的 `bizType/bizId` 构造链接，内部 ID 只能出现在 URL 中：

```markdown
[查看“高新技术企业认定服务合同”合同申请](https://app-4d050189.app.lovrabet.com/application-detail/contract/123)
[查看“某客户年度服务合同”客户合同](https://app-4d050189.app.lovrabet.com/application-detail/crm_contract/456)
```

链接文字必须使用合同名称或明确业务编号。写后调用当前应用的合同详情 BFF 复核标题、方向、金额和状态；复核失败时仍可返回按成功响应构造的链接，但必须说明哪些字段尚未复核。
