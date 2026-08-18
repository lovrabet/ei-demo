/**
 * title: 新建报销
 */
import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Card,
  Form,
  Input,
  Select,
  Button,
  Space,
  message,
  Drawer,
  Skeleton,
  Tooltip,
} from "antd";
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  FileTextOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { lovrabetClient } from "@/api/client";
import AgentFormGuide from "@/components/agent-form-guide";
import AttachmentUpload from "@/components/attachment-upload";
import FormFooter from "@/components/form-footer";
import FormLayout, { FormRow } from "@/components/form-layout";
import MoneyInput from "@/components/money-input";
import {
  type AttachmentFileValue,
  listAttachmentValues,
  syncAttachmentRecords,
} from "@/features/attachments/api";
import { collectCpoFormValues } from "@/features/cpo-workflow/form-submit";
import {
  CPO_FORM_CANCEL_PATH,
  isWorkflowReadonly,
} from "@/features/cpo-workflow/routes";
import {
  CURRENT_ACTOR_SCRIPT,
  prefillApplicantFields,
  type CurrentActor,
} from "@/features/current-actor/api";
import { useCpoDictionaryOptions } from "@/features/cpo-dictionary/options";
import InvoiceSellerInput from "@/features/cpo-invoice-counterparty/InvoiceSellerInput";
import { normalizeInvoiceDate } from "./date";
import styles from "./index.module.css";

const ATTACHMENTS_FIELD = "_attachments";
const RELATED_TRAVEL_FIELD = "_related_travel_id";
const EXPENSE_ITEMS_FIELD = "_expense_items";

type RelatableTravelOption = {
  value: number;
  label: string;
};

type ExpenseItemFormValue = {
  id?: number;
  description?: string;
  cny_amount?: number;
  reimbursable_cny_amount?: number;
  remark?: string;
  invoices?: Array<{
    invoice_id?: number;
    invoice_no?: string;
    amount_used?: number;
    total_amount?: number;
    invoice_date?: string | number;
    seller_name?: string;
    partner_id?: number;
    partner_source?: "business_partner" | "manual";
    partner_name_snapshot?: string;
    buyer_name?: string;
    file_path?: string;
    files?: AttachmentFileValue[];
  }>;
};

const EMPTY_EXPENSE_ITEM: ExpenseItemFormValue = {};
const EXPENSE_FORM_MAX_WIDTH = 1180;
const EXPENSE_ITEM_TABLE_MIN_WIDTH = 1040;
const EXPENSE_ITEM_TABLE_COLUMNS =
  "minmax(240px, 1.2fr) 160px 160px minmax(320px, 1.6fr) 130px";
const INVOICE_ROW_COLUMNS =
  "240px 120px 130px minmax(220px, 1fr) minmax(180px, .9fr) 32px";

function toMoney(value: any) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function expenseSubmitErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "");
  const duplicate = raw.match(/DUPLICATE_INVOICE:([^:]*):([^\s]+)/);
  if (duplicate) {
    const invoiceNos =
      duplicate[1] === "NO_INVOICE_NUMBER" ? "无号码票据" : duplicate[1];
    const conflicts =
      duplicate[2] === "current_expense"
        ? "当前报销单内存在重复关联"
        : `已关联 ${duplicate[2]}`;
    return `检测到重复发票 ${invoiceNos}，${conflicts}，已禁止提交`;
  }
  return raw || "未知错误";
}

function calculateItemPreview(item?: ExpenseItemFormValue) {
  const cnyAmount = toMoney(item?.cny_amount);
  const reimbursableAmount =
    item?.reimbursable_cny_amount === undefined ||
    item?.reimbursable_cny_amount === null
      ? cnyAmount
      : toMoney(item.reimbursable_cny_amount);
  return {
    cnyAmount,
    reimbursableAmount,
  };
}

function summarizeItems(items?: ExpenseItemFormValue[]) {
  return (items || []).reduce(
    (summary, item) => {
      const preview = calculateItemPreview(item);
      return {
        totalOriginal: toMoney(summary.totalOriginal + preview.cnyAmount),
        totalCny: toMoney(summary.totalCny + preview.cnyAmount),
        reimbursable: toMoney(
          summary.reimbursable + preview.reimbursableAmount,
        ),
      };
    },
    { totalOriginal: 0, totalCny: 0, reimbursable: 0 },
  );
}

function mergeAttachmentFiles(
  ...groups: Array<AttachmentFileValue[] | undefined>
) {
  const filesByPath = new Map<string, AttachmentFileValue>();
  groups
    .flatMap((group) => group || [])
    .forEach((file) => {
      if (!file?.filePath) return;
      const existing = filesByPath.get(file.filePath);
      if (!existing || (!existing.id && file.id)) {
        filesByPath.set(file.filePath, file);
      }
    });
  return Array.from(filesByPath.values());
}

function InvoiceSummary({
  item,
  onOpen,
  readOnly,
}: {
  item?: ExpenseItemFormValue;
  onOpen: () => void;
  readOnly: boolean;
}) {
  const invoices = item?.invoices || [];

  return (
    <Tooltip title={readOnly ? "查看发票" : "管理发票"}>
      <Button
        type="text"
        size="small"
        disabled={false}
        className={styles.invoiceCountAction}
        icon={<FileTextOutlined />}
        onClick={onOpen}
        aria-label={`${readOnly ? "查看" : "管理"} ${invoices.length} 张发票`}
      >
        {invoices.length} 张发票
      </Button>
    </Tooltip>
  );
}

function normalizeExpenseItemForSave(item: ExpenseItemFormValue) {
  const preview = calculateItemPreview(item);
  const reimburseRatio =
    preview.cnyAmount > 0
      ? Math.round((preview.reimbursableAmount / preview.cnyAmount) * 10000) /
        10000
      : 1;
  return {
    ...(item.id ? { id: item.id } : {}),
    category: "other",
    description: item.description || "",
    original_currency: "CNY",
    original_amount: preview.cnyAmount,
    exchange_rate_to_cny: 1,
    cny_amount: preview.cnyAmount,
    reimburse_ratio: reimburseRatio,
    reimbursable_cny_amount: preview.reimbursableAmount,
    compliance_status: "pending_review",
    remark: item.remark || "",
    ...(item.invoices?.length
      ? {
          invoices: item.invoices.map((invoice) => ({
            ...(invoice.invoice_id
              ? { invoice_id: Number(invoice.invoice_id) }
              : {}),
            ...(invoice.invoice_no
              ? { invoice_no: invoice.invoice_no.trim() }
              : {}),
            amount_used: toMoney(invoice.amount_used ?? invoice.total_amount),
            total_amount: toMoney(invoice.total_amount ?? invoice.amount_used),
            ...(invoice.invoice_date
              ? { invoice_date: normalizeInvoiceDate(invoice.invoice_date) }
              : {}),
            ...(invoice.seller_name
              ? { seller_name: invoice.seller_name.trim() }
              : {}),
            ...(invoice.partner_id
              ? { partner_id: Number(invoice.partner_id) }
              : {}),
            partner_source: invoice.partner_id ? "business_partner" : "manual",
            ...(invoice.partner_name_snapshot?.trim() ||
            invoice.seller_name?.trim()
              ? {
                  partner_name_snapshot:
                    invoice.partner_name_snapshot?.trim() ||
                    invoice.seller_name?.trim(),
                }
              : {}),
            ...(invoice.buyer_name
              ? { buyer_name: invoice.buyer_name.trim() }
              : {}),
            ...(invoice.file_path || invoice.files?.[0]?.filePath
              ? { file_path: invoice.file_path || invoice.files?.[0]?.filePath }
              : {}),
          })),
        }
      : {}),
  };
}

function buildExpenseRelations(values: any) {
  const targetBizId = Number(values[RELATED_TRAVEL_FIELD]);
  if (
    values.expense_type !== "travel" ||
    !Number.isFinite(targetBizId) ||
    targetBizId <= 0
  ) {
    return [];
  }

  return [
    {
      relationType: "reimburses_travel",
      targetBizType: "travel",
      targetBizId,
    },
  ];
}

const ExpenseForm: React.FC = () => {
  const [params] = useSearchParams();
  const editId = params.get("id");
  const mode = params.get("mode");
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordStatus, setRecordStatus] = useState<string>();
  const [invoiceManagerItemName, setInvoiceManagerItemName] = useState<
    number | null
  >(null);
  const [travelOptions, setTravelOptions] = useState<RelatableTravelOption[]>(
    [],
  );
  const [travelOptionsLoading, setTravelOptionsLoading] = useState(false);
  const {
    options: expenseTypeOptions,
    loading: expenseTypeOptionsLoading,
    error: expenseTypeOptionsError,
  } = useCpoDictionaryOptions("expense_type");
  const isEdit = !!editId;
  const readOnly = isWorkflowReadonly(recordStatus, mode);

  // 监听 expense_type 切换：非差旅清空 travel_type
  const expenseType = Form.useWatch("expense_type", form);
  const expenseItems = Form.useWatch(EXPENSE_ITEMS_FIELD, form) as
    ExpenseItemFormValue[] | undefined;
  const attachmentFiles = Form.useWatch(ATTACHMENTS_FIELD, form) as
    AttachmentFileValue[] | undefined;
  const itemSummary = summarizeItems(expenseItems);
  const invoiceAttachmentOptions = (attachmentFiles || [])
    .filter((file) => file.filePath)
    .map((file) => ({
      label: file.fileName || file.filePath,
      value: file.filePath,
    }));

  useEffect(() => {
    form.setFieldsValue({
      total_original_amount: itemSummary.totalOriginal,
      total_cny_amount: itemSummary.totalCny,
      reimbursable_cny_amount: itemSummary.reimbursable,
    });
  }, [
    form,
    itemSummary.totalOriginal,
    itemSummary.totalCny,
    itemSummary.reimbursable,
  ]);

  useEffect(() => {
    if (
      editId ||
      form.getFieldValue("expense_type") ||
      !expenseTypeOptions.length
    ) {
      return;
    }
    form.setFieldValue("expense_type", expenseTypeOptions[0].value);
  }, [editId, expenseTypeOptions, form]);

  useEffect(() => {
    if (!editId) return;
    setLoading(true);
    lovrabetClient.bff
      .execute<any>({
        scriptName: "cpoGetBizTimeline",
        params: { bizType: "expense", bizId: Number(editId) },
      })
      .then(async (detail: any) => {
        const rec = detail?.biz;
        if (rec?.id) {
          const [approvalAttachments, invoiceAttachments, relations] =
            await Promise.all([
              listAttachmentValues({
                bizType: "expense",
                bizId: Number(rec.id),
                attachmentType: "approval_material",
              }),
              listAttachmentValues({
                bizType: "expense",
                bizId: Number(rec.id),
                attachmentType: "invoice",
              }),
              lovrabetClient.bff
                .execute<{ tableData?: any[] }>({
                  scriptName: "cpoGetBizRelations",
                  params: {
                    bizType: "expense",
                    bizId: Number(rec.id),
                    relationType: "reimburses_travel",
                  },
                })
                .catch(() => ({ tableData: [] })),
            ]);
          const relatedTravel = (relations.tableData || []).find(
            (relation) => relation.target_biz_type === "travel",
          );
          const items = (detail.expenseItems || []).map((item: any) => ({
            id: Number(item.id),
            description: item.description || "",
            cny_amount: item.cny_amount,
            reimbursable_cny_amount: item.reimbursable_cny_amount,
            remark: item.remark || "",
            invoices: (item.invoice_links || [])
              .filter((link: any) => link.relation_type === "actual")
              .map((link: any) => ({
                invoice_id: Number(link.invoice_id),
                amount_used: link.amount_used,
                total_amount: link.invoice?.total_amount ?? link.amount_used,
                invoice_no: link.invoice?.invoice_no,
                invoice_date: normalizeInvoiceDate(link.invoice?.invoice_date),
                seller_name: link.invoice?.seller_name,
                partner_id: link.invoice?.partner_id
                  ? Number(link.invoice.partner_id)
                  : undefined,
                partner_source: link.invoice?.partner_id
                  ? "business_partner"
                  : "manual",
                partner_name_snapshot:
                  link.invoice?.partner_name_snapshot ||
                  link.invoice?.seller_name,
                buyer_name: link.invoice?.buyer_name,
                file_path: link.invoice?.file_path,
                files: link.invoice?.file_path
                  ? [
                      {
                        fileName:
                          link.invoice.file_path.split("/").pop() ||
                          link.invoice.file_path,
                        filePath: link.invoice.file_path,
                      },
                    ]
                  : [],
              })),
          }));
          const linkedInvoiceFiles = items.flatMap(
            (item: ExpenseItemFormValue) =>
              (item.invoices || []).flatMap((invoice) => invoice.files || []),
          );
          form.setFieldsValue({
            ...rec,
            [EXPENSE_ITEMS_FIELD]: items,
            [ATTACHMENTS_FIELD]: mergeAttachmentFiles(
              approvalAttachments,
              invoiceAttachments.map(({ id: _legacyId, ...file }) => file),
              linkedInvoiceFiles,
            ),
            [RELATED_TRAVEL_FIELD]: relatedTravel
              ? Number(relatedTravel.target_biz_id)
              : undefined,
          });
          setRecordStatus(rec.status);
        } else message.error("未找到该报销");
      })
      .catch((e: any) => message.error(`加载失败：${e?.message || e}`))
      .finally(() => setLoading(false));
  }, [editId, form]);

  // 预填当前用户
  useEffect(() => {
    lovrabetClient.bff
      .execute<CurrentActor>({
        scriptName: CURRENT_ACTOR_SCRIPT,
        params: {},
      })
      .then((actor) => prefillApplicantFields(form, actor))
      .catch(() => undefined);
  }, [form]);

  useEffect(() => {
    if (expenseType !== "travel") {
      form.setFieldValue(RELATED_TRAVEL_FIELD, undefined);
      setTravelOptions([]);
      return;
    }

    setTravelOptionsLoading(true);
    lovrabetClient.bff
      .execute<{ tableData?: RelatableTravelOption[] }>({
        scriptName: "cpoListRelatableBizOptions",
        params: {
          sourceBizType: "expense",
          relationType: "reimburses_travel",
          pageSize: 50,
        },
      })
      .then((result) => {
        const options = result.tableData || [];
        const selected = Number(form.getFieldValue(RELATED_TRAVEL_FIELD));
        if (
          Number.isFinite(selected) &&
          selected > 0 &&
          !options.some((option) => Number(option.value) === selected)
        ) {
          setTravelOptions([
            { value: selected, label: "关联差旅标题缺失" },
            ...options,
          ]);
          return;
        }
        setTravelOptions(options);
      })
      .catch(() => setTravelOptions([]))
      .finally(() => setTravelOptionsLoading(false));
  }, [expenseType, form]);

  const onSave = async (thenSubmit: boolean) => {
    if (readOnly) {
      message.warning("当前单据不可编辑");
      return;
    }
    let values: any;
    try {
      values = await collectCpoFormValues(
        form,
        thenSubmit ? "submit" : "draft",
      );
    } catch {
      return;
    }
    if (thenSubmit && values.expense_type === "travel" && !values.travel_type) {
      message.error("差旅类报销必须填写差旅类型（境内 / 境外）");
      return;
    }
    const normalizedItems = (values[EXPENSE_ITEMS_FIELD] || [])
      .filter((item: ExpenseItemFormValue) =>
        Boolean(
          item?.description ||
          item?.cny_amount ||
          item?.reimbursable_cny_amount ||
          item?.remark,
        ),
      )
      .map(normalizeExpenseItemForSave);
    if (thenSubmit && normalizedItems.length === 0) {
      message.error("提交报销前请至少填写一条报销明细");
      return;
    }
    setSaving(true);
    try {
      const summary = summarizeItems(normalizedItems);
      const payload: any = {
        expense_type: values.expense_type ?? null,
        title: values.title ?? "",
        total_original_amount: summary.totalOriginal,
        total_cny_amount: summary.totalCny,
        reimbursable_cny_amount: summary.reimbursable,
        payout_currency: "CNY",
        travel_type:
          values.expense_type === "travel"
            ? (values.travel_type ?? null)
            : null,
        remark: values.remark ?? "",
      };

      const saved = await lovrabetClient.bff.execute<{ bizId: number }>({
        scriptName: "cpoSaveDraft",
        params: {
          bizType: "expense",
          bizId: isEdit ? Number(editId) : undefined,
          values: payload,
          items: normalizedItems,
          relations: buildExpenseRelations(values),
          submit: thenSubmit,
        },
      });
      const id = saved.bizId;
      const attachments = await syncAttachmentRecords({
        bizType: "expense",
        bizId: id,
        attachmentType: "approval_material",
        files: values[ATTACHMENTS_FIELD],
        uploadedBy: values.applicant_name_snapshot,
      });
      form.setFieldValue(ATTACHMENTS_FIELD, attachments);

      // 旧版会为同一文件再创建一条 invoice 附件记录。统一附件池后清理该重复关系；
      // 发票台账通过 file_path 引用文件，biz_invoice_link 继续关联报销明细。
      await syncAttachmentRecords({
        bizType: "expense",
        bizId: id,
        attachmentType: "invoice",
        files: [],
        uploadedBy: values.applicant_name_snapshot,
      });

      if (thenSubmit) {
        message.success("已提交审核");
        navigate("/25a3c0821c9144609c4d081f3af76f9e");
      } else {
        message.success(isEdit ? "已更新" : "草稿已保存");
      }
    } catch (e: any) {
      message.error(
        `${thenSubmit ? "提交" : "保存"}失败：${expenseSubmitErrorMessage(e)}`,
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton active paragraph={{ rows: 8 }} />;

  return (
    <Card
      style={{ maxWidth: EXPENSE_FORM_MAX_WIDTH, margin: "0 auto" }}
      title={
        <Space>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(-1)}
          />
          {readOnly ? "查看报销" : isEdit ? "编辑报销" : "新建报销"}
        </Space>
      }
    >
      {readOnly ? null : (
        <AgentFormGuide
          skillCode="cpo-expense-application"
          skillName="报销申请助手"
          prompt="请根据我上传的发票和报销材料创建并提交报销申请"
          description="上传发票和报销材料后，Agent 可自动识别票面信息、核验重复风险并完成申请。"
        />
      )}
      <Form
        form={form}
        layout="vertical"
        disabled={saving || readOnly}
        requiredMark
      >
        <FormLayout maxWidth="100%">
          <Form.Item
            label="报销标题"
            name="title"
            rules={[{ required: true, message: "请输入报销标题" }]}
          >
            <Input
              placeholder="如：6 月杭州-北京差旅"
              maxLength={120}
              showCount
            />
          </Form.Item>

          <FormRow
            template={expenseType === "travel" ? "minmax(0, 1fr) 140px" : "1fr"}
          >
            <Form.Item
              label="报销类型"
              name="expense_type"
              rules={[{ required: true, message: "请选择" }]}
            >
              <Select
                loading={expenseTypeOptionsLoading}
                status={expenseTypeOptionsError ? "error" : undefined}
                notFoundContent={
                  expenseTypeOptionsError ? "报销类型字典加载失败" : undefined
                }
                options={expenseTypeOptions}
              />
            </Form.Item>
            {expenseType === "travel" && (
              <Form.Item
                label="差旅类型"
                name="travel_type"
                rules={[{ required: true, message: "差旅报销必须选择" }]}
                initialValue="domestic"
              >
                <Select
                  options={[
                    { value: "domestic", label: "境内" },
                    { value: "overseas", label: "境外" },
                  ]}
                />
              </Form.Item>
            )}
          </FormRow>

          {expenseType === "travel" && (
            <Form.Item label="关联差旅申请" name={RELATED_TRAVEL_FIELD}>
              <Select
                allowClear
                showSearch
                loading={travelOptionsLoading}
                optionFilterProp="label"
                placeholder="选择已审批通过的差旅申请"
                options={travelOptions}
              />
            </Form.Item>
          )}

          <FormRow template="repeat(2, minmax(260px, 1fr))">
            <Form.Item
              label="原始消费合计"
              name="total_original_amount"
              rules={[{ required: true, message: "请输入" }]}
              initialValue={0}
            >
              <MoneyInput min={0} minWidth={260} disabled />
            </Form.Item>
            <Form.Item
              label="折算人民币合计"
              name="total_cny_amount"
              rules={[{ required: true, message: "请输入" }]}
              initialValue={0}
            >
              <MoneyInput min={0} minWidth={260} disabled />
            </Form.Item>
            <Form.Item
              label="最终可报销金额"
              name="reimbursable_cny_amount"
              rules={[{ required: true, message: "请输入" }]}
              initialValue={0}
            >
              <MoneyInput min={0} minWidth={260} disabled />
            </Form.Item>
          </FormRow>

          <Form.Item label="报销明细" className={styles.expenseDetailsField}>
            <Form.List
              name={EXPENSE_ITEMS_FIELD}
              initialValue={[EMPTY_EXPENSE_ITEM]}
            >
              {(fields, { add, remove }) => (
                <Space
                  direction="vertical"
                  className={styles.expenseDetails}
                  size={12}
                >
                  <div
                    className={styles.expenseTableScroll}
                    style={{ overflowX: "auto" }}
                  >
                    <div style={{ minWidth: EXPENSE_ITEM_TABLE_MIN_WIDTH }}>
                      <div
                        className={styles.expenseHeader}
                        style={{
                          gridTemplateColumns: EXPENSE_ITEM_TABLE_COLUMNS,
                        }}
                      >
                        <div>报销项目</div>
                        <div>发票金额</div>
                        <div>实际报销金额</div>
                        <div>备注</div>
                        <div />
                      </div>
                      <div className={styles.expenseItemList}>
                        {fields.map((field, itemIndex) => (
                          <section
                            key={field.key}
                            className={styles.expenseItem}
                            aria-label={`报销项目 ${itemIndex + 1}`}
                          >
                            <div
                              className={styles.expenseItemMain}
                              style={{
                                gridTemplateColumns: EXPENSE_ITEM_TABLE_COLUMNS,
                              }}
                            >
                              <Form.Item
                                name={[field.name, "description"]}
                                rules={[
                                  { required: true, message: "请输入报销项目" },
                                ]}
                                style={{ marginBottom: 0 }}
                              >
                                <Input placeholder="如：机票报销-宋建敏-返程" />
                              </Form.Item>
                              <Form.Item
                                name={[field.name, "cny_amount"]}
                                rules={[
                                  { required: true, message: "请输入发票金额" },
                                ]}
                                style={{ marginBottom: 0 }}
                              >
                                <MoneyInput
                                  min={0}
                                  minWidth="100%"
                                  aria-label="发票金额"
                                />
                              </Form.Item>
                              <Form.Item
                                name={[field.name, "reimbursable_cny_amount"]}
                                rules={[
                                  {
                                    required: true,
                                    message: "请输入实际报销金额",
                                  },
                                ]}
                                style={{ marginBottom: 0 }}
                              >
                                <MoneyInput
                                  min={0}
                                  minWidth="100%"
                                  aria-label="实际报销金额"
                                />
                              </Form.Item>
                              <Form.Item
                                name={[field.name, "remark"]}
                                style={{ marginBottom: 0 }}
                              >
                                <Input.TextArea
                                  autoSize={{ minRows: 1, maxRows: 4 }}
                                  placeholder="对应发票文件名、航段、舱位或折扣说明"
                                />
                              </Form.Item>
                              <div className={styles.expenseItemActions}>
                                {!readOnly && fields.length > 1 ? (
                                  <Tooltip title="删除明细">
                                    <Button
                                      danger
                                      type="text"
                                      size="small"
                                      icon={<DeleteOutlined />}
                                      onClick={() => remove(field.name)}
                                      aria-label="删除明细"
                                    />
                                  </Tooltip>
                                ) : null}
                                <InvoiceSummary
                                  item={expenseItems?.[field.name]}
                                  readOnly={readOnly}
                                  onOpen={() =>
                                    setInvoiceManagerItemName(field.name)
                                  }
                                />
                              </div>
                            </div>

                            <Drawer
                              title="管理发票"
                              placement="right"
                              width="min(1120px, 96vw)"
                              footer={null}
                              open={invoiceManagerItemName === field.name}
                              onClose={() => setInvoiceManagerItemName(null)}
                              forceRender
                              styles={{ body: { overflowY: "auto" } }}
                            >
                              <Form.List name={[field.name, "invoices"]}>
                                {(
                                  invoiceFields,
                                  { add: addInvoice, remove: removeInvoice },
                                ) => (
                                  <div className={styles.invoiceManager}>
                                    {invoiceFields.length ? (
                                      <div className={styles.invoiceList}>
                                        {invoiceFields.map(
                                          (invoiceField, invoiceIndex) => {
                                            const invoiceValue =
                                              expenseItems?.[field.name]
                                                ?.invoices?.[invoiceField.name];
                                            const existingInvoice = Boolean(
                                              invoiceValue?.invoice_id,
                                            );

                                            return (
                                              <div
                                                key={invoiceField.key}
                                                className={styles.invoiceRow}
                                                aria-label={`关联发票 ${invoiceIndex + 1}`}
                                              >
                                                <div
                                                  className={
                                                    styles.invoiceFields
                                                  }
                                                  style={{
                                                    gridTemplateColumns:
                                                      INVOICE_ROW_COLUMNS,
                                                  }}
                                                >
                                                  <Form.Item
                                                    name={[
                                                      invoiceField.name,
                                                      "invoice_no",
                                                    ]}
                                                    rules={[
                                                      {
                                                        required: true,
                                                        message:
                                                          "请输入20位发票号码",
                                                      },
                                                      {
                                                        pattern: /^\d{20}$/,
                                                        message:
                                                          "发票号码须为20位数字",
                                                      },
                                                    ]}
                                                    style={{ marginBottom: 0 }}
                                                  >
                                                    <Input
                                                      disabled={existingInvoice}
                                                      placeholder="20位发票号码"
                                                    />
                                                  </Form.Item>
                                                  <Form.Item
                                                    name={[
                                                      invoiceField.name,
                                                      "total_amount",
                                                    ]}
                                                    rules={[
                                                      {
                                                        required: true,
                                                        message:
                                                          "请输入票面金额",
                                                      },
                                                    ]}
                                                    style={{ marginBottom: 0 }}
                                                  >
                                                    <MoneyInput
                                                      disabled={existingInvoice}
                                                      min={0.01}
                                                      minWidth="100%"
                                                      aria-label="票面金额"
                                                    />
                                                  </Form.Item>
                                                  <Form.Item
                                                    name={[
                                                      invoiceField.name,
                                                      "invoice_date",
                                                    ]}
                                                    style={{ marginBottom: 0 }}
                                                  >
                                                    <Input
                                                      disabled={existingInvoice}
                                                      placeholder="YYYY-MM-DD"
                                                    />
                                                  </Form.Item>
                                                  <Form.Item
                                                    name={[
                                                      invoiceField.name,
                                                      "seller_name",
                                                    ]}
                                                    rules={[
                                                      {
                                                        required: true,
                                                        whitespace: true,
                                                        message:
                                                          "请输入发票票面销售方",
                                                      },
                                                    ]}
                                                    style={{ marginBottom: 0 }}
                                                  >
                                                    <InvoiceSellerInput
                                                      disabled={
                                                        readOnly ||
                                                        existingInvoice
                                                      }
                                                      partnerId={
                                                        invoiceValue?.partner_id
                                                      }
                                                      partnerName={
                                                        invoiceValue?.partner_name_snapshot
                                                      }
                                                      onPartnerChange={(
                                                        partner,
                                                        sellerName,
                                                      ) => {
                                                        const basePath = [
                                                          EXPENSE_ITEMS_FIELD,
                                                          field.name,
                                                          "invoices",
                                                          invoiceField.name,
                                                        ];
                                                        form.setFieldValue(
                                                          [
                                                            ...basePath,
                                                            "partner_id",
                                                          ],
                                                          partner?.id,
                                                        );
                                                        form.setFieldValue(
                                                          [
                                                            ...basePath,
                                                            "partner_source",
                                                          ],
                                                          partner
                                                            ? "business_partner"
                                                            : "manual",
                                                        );
                                                        form.setFieldValue(
                                                          [
                                                            ...basePath,
                                                            "partner_name_snapshot",
                                                          ],
                                                          partner?.name ||
                                                            sellerName.trim(),
                                                        );
                                                      }}
                                                    />
                                                  </Form.Item>
                                                  <Form.Item
                                                    name={[
                                                      invoiceField.name,
                                                      "partner_id",
                                                    ]}
                                                    hidden
                                                  >
                                                    <Input />
                                                  </Form.Item>
                                                  <Form.Item
                                                    name={[
                                                      invoiceField.name,
                                                      "partner_source",
                                                    ]}
                                                    hidden
                                                  >
                                                    <Input />
                                                  </Form.Item>
                                                  <Form.Item
                                                    name={[
                                                      invoiceField.name,
                                                      "partner_name_snapshot",
                                                    ]}
                                                    hidden
                                                  >
                                                    <Input />
                                                  </Form.Item>
                                                  <Form.Item
                                                    name={[
                                                      invoiceField.name,
                                                      "file_path",
                                                    ]}
                                                    style={{ marginBottom: 0 }}
                                                  >
                                                    <Select
                                                      allowClear
                                                      showSearch
                                                      optionFilterProp="label"
                                                      disabled={
                                                        readOnly ||
                                                        existingInvoice
                                                      }
                                                      options={
                                                        invoiceAttachmentOptions
                                                      }
                                                      placeholder={
                                                        invoiceAttachmentOptions.length
                                                          ? "选择已上传附件"
                                                          : "请先在下方上传"
                                                      }
                                                      notFoundContent="暂无可选附件"
                                                    />
                                                  </Form.Item>
                                                  {!readOnly ? (
                                                    <Tooltip title="解除关联">
                                                      <Button
                                                        danger
                                                        type="text"
                                                        size="small"
                                                        className={
                                                          styles.invoiceDeleteAction
                                                        }
                                                        icon={
                                                          <DeleteOutlined />
                                                        }
                                                        onClick={() =>
                                                          removeInvoice(
                                                            invoiceField.name,
                                                          )
                                                        }
                                                        aria-label="解除关联"
                                                      />
                                                    </Tooltip>
                                                  ) : (
                                                    <span />
                                                  )}
                                                </div>
                                                {existingInvoice ? (
                                                  <div
                                                    className={
                                                      styles.invoiceLockedHint
                                                    }
                                                  >
                                                    来自发票台账，仅支持查看或解除关联
                                                  </div>
                                                ) : null}
                                              </div>
                                            );
                                          },
                                        )}
                                      </div>
                                    ) : (
                                      <div className={styles.invoiceEmpty}>
                                        暂未关联发票
                                      </div>
                                    )}

                                    {!readOnly ? (
                                      <Button
                                        type="dashed"
                                        icon={<PlusOutlined />}
                                        onClick={() => addInvoice({})}
                                        block
                                      >
                                        新增发票
                                      </Button>
                                    ) : null}
                                  </div>
                                )}
                              </Form.List>
                            </Drawer>
                          </section>
                        ))}
                      </div>
                    </div>
                  </div>
                  {!readOnly ? (
                    <Button
                      className={styles.addExpenseButton}
                      icon={<PlusOutlined />}
                      onClick={() => add({ ...EMPTY_EXPENSE_ITEM })}
                      block
                    >
                      新增明细
                    </Button>
                  ) : null}
                </Space>
              )}
            </Form.List>
          </Form.Item>

          <Form.Item
            label="报销附件"
            name={ATTACHMENTS_FIELD}
            extra="统一批量上传一次；在报销明细的“管理发票”中选择对应附件，无需重复上传。"
          >
            <AttachmentUpload
              disabled={readOnly}
              maxCount={20}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
            />
          </Form.Item>

          <Form.Item label="备注说明" name="remark">
            <Input.TextArea
              autoSize={{ minRows: 3, maxRows: 8 }}
              placeholder="填写报销背景、特殊情况或其他补充说明"
              maxLength={1000}
              showCount
            />
          </Form.Item>

          <Form.Item label="申请人" name="applicant_name_snapshot">
            <Input disabled />
          </Form.Item>
          <Form.Item name="applicant_user_id" hidden>
            <Input />
          </Form.Item>
        </FormLayout>
      </Form>

      {readOnly ? null : (
        <FormFooter
          onCancel={() => navigate(CPO_FORM_CANCEL_PATH)}
          onSaveAndSubmit={() => onSave(true)}
          saving={saving}
        />
      )}
    </Card>
  );
};

export default ExpenseForm;
