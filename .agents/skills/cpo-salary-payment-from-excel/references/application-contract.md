# Payroll Payment Application Contract

## Application and Datasets

- AppCode: `app-4d050189`
- Payroll payment primary Dataset: `235e11a9cb7945c8926b4d31fe64843f`
- Payroll payment item Dataset: `19ef166f3d2242a19911ccb8a5685bb8`
- Internal legal entity Dataset: `ab563bb9148947bfb751f8c1aff0d5c7`
- Attachment Dataset: `ab17964f0efd46f78cecb4969140f257`

## Multiple-draft Parameters

Call `cpoSaveDraft` once for every object in `application_drafts`. Split into three independent payment purposes by default:

```json
[
  {
    "bizType": "salary_payment",
    "values": {
      "title": "Hangzhou Qizhi Yuntu Technology Co., Ltd. July 2026 Employee Payroll",
      "payroll_month": "2026-07-01",
      "expected_pay_date": "2026-07-31",
      "remark": "Generated from payroll attachment totals and confirmed by finance."
    },
    "items": [{
      "internal_legal_entity_id": 1,
      "payment_project": "Qizhi Yuntu July 2026 Payroll",
      "employee_count": 9,
      "amount": 148615,
      "currency": "CNY",
      "payment_method": "bank_transfer"
    }],
    "attachments": [{
      "fileName": "QZYT-and-Shanghai-source-payroll.xlsx",
      "filePath": "<real-path-returned-by-upload>",
      "fileType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "sourceDir": "<directory-returned-by-upload>"
    }]
  },
  {
    "bizType": "salary_payment",
    "values": {
      "title": "Hangzhou Meiyou Liuma Technology Co., Ltd. July 2026 Employee Payroll",
      "payroll_month": "2026-07-01",
      "expected_pay_date": "2026-07-31",
      "remark": "Generated from payroll attachment totals and confirmed by finance."
    },
    "items": [{
      "internal_legal_entity_id": 2,
      "payment_project": "Meiyou Liuma July 2026 Payroll",
      "employee_count": 1,
      "amount": 10415.3,
      "currency": "CNY",
      "payment_method": "bank_transfer"
    }],
    "attachments": [{
      "fileName": "MYLM-source-payroll.xlsx",
      "filePath": "<real-path-returned-by-upload>",
      "fileType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "sourceDir": "<directory-returned-by-upload>"
    }]
  },
  {
    "bizType": "salary_payment",
    "values": {
      "title": "Intercompany Transfer to Qizhi Yuntu Shanghai Branch for July 2026 Payroll 15,635.03 Plus Individual Income Tax 1,181.67",
      "payroll_month": "2026-07-01",
      "expected_pay_date": "2026-07-31",
      "remark": "Intercompany payment from Qizhi Yuntu to its Shanghai Branch for branch employee payroll and individual income tax."
    },
    "items": [{
      "internal_legal_entity_id": 3,
      "payment_project": "Shanghai Branch July 2026 Payroll and Individual Income Tax Intercompany Payment",
      "employee_count": 1,
      "amount": 16816.7,
      "currency": "CNY",
      "payment_method": "bank_transfer"
    }],
    "attachments": [{
      "fileName": "QZYT-and-Shanghai-source-payroll.xlsx",
      "filePath": "<real-path-returned-by-upload>",
      "fileType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "sourceDir": "<directory-returned-by-upload>"
    }]
  }
]
```

Even when headquarters and Shanghai Branch data comes from one workbook, create the first and third applications separately and retain that source attachment in each. The third application is not an ordinary branch payroll application; it is an intercompany payment from Qizhi Yuntu to the Shanghai Branch for payroll and individual income tax.

The server recalculates primary `amount`, `employee_count`, and `currency` from each draft's items. Never write primary or item tables directly. Record each returned `bizId`; stop creating later drafts after any failure.

Use `bizId` only in Backend Function parameters and detail URLs, never as a user-facing label. Build `https://app-4d050189.app.lovrabet.com/application-detail/salary_payment/<bizId>`, reread with `cpoGetBizTimeline`, and display each business title as Markdown link text. Return links for every successfully created application even after partial batch success.

## Legal-entity Query

```bash
lovrabet data filter \
  --appcode app-4d050189 \
  --code ab563bb9148947bfb751f8c1aff0d5c7 \
  --params '{"where":{"status":{"$eq":"ACTIVE"}},"currentPage":1,"pageSize":100}'
```

Match both `entity_code` and full legal name. Never rely solely on an ID hint from the script.

## Attachments

- Attach only source workbooks covering the application's items, using `attachment_type=payroll_sheet`.
- If one source covers multiple applications, create a separate attachment relationship for each.
- Keep month and entity clear in filenames; never replace the original with summary JSON.
- Upload through an authenticated runtime page or equivalent authenticated interface.
- The form's `AttachmentUpload` sends each file to `/api/common/uploadFile`; pass every returned `fileName/filePath/fileType/sourceDir` to `cpoSaveDraft`.
- Reread details after save and verify count, filenames, and previewability.

Count at batch and application levels:

1. Inventory unique batch inputs, using size/hash as well as name.
2. Unique inputs must equal unique successful uploads with non-empty paths; paths may be reused across applications.
3. Per application, `application_drafts[].attachments` count must equal saved attachment count and post-write matching count.
4. Names and paths must match one-to-one with no missing, extra, duplicate, or wrongly linked item; a reused path must appear once in each relevant application.
5. Stop all later drafts and submissions on a mismatch. Report expected/actual counts and missing/duplicate filenames by business title. An uploaded but unlinked file is not success.

## Permission Boundaries

- “Enter” or “create application” defaults to creating/updating drafts only.
- Set `submit=true` in complete `cpoSaveDraft` only when the user explicitly asks to submit for approval.
- Before submission, show each title, month, payment date, item amount/headcount, total, and attachment names.
- If the user authorizes one application, do not submit the others.
- Never write business tables through MySQL or bypass the approval Backend Function.
- After every successful submission, build a detail link from the response `bizId` and use the business title as link text; never return only an ID or generic list-page link.
