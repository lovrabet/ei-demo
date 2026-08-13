/**
 * CPO 发票查重守卫。
 *
 * [脚本描述] 按报销单或发票号码检查同单重复关联、重复发票台账及跨报销占用；可在提交前直接阻断
 * [脚本名称] cpoInvoiceDuplicateGuard
 * [脚本类型] COMMON
 * [本地路径] .rabetbase/bff/app-4d050189/COMMON/cpoInvoiceDuplicateGuard.js
 *
 * @param {Object} params
 * @param {number|string} [params.expenseId] - 当前报销申请 ID；传入后不把本单自身关联视为跨单重复。
 * @param {string|string[]} [params.invoiceNos] - 需要直接核验的发票号码。
 * @param {boolean} [params.assertUnique=false] - 为 true 且发现重复时抛出 DUPLICATE_INVOICE。
 * @param {Object} context - 平台注入上下文。
 * @returns {Promise<Object>} { expenseId, checkedInvoiceCount, invoiceNos, hasDuplicates, duplicates }。
 */
const DATASET_CODES = {
  invoiceRecord: "fc11e2d760b94b2ca2ccf0485ed40ca8", // 数据集: 发票记录 | 数据表: invoice_record
  bizInvoiceLink: "9dd0d102219145ddbb67d1c247a84fb9", // 数据集: 发票关联 | 数据表: biz_invoice_link
  expenseItem: "d99c32ef07b749948cc24fd391f8fd2c", // 数据集: 报销明细 | 数据表: expense_item
  expenseApplication: "7851365c96244a1896e834daec447ddb", // 数据集: 报销申请 | 数据表: expense_application
};

const NON_BLOCKING_EXPENSE_STATUSES = new Set(["cancelled"]);

function rowsOf(response) {
  return Array.isArray(response?.tableData) ? response.tableData : [];
}

function positiveId(value) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

function normalizeInvoiceNo(value) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeInvoiceNos(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return unique(values.map(normalizeInvoiceNo).filter(Boolean));
}

function pushToMap(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function invoiceKey(invoice, fallbackId) {
  const invoiceNo = normalizeInvoiceNo(invoice?.invoice_no);
  return invoiceNo || `ID:${positiveId(invoice?.id || fallbackId)}`;
}

function conflictError(duplicates) {
  const invoiceNos = unique(
    duplicates.map((item) => item.invoiceNo).filter(Boolean),
  );
  const expenseTitles = unique(
    duplicates.flatMap((item) =>
      item.conflictingExpenses.map(
        (expense) => expense.title || "关联报销标题缺失",
      ),
    ),
  );
  return `DUPLICATE_INVOICE:${invoiceNos.join(",") || "NO_INVOICE_NUMBER"}:${expenseTitles
    .join(",") || "当前报销单"}`;
}

export default async function cpoInvoiceDuplicateGuard(params, context) {
  const { expenseId: rawExpenseId, invoiceNos: rawInvoiceNos, assertUnique = false } =
    params || {};
  const expenseId = positiveId(rawExpenseId);
  const requestedInvoiceNos = normalizeInvoiceNos(rawInvoiceNos);
  if (!expenseId && requestedInvoiceNos.length === 0) {
    throw new Error("INVALID_PARAMS:expenseId or invoiceNos is required");
  }

  const models = context.client.models;
  const invoiceModel = models[`dataset_${DATASET_CODES.invoiceRecord}`];
  const linkModel = models[`dataset_${DATASET_CODES.bizInvoiceLink}`];
  const itemModel = models[`dataset_${DATASET_CODES.expenseItem}`];
  const expenseModel = models[`dataset_${DATASET_CODES.expenseApplication}`];

  let currentItems = [];
  let currentLinks = [];
  if (expenseId) {
    currentItems = rowsOf(
      await itemModel.filter({
        where: { expense_id: { $eq: expenseId } },
        select: ["id", "expense_id", "description"],
        currentPage: 1,
        pageSize: 500,
      }),
    );
    const currentItemIds = currentItems.map((item) => positiveId(item.id)).filter(Boolean);
    if (currentItemIds.length) {
      currentLinks = rowsOf(
        await linkModel.filter({
          where: {
            biz_type: { $eq: "expense_item" },
            biz_id: { $in: currentItemIds },
          },
          select: ["id", "invoice_id", "biz_id", "relation_type", "amount_used"],
          currentPage: 1,
          pageSize: 1000,
        }),
      );
    }
  }

  const currentInvoiceIds = unique(
    currentLinks.map((link) => positiveId(link.invoice_id)).filter(Boolean),
  );
  const invoiceQueries = [];
  if (currentInvoiceIds.length) {
    invoiceQueries.push(
      invoiceModel.filter({
        where: { id: { $in: currentInvoiceIds } },
        select: ["id", "invoice_no", "invoice_date", "seller_name", "total_amount", "status"],
        currentPage: 1,
        pageSize: Math.min(1000, currentInvoiceIds.length),
      }),
    );
  }
  if (requestedInvoiceNos.length) {
    invoiceQueries.push(
      invoiceModel.filter({
        where: { invoice_no: { $in: requestedInvoiceNos } },
        select: ["id", "invoice_no", "invoice_date", "seller_name", "total_amount", "status"],
        currentPage: 1,
        pageSize: 1000,
      }),
    );
  }
  const initiallyMatchedInvoices = (await Promise.all(invoiceQueries)).flatMap(rowsOf);
  const initialInvoiceById = new Map(
    initiallyMatchedInvoices.map((invoice) => [positiveId(invoice.id), invoice]),
  );
  const targetInvoiceNos = unique([
    ...requestedInvoiceNos,
    ...initiallyMatchedInvoices.map((invoice) => normalizeInvoiceNo(invoice.invoice_no)).filter(Boolean),
  ]);

  let allMatchingInvoices = [...initialInvoiceById.values()];
  if (targetInvoiceNos.length) {
    const response = await invoiceModel.filter({
      where: { invoice_no: { $in: targetInvoiceNos } },
      select: ["id", "invoice_no", "invoice_date", "seller_name", "total_amount", "status"],
      currentPage: 1,
      pageSize: 1000,
    });
    const invoiceById = new Map(
      [...allMatchingInvoices, ...rowsOf(response)].map((invoice) => [
        positiveId(invoice.id),
        invoice,
      ]),
    );
    allMatchingInvoices = [...invoiceById.values()];
  }

  const invoiceById = new Map(
    allMatchingInvoices.map((invoice) => [positiveId(invoice.id), invoice]),
  );
  const invoiceIds = unique([
    ...currentInvoiceIds,
    ...allMatchingInvoices.map((invoice) => positiveId(invoice.id)).filter(Boolean),
  ]);
  let allLinks = [];
  if (invoiceIds.length) {
    allLinks = rowsOf(
      await linkModel.filter({
        where: {
          invoice_id: { $in: invoiceIds },
          biz_type: { $eq: "expense_item" },
        },
        select: ["id", "invoice_id", "biz_id", "relation_type", "amount_used"],
        currentPage: 1,
        pageSize: 2000,
      }),
    );
  }

  const linkedItemIds = unique(
    allLinks.map((link) => positiveId(link.biz_id)).filter(Boolean),
  );
  let linkedItems = [];
  if (linkedItemIds.length) {
    linkedItems = rowsOf(
      await itemModel.filter({
        where: { id: { $in: linkedItemIds } },
        select: ["id", "expense_id", "description"],
        currentPage: 1,
        pageSize: Math.min(2000, linkedItemIds.length),
      }),
    );
  }
  const itemById = new Map(linkedItems.map((item) => [positiveId(item.id), item]));
  const linkedExpenseIds = unique(
    linkedItems.map((item) => positiveId(item.expense_id)).filter(Boolean),
  );
  let linkedExpenses = [];
  if (linkedExpenseIds.length) {
    linkedExpenses = rowsOf(
      await expenseModel.filter({
        where: { id: { $in: linkedExpenseIds } },
        select: ["id", "title", "status", "submitted_at"],
        currentPage: 1,
        pageSize: Math.min(1000, linkedExpenseIds.length),
      }),
    );
  }
  const expenseById = new Map(
    linkedExpenses.map((expense) => [positiveId(expense.id), expense]),
  );

  const invoicesByKey = new Map();
  for (const invoice of allMatchingInvoices) {
    pushToMap(invoicesByKey, invoiceKey(invoice, invoice.id), invoice);
  }
  for (const invoiceNo of requestedInvoiceNos) {
    if (!invoicesByKey.has(invoiceNo)) invoicesByKey.set(invoiceNo, []);
  }
  for (const invoiceId of currentInvoiceIds) {
    const invoice = invoiceById.get(invoiceId);
    const key = invoiceKey(invoice, invoiceId);
    if (!invoicesByKey.has(key)) invoicesByKey.set(key, invoice ? [invoice] : []);
  }

  const currentLinkIds = new Set(currentLinks.map((link) => positiveId(link.id)));
  const duplicates = [];
  for (const [key, invoices] of invoicesByKey) {
    const idsForKey = new Set(
      invoices.map((invoice) => positiveId(invoice.id)).filter(Boolean),
    );
    if (key.startsWith("ID:")) idsForKey.add(positiveId(key.slice(3)));
    const linksForKey = allLinks.filter((link) => idsForKey.has(positiveId(link.invoice_id)));
    const currentLinksForKey = linksForKey.filter((link) => currentLinkIds.has(positiveId(link.id)));

    const conflictingExpenseMap = new Map();
    for (const link of linksForKey) {
      const item = itemById.get(positiveId(link.biz_id));
      const linkedExpenseId = positiveId(item?.expense_id);
      if (!linkedExpenseId || linkedExpenseId === expenseId) continue;
      const expense = expenseById.get(linkedExpenseId);
      if (!expense || NON_BLOCKING_EXPENSE_STATUSES.has(String(expense.status || ""))) {
        continue;
      }
      if (!conflictingExpenseMap.has(linkedExpenseId)) {
        conflictingExpenseMap.set(linkedExpenseId, {
          expenseId: linkedExpenseId,
          title: String(expense.title || "关联报销标题缺失"),
          status: String(expense.status || ""),
          submittedAt: expense.submitted_at || null,
          itemIds: [],
          linkIds: [],
        });
      }
      const conflict = conflictingExpenseMap.get(linkedExpenseId);
      conflict.itemIds.push(positiveId(link.biz_id));
      conflict.linkIds.push(positiveId(link.id));
    }

    const reasons = [];
    if (expenseId && currentLinksForKey.length > 1) reasons.push("same_expense_multiple_links");
    if (invoices.length > 1) reasons.push("duplicate_invoice_records");
    if (conflictingExpenseMap.size > 0) reasons.push("used_by_other_expense");
    if (!reasons.length) continue;

    duplicates.push({
      invoiceNo: key.startsWith("ID:") ? "" : key,
      invoiceIds: unique([...idsForKey].filter(Boolean)),
      reasons,
      currentLinkIds: currentLinksForKey.map((link) => positiveId(link.id)).filter(Boolean),
      duplicateRecordIds: invoices.map((invoice) => positiveId(invoice.id)).filter(Boolean),
      conflictingExpenses: [...conflictingExpenseMap.values()].map((expense) => ({
        ...expense,
        itemIds: unique(expense.itemIds.filter(Boolean)),
        linkIds: unique(expense.linkIds.filter(Boolean)),
      })),
    });
  }

  const result = {
    expenseId: expenseId || null,
    checkedInvoiceCount: invoicesByKey.size,
    invoiceNos: [...invoicesByKey.keys()].filter((key) => !key.startsWith("ID:")),
    hasDuplicates: duplicates.length > 0,
    duplicates,
  };
  if (assertUnique && result.hasDuplicates) {
    throw new Error(conflictError(duplicates));
  }
  return result;
}
