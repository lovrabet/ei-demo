# Payroll Workbook Recognition Rules

## Worksheet Classification

- A name containing “Payroll” but not “Personnel Cost” produces payroll payment items.
- A name containing “Personnel Cost” is only for cost review and does not directly produce a payment amount.
- A name containing “Social Insurance and Housing Fund” is only for payroll deduction and cost cross-checking and does not produce a payment item.

When one entity has multiple payroll sheets, combine amount and headcount by entity and produce exactly one payment item.

For multiple workbooks, parse each file, merge payment items by payroll entity code, then plan applications by business purpose. Reject duplicate input files to avoid double counting.

## Entity Mapping

| Excel Payroll Entity | Code | Approval Entity | Current ID Hint | Short Name |
| --- | --- | --- | ---: | --- |
| Hangzhou Qizhi Yuntu Technology Co., Ltd. | QZYT | Qizhi Yuntu | 1 | Qizhi Yuntu |
| Hangzhou Meiyou Liuma Technology Co., Ltd. | MYLM | Meiyou Liuma | 2 | Meiyou Liuma |
| Shanghai Branch of Hangzhou Qizhi Yuntu Technology Co., Ltd. | QZYT_SH | Qizhi Yuntu | 3 | Qizhi Yuntu Shanghai Branch |

The ID is only a hint. Before creating drafts, query the internal legal-entity Dataset using `entity_code + entity_name + ACTIVE` and use the live ID.

## Approval Entities and Application Splitting

- Qizhi Yuntu headquarters and its Shanghai Branch share an approval entity but serve different payment purposes and must remain separate applications.
- Meiyou Liuma is an independent approval entity and requires a separate application.
- Default order is `QZYT`, `MYLM`, `QZYT_SH`.
- `QZYT`: headquarters employee payroll.
- `MYLM`: Meiyou Liuma employee payroll.
- `QZYT_SH`: intercompany payment from Qizhi Yuntu to the Shanghai Branch for branch payroll plus individual income tax; use net payroll plus tax and keep it separate.
- Reject cross-approval-entity groups such as `QZYT,MYLM` as a compliance conflict.
- Reject grouping `QZYT_SH` with `QZYT` or another entity as a business-purpose conflict.
- Every recognized payroll entity with an amount above zero must appear in exactly one application plan.

## Amount Precedence

For each entity:

1. If the payroll sheet has an explicit column containing both “Application” and “Amount,” sum it by employee.
2. Otherwise sum “Net Payroll.”
3. Never substitute “Personnel Cost,” “Gross Payroll,” or employer-paid social insurance/housing fund for the payment amount.

If an explicit column says “Net Payroll + Individual Income Tax,” verify:

`application amount = net payroll + individual income tax`

Tolerance is 0.01 yuan. Stop automatic entry and request finance confirmation beyond that tolerance.

## Headcount

- Count only employee rows with a name, payroll entity, and numeric net payroll.
- Exclude total rows, application-amount notes, and blank rows.
- Never output employee names or individual amounts.

## Month and Payment Date

- Extract payroll month from filenames and sheet names; it must be consistent within each file.
- All workbooks must have the same month or automatic entry stops.
- Default payment date is the final calendar day of that month.
- Show the default date for confirmation before draft creation.

## Reconciliation

Employee-level sums must match control totals for gross payroll, net payroll, individual income tax, and explicit application amount when present. Stop when any difference exceeds 0.01 yuan.

Also stop for spreadsheet errors such as `#REF!`, `#VALUE!`, or `#DIV/0!`; uncached key formulas requiring recalculation in Excel/WPS; unmapped or inactive entities; non-positive payment amounts; multiple sheets for one entity that cannot be combined reliably; or conflicting payroll months.

Warn only when a known entity is missing from the complete batch. Never fabricate a zero-amount item.

## Multiple Attachments

- Attach every original workbook covering an application's items as `payroll_sheet`.
- When one workbook covers multiple split applications, retain it separately in each relevant application.
- Do not attach unrelated payroll files or replace originals with summary JSON.
- Preserve the finance source files without merging or rewriting them unless the user explicitly requests a separate consolidated copy.
