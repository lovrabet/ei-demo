# Output Contract

最终回复包含：

- `status`: `success | no_op | blocked | failed | needs_manual_check`
- `mode`: 固定为 `read_only`
- `summary`: 一句话说明是否发现重复
- `scope`: 报销单 ID 或发票号码
- `duplicates`: 重复发票列表；每项包含发票号码、原因、冲突报销单
- `warnings`: 无号码票据、台账缺失、权限不足等限制
- `nextActions`: 复核冲突单据、取消错误关联或联系财务处理；不得自动清理

映射规则：

- 已完成检查且发现重复：`success`
- 已完成检查且未发现重复：`no_op`
- 缺少输入或无权限：`blocked`
- BFF 调用失败：`failed`
- 返回不完整、无号码票据无法确认：`needs_manual_check`

示例：

```yaml
status: success
mode: read_only
summary: 发现 1 张重复发票
scope: 报销单 #14
duplicates:
  - invoiceNo: "26337000000590589880"
    reasons: [used_by_other_expense]
    conflictingExpenses:
      - expenseId: 11
        title: 7 月通讯费报销
        status: submitted
warnings: []
nextActions:
  - 打开报销单 #11 核对原始附件和发票关联
  - 确认错误关联后由有权限人员处理
```
