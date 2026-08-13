# Runtime Contract

## 运行态入口

- AppCode：`app-4d050189`
- Backend Function：`cpoCheckInvoiceDuplicates`
- 请求：`{ "expenseId": number }` 或 `{ "invoiceNos": string[] }`
- 返回：`{ expenseId, checkedInvoiceCount, invoiceNos, hasDuplicates, duplicates }`

查重规则由服务端统一维护，已删除记录的可见性由 Lovrabet 平台统一处理。Skill 不读取数据集明细后自行复刻规则，不拼接或操作平台系统字段，也不直接调用数据写接口。

## 权限与凭证

- 使用 Lovrabet 当前登录态调用 BFF。
- 不读取、输出或保存 AccessKey、Cookie、签名地址或其它明文凭证。
- 权限不足时停止，不切换账号、不修改本地配置、不改用 Instant API 绕过。

## 只读边界

本 Skill 为只读能力：

- 不更新发票状态。
- 不删除重复台账或发票关联。
- 不修改或提交报销单。
- 不把发票预查成功视为提交成功。

正式提交报销时，`cpoSubmitApplication` 会再次调用同一服务端守卫；发现重复时返回 `DUPLICATE_INVOICE` 并保持原单状态不变。

## 核对

只有 BFF 正常返回且 `hasDuplicates` 为明确布尔值时才能给出结论。缺少该字段、部分数据不可见或调用失败时，使用 `needs_manual_check` 或 `failed`。
