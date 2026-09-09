---
name: cpo-invoice-application
displayName: Invoice and Invoice-request Assistant
description: "Create and submit outgoing invoice requests, register real incoming and outgoing invoices, and maintain amount-based fulfillment and receivable-installment allocations in the Qizhi Yuntu Enterprise Intelligence System. Proactively upload, link, and reconcile every invoice or request file supplied by the user."
example: "Request an invoice for this customer contract and allocate the issued invoice to the corresponding receivable installments"
metadata:
  type: write
---

# Invoice and Invoice-request Assistant

## Workflow

```mermaid
flowchart TD
  Start([User requests invoicing, registration, or archiving]) --> ID1[Identify the business object; never mix four distinct facts]
  ID1 --> ID2{Determine direction}
  ID2 -- Request an invoice for a customer --> A1[Create invoice_application and upload request materials]
  ID2 -- Our company issued an invoice --> B1[Create outgoing invoice_record and upload the real invoice]
  ID2 -- Counterparty invoiced our company --> C1[Create incoming invoice_record and upload the real invoice]
  ID2 -- Expense receipt --> D1[Use the Expense Skill and items[].invoices]
  A1 --> G1{Attachment count gate passes?}
  G1 -- No --> Stop([Stop and report missing files])
  G1 -- Yes --> A2[Save request draft with cpoSaveDraft]
  A2 --> A3[Create and submit once with cpoSaveDraft submit=true]
  A3 --> A4([Submitted; awaits fulfillment after approval])
  B1 --> G2{Attachment count gate passes?}
  G2 -- No --> Stop
  G2 -- Yes --> B2[Save real outgoing invoice with cpoSaveDraft]
  B2 --> B3[Register with cpoRegisterIssuedInvoice]
  B3 --> B4[Fulfill request with cpoFulfillInvoiceApplication]
  B4 --> B5[Allocate to receivable installments with cpoManageReceivableSettlement]
  B5 --> B6([Registration and fulfillment complete])
  C1 --> G3{Attachment count gate passes?}
  G3 -- No --> Stop
  G3 -- Yes --> C2[Save incoming invoice with cpoSaveDraft]
  C2 --> C3[Archive directly with cpoArchiveIncomingInvoice]
  C3 --> C4([Incoming invoice archived without approval workflow])
  D1 --> D2([Continue through expense workflow and avoid duplicate invoice creation])
```

## Identify the Business Object First

This Skill manages four distinct facts that must never be conflated:

1. **Outgoing invoice request**: our request to invoice a customer. `bizType=invoice_application`, Dataset `ae51202c44e140828ba87e4571094d1a`, table `invoice_application`. It contains no real invoice number, issue date, or invoice image.
2. **Real invoice**: an invoice actually received or issued. `bizType=invoice`, Dataset `fc11e2d760b94b2ca2ccf0485ed40ca8`, table `invoice_record`. Both incoming and outgoing invoices are registered here.
3. **Invoice-request fulfillment**: requests and real outgoing invoices have a many-to-many, amount-based relationship. Dataset `392bcb15b9124da69bb8329eb5c4ecf2`, table `invoice_application_fulfillment`.
4. **Receivable-installment invoice allocation**: real outgoing invoices and CRM receivable installments have a many-to-many, amount-based relationship. Dataset `c8962eed35894816b4d7462986037299`, table `receivable_invoice_allocation`.

Invoices, payments, and receipts are related but independent facts. Never fabricate an invoice because payment occurred or infer receipt because an invoice was issued. For example, one real invoice for 9,500 may later be allocated 5,500 and 4,000 across two installments.

## System Boundaries

- AppCode: `app-4d050189`
- CRM customer application: `app-3147d70e`
- CRM company Dataset: `ec47b800609c4db994e1300f774d7c9f`
- Read CRM receipt contracts and installments through the current application client; do not create a cross-application client.
- Attachment Dataset: `ab17964f0efd46f78cecb4969140f257`
- Save outgoing request drafts only with `cpoSaveDraft`; submit only through a complete `cpoSaveDraft` request with `submit=true`.
- Archive real incoming invoices only with `cpoArchiveIncomingInvoice`.
- Register issued outgoing invoices only with `cpoRegisterIssuedInvoice`.
- Fulfill invoice requests only with `cpoFulfillInvoiceApplication`.
- Allocate outgoing invoices and customer receipts to receivable installments only with `cpoManageReceivableSettlement`.
- Perform later approvals only in Lovrabet Flow.
- Never directly modify controlled workflow, applicant, submission-time, fulfillment, or allocation fields or tables.
- `is_deleted` is a platform system field. Skills, Backend Functions, Hooks, and scripts must not read, filter, assign, or update it. Use Lovrabet `delete` or a controlled Backend Function for cancellation.

## Direction and Processing Path

- **Request an invoice for a customer**: create and submit `invoice_application`; approval does not mean an invoice was issued.
- **Our company actually issued an invoice**: create an `invoice_record` with `invoice_direction=outgoing`, upload the real invoice, register it, and link it to requests and receivable installments according to facts.
- **A vendor or counterparty invoiced our company**: create an `invoice_record` with `invoice_direction=incoming`, upload the real invoice, and archive it directly without the outgoing-request approval flow.
- **Expense receipt**: use the Expense Application Skill and register/link it through `items[].invoices`; do not create a duplicate invoice here.

## Proactive Attachment Handling and Count Gate

Any file supplied in the current request or real-invoice context is intended for that business record. Inventory files by name, size, and available hash, call `lovrabet file upload` for each, and use only real `fileName/filePath/fileType/sourceDir` values from responses. After saving and obtaining a real `bizId`, create the correct relationships:

- Request materials: `biz_type=invoice_application`, `attachment_type=invoice_application_material`.
- Real incoming/outgoing invoice images: `biz_type=invoice`, `attachment_type=invoice`.

Request materials cannot substitute for real invoice images, and real invoice images cannot be linked only to the request. A persistent file may be uploaded once and reused, but every business object needs its own correct relationship.

Before request submission, incoming-invoice archiving, or outgoing-invoice registration, reread `cpoGetBizTimeline` and attachment data. Require unique input files = successful uploads with non-empty real paths, and expected relationships = created relationships = matching post-write relationships. Names and paths must match item by item with no omission, extra item, duplicate, or wrong object. On any mismatch, stop and report expected/actual counts and filenames. An unlinked upload is not complete, and notes cannot replace attachments.

## Counterparty and Name Snapshots

The company name printed on the invoice is a business fact; linking customer or vendor master data is optional governance:

- When an existing customer/vendor matches, link it and retain the printed-name snapshot.
- When none matches, ask whether to create/link a party or keep only the printed name.
- If the user chooses the name only, never fabricate `partner_id`; an incoming invoice must retain its real `seller_name`.
- Create a long-term party only on explicit request, using the existing drawer/modal and without opening another browser window.
- Search by company-name keyword; do not require internal IDs.

User-facing relationships must show a company, contract, application, invoice, or installment name. Never show labels such as `Partner #36` or `Invoice #13`. If a title is missing, show “Related object title missing” and flag the data-quality issue.

## Create an Outgoing Invoice Request

Use `bizType=invoice_application`. Allowed `values` fields are:

- `application_title` (required for submission), `request_type` (default `customer_invoice`).
- `crm_company_id`, `customer_name_snapshot`, `crm_contract_id`, `contract_title_snapshot`.
- `seller_name` (our invoicing entity; required), `buyer_name` (required), `buyer_tax_no`, `buyer_address_phone`, `buyer_bank_account`.
- `requested_amount`, `requested_tax_amount`, `requested_total_amount` (positive total required).
- `currency` (default `CNY`), `tax_rate` (decimal such as `0.06`).
- `invoice_type`: `vat_special`, `vat_normal`, or `other`.
- `invoice_content` (required), `invoice_medium`: `electronic`, `paper`, or `other`.
- `receiver_name`, `receiver_phone`, `receiver_email`, `payment_condition_snapshot`, and `remark`.

`payment_condition_snapshot` records contractual terms such as invoice before/after receipt; never infer whether money actually arrived.

```bash
lovrabet bff exec --appcode app-4d050189 --name cpoSaveDraft --params '{
  "bizType": "invoice_application",
  "values": {
    "application_title": "Customer Technical Service Invoice Request",
    "request_type": "customer_invoice",
    "customer_name_snapshot": "Example Customer Co., Ltd.",
    "contract_title_snapshot": "Annual Technical Service Contract",
    "seller_name": "Hangzhou Qizhi Yuntu Technology Co., Ltd.",
    "buyer_name": "Example Customer Co., Ltd.",
    "requested_amount": 8962.26,
    "requested_tax_amount": 537.74,
    "requested_total_amount": 9500,
    "currency": "CNY",
    "tax_rate": 0.06,
    "invoice_type": "vat_normal",
    "invoice_content": "Technical service fee",
    "invoice_medium": "electronic",
    "payment_condition_snapshot": "Invoice at the contractual milestone",
    "remark": "Covers installment one of 5,500 and installment two of 4,000"
  }
}'
```

Add `bizId` to update a draft or rejected application. When linking a CRM contract, pass `relations` with `relationType=bills_crm_contract`, `targetBizType=crm_contract`, and the real `targetBizId`. Internal IDs are for parameters and relationships only, never display labels.

For submission, add `"submit":true` to the final confirmed complete request. Before submission, require title, customer name, our entity, buyer name, invoice type/content, and positive tax-inclusive total, plus a passed attachment gate whenever materials were supplied. Approval changes the request to `reviewed`; it becomes `completed` only after real invoice fulfillment covers the requested total.

## Register a Real Incoming Invoice

Save `bizType=invoice` through `cpoSaveDraft` with at least `invoice_direction=incoming`, `invoice_no`, `invoice_date`, `seller_name`, `buyer_name`, `invoice_type`, and positive `total_amount`. `partner_id` is optional. Link existing vendor data when available; otherwise retain the real seller name only.

After uploading at least one real invoice file, call:

```bash
lovrabet bff exec --appcode app-4d050189 --name cpoArchiveIncomingInvoice --params '{"invoiceId":123}'
```

Attachments must use `biz_type=invoice`, `attachment_type=invoice`, and real upload paths. All invoice files supplied by the user must pass the count gate. Never fabricate a path or call the outgoing-request submission interface.

## Register and Fulfill a Real Outgoing Invoice

After issuance, save `bizType=invoice` with `invoice_direction=outgoing`, the real number/date/parties/amount/type, and all real invoice images. After the count gate passes:

```bash
lovrabet bff exec --appcode app-4d050189 --name cpoRegisterIssuedInvoice --params '{"invoiceId":456}'
```

Fulfill an approved request by amount:

```bash
lovrabet bff exec --appcode app-4d050189 --name cpoFulfillInvoiceApplication --params '{
  "op": "fulfill",
  "invoiceApplicationId": 123,
  "invoiceId": 456,
  "amount": 9500,
  "remark": "The real invoice has been issued"
}'
```

The Backend Function prevents cumulative fulfillment from exceeding either request total or invoice face total. Cancel an incorrect relationship with `op=cancel` and `fulfillmentId`; never delete relationship-table rows directly.

## Allocate to Receivable Installments

Only real outgoing invoices may be allocated to CRM receivable installments:

```bash
lovrabet bff exec --appcode app-4d050189 --name cpoManageReceivableSettlement --params '{
  "op": "allocateInvoice",
  "crmContractId": 100,
  "receivablePlanId": 201,
  "invoiceId": 456,
  "amount": 5500,
  "remark": "Covers installment one"
}'
```

Allocate another 4,000 to the second installment when one 9,500 invoice covers both. The Backend Function enforces invoice and installment caps and recalculates invoiced and received totals. Cancel with `op=cancelInvoiceAllocation` and `allocationId`. Customer receipt allocations use `allocateReceipt` or `cancelReceiptAllocation`; invoice and receipt allocations never substitute for each other.

## Query and Success Feedback

```bash
lovrabet bff exec --appcode app-4d050189 --name cpoGetBizTimeline --params '{"bizType":"invoice_application","bizId":123}'
lovrabet bff exec --appcode app-4d050189 --name cpoGetBizTimeline --params '{"bizType":"invoice","bizId":456}'
lovrabet bff exec --appcode app-4d050189 --name cpoGetInvoiceCenter --params '{}'
```

Reread and report the real state: request draft/submitted/reviewed/completed, invoice registered or missing attachments, and installment invoiced/partly received/received. Never describe “approved” as “invoiced,” or “invoiced” as “received.”

```markdown
[View “Customer Technical Service Invoice Request”](https://app-4d050189.app.lovrabet.com/application-detail/invoice_application/123)
[View invoice “26337000000000000001”](https://app-4d050189.app.lovrabet.com/application-detail/invoice/456)
```

Use the application title or invoice number as link text, then another clear business name if needed; never fall back to an internal ID.
