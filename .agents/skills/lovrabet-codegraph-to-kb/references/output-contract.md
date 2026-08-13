# Output Contract

lovrabet-codegraph-to-kb 的最终回复必须让运营人员能判断：是否执行、影响了什么、如何复核、失败后下一步做什么。

## 状态枚举

status: success | no_op | partial_success | blocked | failed | needs_manual_check

- success：动作已完成，且关键结果已核对。
- no_op：没有符合条件的对象或无需变更。
- partial_success：部分对象完成，未完成对象必须进入 errors 和 nextActions。
- blocked：缺少输入、权限、确认或平台能力，无法继续。
- failed：执行失败，必须说明失败阶段、错误和恢复方式。
- needs_manual_check：读回异常、状态未知或人工判断缺失。

unknown、partial_success、failed、needs_manual_check 不能包装为 success。

## 输出模式

mode: dry_run | confirmed | read_only

- dry_run：只展示预览、影响范围和差异，不写入业务数据。
- confirmed：用户明确确认后的执行模式；写入后必须读回核对。
- read_only：只查询、汇总或核对，不触发写入。

## 必填字段

- status
- mode
- summary
- scope
- changes
- verification
- warnings
- errors
- nextActions

## 写入结果

write 类型在 dry_run 下只展示预览、影响范围和差异，不写入业务数据。
confirmed 写入后必须执行读回核对，并把核对结果写入 verification。
读回异常、业务状态未知或结果不一致时，status 必须为 partial_success、failed 或 needs_manual_check。

## 错误与人工接管

errors 必须包含失败阶段、错误原因和可复核对象。
nextActions 必须给出重试、补充输入、人工接管或停止处理的动作。
