#!/bin/bash
# Generate standard Smart List Pages for all datasets that had them in yuntoo-ei.
set -u
cd /Users/tangshuang/data/gitlab/yuntoo/oa-combo/oa-demo

ALIASES="businessPartner bizActionRecord bizInvoiceLink companyCredential contractApplication cpoDictionary expenseApplication expenseItem expenseRule invoiceRecord paymentApplication travelApplication attachment"

for alias in $ALIASES; do
  result=$(rabetbase page generate-start --alias "$alias" --apply --format json 2>/dev/null)
  ok=$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok'))" 2>/dev/null)
  opid=$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'].get('operationId',''))" 2>/dev/null)
  reused=$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin)['data'].get('reused',''))" 2>/dev/null)
  echo "[$alias] start ok=$ok op=$opid reused=$reused"
  if [ "$ok" != "True" ]; then continue; fi
  if [ "$reused" = "True" ]; then continue; fi
  # poll until terminal
  for i in $(seq 1 40); do
    sleep 15
    st=$(rabetbase page generate-status --alias "$alias" --operation-id "$opid" --format json 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']
print(d.get('jobStatus') or d.get('status') or '')" 2>/dev/null)
    case "$st" in
      SUCCESS|FAILED|CANCELLED|PARTIAL_SUCCESS)
        echo "[$alias] final=$st"
        break;;
    esac
  done
done
echo "ALL PAGE GENERATION DONE"
