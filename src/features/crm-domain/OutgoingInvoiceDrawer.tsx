import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  message,
} from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import AttachmentUpload from "@/components/attachment-upload";
import { lovrabetClient } from "@/api/client";
import {
  firstAttachmentFilePath,
  syncAttachmentRecords,
  type AttachmentFileValue,
} from "@/features/attachments/api";
import { getDefaultInternalLegalEntity } from "@/features/internal-legal-entities/api";
import type {
  CustomerCompany,
  ReceivableContract,
  ReceivablePlan,
} from "./types";
import styles from "./outgoing-invoice-drawer.module.css";

const TAX_RATE_OPTIONS = [
  { value: 0, label: "0%" },
  { value: 0.01, label: "1%" },
  { value: 0.03, label: "3%" },
  { value: 0.06, label: "6%" },
  { value: 0.09, label: "9%" },
  { value: 0.13, label: "13%" },
];

type OutgoingInvoiceFormValues = {
  invoiceTitle: string;
  invoiceNo: string;
  invoiceDate: dayjs.Dayjs;
  sellerName: string;
  amount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  invoiceType: string;
  invoiceContent: string;
  remark?: string;
  attachments: AttachmentFileValue[];
  allocations: Array<{
    receivablePlanId: number;
    amount: number;
  }>;
  invoiceApplicationId?: number;
  fulfillmentAmount?: number;
};

type InvoiceApplicationOption = {
  id: number;
  title: string;
  remainingAmount: number;
  currency: string;
};

type OutgoingInvoiceDrawerProps = {
  open: boolean;
  contract: ReceivableContract;
  company: CustomerCompany | null;
  plans: ReceivablePlan[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

function roundMoney(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

export default function OutgoingInvoiceDrawer({
  open,
  contract,
  company,
  plans,
  onClose,
  onSaved,
}: OutgoingInvoiceDrawerProps) {
  const [form] = Form.useForm<OutgoingInvoiceFormValues>();
  const [saving, setSaving] = useState(false);
  const [applicationLoading, setApplicationLoading] = useState(false);
  const [invoiceApplications, setInvoiceApplications] = useState<
    InvoiceApplicationOption[]
  >([]);
  const amount = Form.useWatch("amount", form);
  const taxRate = Form.useWatch("taxRate", form);
  const totalAmount = Form.useWatch("totalAmount", form);
  const invoiceApplicationId = Form.useWatch("invoiceApplicationId", form);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      invoiceTitle: `${contract.title}销项发票`,
      invoiceDate: dayjs(),
      currency: contract.currency || "CNY",
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 0,
      invoiceType: "vat_normal",
      attachments: [],
      allocations: [],
    });
    void getDefaultInternalLegalEntity()
      .then((entity) => {
        if (open && !form.getFieldValue("sellerName")) {
          form.setFieldValue(
            "sellerName",
            entity.invoiceTitle || entity.entityName,
          );
        }
      })
      .catch(() => undefined);
  }, [contract.currency, contract.title, form, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setApplicationLoading(true);
    lovrabetClient.models.invoiceApplication
      .filter({
        where: {
          crm_contract_id: { $eq: Number(contract.id) },
          status: { $eq: "reviewed" },
        },
        currentPage: 1,
        pageSize: 200,
        orderBy: [{ updated_at: "desc" }],
      })
      .then(async (response: any) => {
        const applications = Array.isArray(response?.tableData)
          ? response.tableData
          : [];
        const applicationIds = applications
          .map((item: any) => Number(item.id))
          .filter(Boolean);
        const fulfillmentResponse = applicationIds.length
          ? await lovrabetClient.models.invoiceApplicationFulfillment.filter({
              where: {
                invoice_application_id: { $in: applicationIds },
                relation_status: { $eq: "active" },
              },
              currentPage: 1,
              pageSize: 1000,
            })
          : { tableData: [] };
        const fulfilledByApplication = new Map<number, number>();
        for (const relation of fulfillmentResponse?.tableData || []) {
          const applicationId = Number(relation.invoice_application_id);
          fulfilledByApplication.set(
            applicationId,
            roundMoney(
              (fulfilledByApplication.get(applicationId) || 0) +
                Number(relation.fulfilled_amount || 0),
            ),
          );
        }
        const options = applications
          .map((item: any) => ({
            id: Number(item.id),
            title:
              String(
                item.application_title ||
                  item.application_no ||
                  item.customer_name_snapshot ||
                  "",
              ).trim(),
            remainingAmount: Math.max(
              roundMoney(item.requested_total_amount) -
                (fulfilledByApplication.get(Number(item.id)) || 0),
              0,
            ),
            currency: String(item.currency || contract.currency || "CNY"),
          }))
          .filter(
            (item: InvoiceApplicationOption) =>
              item.id > 0 && item.title && item.remainingAmount > 0,
          );
        if (!cancelled) setInvoiceApplications(options);
      })
      .catch(() => {
        if (!cancelled) setInvoiceApplications([]);
      })
      .finally(() => {
        if (!cancelled) setApplicationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contract.currency, contract.id, open]);

  useEffect(() => {
    const normalizedAmount = roundMoney(amount);
    const normalizedRate = Number.isFinite(Number(taxRate))
      ? Number(taxRate)
      : 0;
    const taxAmount = roundMoney(normalizedAmount * normalizedRate);
    form.setFieldsValue({
      taxAmount,
      totalAmount: roundMoney(normalizedAmount + taxAmount),
    });
  }, [amount, form, taxRate]);

  useEffect(() => {
    if (!invoiceApplicationId) {
      form.setFieldValue("fulfillmentAmount", undefined);
      return;
    }
    const application = invoiceApplications.find(
      (item) => item.id === Number(invoiceApplicationId),
    );
    if (!application) return;
    form.setFieldValue(
      "fulfillmentAmount",
      Math.min(
        roundMoney(totalAmount),
        roundMoney(application.remainingAmount),
      ),
    );
  }, [form, invoiceApplicationId, invoiceApplications, totalAmount]);

  const submit = async () => {
    const values = await form.validateFields();
    if (!company?.id) {
      message.error("当前合同缺少有效客户，无法新增销项发票");
      return;
    }
    setSaving(true);
    let registeredInvoiceId = 0;
    try {
      const saved = await lovrabetClient.bff.execute<{ bizId: number }>({
        scriptName: "cpoSaveDraft",
        params: {
          bizType: "invoice",
          values: {
            invoice_title: values.invoiceTitle.trim(),
            request_type: "customer_invoice",
            invoice_direction: "outgoing",
            invoice_purpose: "customer_billing",
            partner_id: Number(company.id),
            partner_source: "crm_customer",
            partner_name_snapshot: company.name,
            contract_id: null,
            seller_name: values.sellerName.trim(),
            buyer_name: company.name,
            buyer_tax_no: company.uscc || "",
            buyer_address_phone: "",
            buyer_bank_account: "",
            amount: values.amount,
            tax_rate: values.taxRate,
            tax_amount: values.taxAmount,
            total_amount: values.totalAmount,
            currency: values.currency || contract.currency || "CNY",
            invoice_region: "mainland_china",
            invoice_type: values.invoiceType,
            invoice_medium: "electronic",
            invoice_content: values.invoiceContent.trim(),
            invoice_no: values.invoiceNo.trim(),
            invoice_date: values.invoiceDate.format("YYYY-MM-DD"),
            category: "",
            file_path: firstAttachmentFilePath(values.attachments) || "",
            receiver_name: "",
            receiver_phone: "",
            receiver_email: "",
            is_mainland_compliant: 1,
            remark: values.remark?.trim() || "",
          },
          relations: [
            {
              relationType: "bills_crm_contract",
              targetBizType: "crm_contract",
              targetBizId: contract.id,
            },
          ],
        },
      });
      await syncAttachmentRecords({
        bizType: "invoice",
        bizId: saved.bizId,
        attachmentType: "invoice",
        files: values.attachments,
      });
      await lovrabetClient.bff.execute({
        scriptName: "cpoRegisterIssuedInvoice",
        params: { invoiceId: saved.bizId },
      });
      registeredInvoiceId = saved.bizId;
      if (values.invoiceApplicationId) {
        await lovrabetClient.bff.execute({
          scriptName: "cpoFulfillInvoiceApplication",
          params: {
            op: "fulfill",
            invoiceApplicationId: values.invoiceApplicationId,
            invoiceId: saved.bizId,
            amount: values.fulfillmentAmount,
          },
        });
      }
      for (const allocation of values.allocations || []) {
        await lovrabetClient.bff.execute({
          scriptName: "cpoManageReceivableSettlement",
          params: {
            op: "allocateInvoice",
            crmContractId: contract.id,
            receivablePlanId: allocation.receivablePlanId,
            invoiceId: saved.bizId,
            amount: allocation.amount,
          },
        });
      }
      message.success("销项发票已新增并关联当前合同");
      onClose();
      await onSaved();
    } catch (requestError) {
      if (registeredInvoiceId) {
        onClose();
        await onSaved();
      }
      message.error(
        registeredInvoiceId
          ? `发票已登记，但后续履约或分摊未全部完成：${
              requestError instanceof Error
                ? requestError.message
                : "请在发票中心继续处理"
            }`
          : requestError instanceof Error
            ? requestError.message
            : "新增销项发票失败",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      width={680}
      title="快速新增销项发票"
      onClose={saving ? undefined : onClose}
      footer={
        <Space>
          <Button type="primary" loading={saving} onClick={() => void submit()}>
            保存并关联
          </Button>
          <Button disabled={saving} onClick={onClose}>
            取消
          </Button>
        </Space>
      }
    >
      <div className={styles.context}>
        <strong>{contract.title}</strong>
        <span>{company?.name || contract.companyName}</span>
      </div>
      <Alert
        type="info"
        showIcon
        message="发票将自动关联当前销售合同"
        description="这里登记真实已开具发票；可履约已审批开票申请，并按金额分摊到一个或多个收款期次。开票与实际回款分别核销。"
      />
      <Form form={form} layout="vertical" className={styles.form}>
        <Form.Item
          name="invoiceTitle"
          label="发票标题"
          rules={[{ required: true, message: "请输入发票标题" }]}
        >
          <Input maxLength={255} />
        </Form.Item>

        <div className={styles.twoColumns}>
          <Form.Item name="invoiceApplicationId" label="履约开票申请（可选）">
            <Select
              allowClear
              showSearch
              loading={applicationLoading}
              optionFilterProp="label"
              placeholder="选择当前合同下已审批、未完成的开票申请"
              options={invoiceApplications.map((item) => ({
                value: item.id,
                label: `${item.title} · 待开 ${item.currency} ${item.remainingAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`,
              }))}
              notFoundContent={
                applicationLoading ? "加载中..." : "没有待履约开票申请"
              }
            />
          </Form.Item>
          {invoiceApplicationId ? (
            <Form.Item
              name="fulfillmentAmount"
              label="本张发票履约金额"
              rules={[
                { required: true, message: "请输入履约金额" },
                {
                  validator: async (_, value) => {
                    const selected = invoiceApplications.find(
                      (item) => item.id === Number(invoiceApplicationId),
                    );
                    const normalized = Number(value || 0);
                    if (normalized <= 0) throw new Error("履约金额必须大于 0");
                    if (normalized > Number(totalAmount || 0) + 0.005) {
                      throw new Error("履约金额不能超过本张发票价税合计");
                    }
                    if (
                      selected &&
                      normalized > selected.remainingAmount + 0.005
                    ) {
                      throw new Error("履约金额不能超过开票申请待开金额");
                    }
                  },
                },
              ]}
            >
              <InputNumber min={0.01} precision={2} />
            </Form.Item>
          ) : (
            <div />
          )}
        </div>

        <div className={styles.twoColumns}>
          <Form.Item
            name="invoiceNo"
            label="发票号码"
            rules={[{ required: true, message: "请输入发票号码" }]}
          >
            <Input placeholder="填写发票上的真实号码" />
          </Form.Item>
          <Form.Item
            name="invoiceDate"
            label="开票日期"
            rules={[{ required: true, message: "请选择开票日期" }]}
          >
            <DatePicker />
          </Form.Item>
        </div>

        <div className={styles.twoColumns}>
          <Form.Item
            name="sellerName"
            label="销售方"
            rules={[{ required: true, message: "请输入销售方" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="购买方">
            <Input value={company?.name || contract.companyName} disabled />
          </Form.Item>
        </div>

        <div className={styles.fourColumns}>
          <Form.Item name="currency" label="币种" rules={[{ required: true }]}>
            <Select
              options={["CNY", "USD", "HKD"].map((value) => ({
                value,
                label: value,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label="不含税金额"
            rules={[
              { required: true, message: "请输入不含税金额" },
              { type: "number", min: 0.01, message: "金额必须大于 0" },
            ]}
          >
            <InputNumber min={0.01} precision={2} />
          </Form.Item>
          <Form.Item name="taxRate" label="税率">
            <Select options={TAX_RATE_OPTIONS} />
          </Form.Item>
          <Form.Item name="totalAmount" label="价税合计">
            <InputNumber precision={2} disabled />
          </Form.Item>
        </div>

        <div className={styles.twoColumns}>
          <Form.Item
            name="invoiceType"
            label="发票类型"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: "vat_special", label: "增值税专用发票" },
                { value: "vat_normal", label: "增值税普通发票" },
                { value: "other", label: "其他" },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="invoiceContent"
            label="开票内容"
            rules={[{ required: true, message: "请输入开票内容" }]}
          >
            <Input placeholder="例如：技术服务费" maxLength={300} />
          </Form.Item>
        </div>

        <Form.Item
          name="attachments"
          label="发票文件"
          rules={[
            {
              validator: (_, files?: AttachmentFileValue[]) =>
                files?.length
                  ? Promise.resolve()
                  : Promise.reject(new Error("请上传发票文件")),
            },
          ]}
        >
          <AttachmentUpload
            maxCount={1}
            accept=".pdf,.ofd,.png,.jpg,.jpeg"
            uploadLabel="上传发票文件"
          />
        </Form.Item>

        <Form.List
          name="allocations"
          rules={[
            {
              validator: async (_, allocations = []) => {
                const total = allocations.reduce(
                  (sum: number, item: { amount?: number }) =>
                    sum + Number(item?.amount || 0),
                  0,
                );
                if (total > Number(form.getFieldValue("totalAmount") || 0)) {
                  throw new Error("分摊金额不能超过发票价税合计");
                }
                const planIds = allocations
                  .map((item: { receivablePlanId?: number }) =>
                    Number(item?.receivablePlanId),
                  )
                  .filter(Boolean);
                if (new Set(planIds).size !== planIds.length) {
                  throw new Error("同一收款期次不能重复分摊");
                }
              },
            },
          ]}
        >
          {(fields, { add, remove }, { errors }) => (
            <Space direction="vertical" style={{ width: "100%" }}>
              {fields.map(({ key, name, ...restField }) => (
                <div className={styles.twoColumns} key={key}>
                  <Form.Item
                    {...restField}
                    name={[name, "receivablePlanId"]}
                    label="分摊收款期次"
                    rules={[{ required: true, message: "请选择收款期次" }]}
                  >
                    <Select
                      options={plans
                        .filter(
                          (plan) =>
                            !["received", "not_required", "cancelled"].includes(
                              String(plan.status).toLowerCase(),
                            ),
                        )
                        .map((plan) => ({
                          value: plan.id,
                          label: `${plan.phase_name || `第${plan.phase_no}期收款`} · ${plan.currency || contract.currency || "CNY"} ${Number(plan.planned_amount || 0).toLocaleString()}`,
                        }))}
                    />
                  </Form.Item>
                  <Space align="end">
                    <Form.Item
                      {...restField}
                      name={[name, "amount"]}
                      label="本期分摊金额"
                      rules={[
                        { required: true, message: "请输入分摊金额" },
                        {
                          type: "number",
                          min: 0.01,
                          message: "金额必须大于 0",
                        },
                      ]}
                    >
                      <InputNumber min={0.01} precision={2} />
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      aria-label="移除发票分摊"
                      icon={<DeleteOutlined />}
                      onClick={() => remove(name)}
                    />
                  </Space>
                </div>
              ))}
              <Form.ErrorList errors={errors} />
              <Button
                block
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => add()}
              >
                分摊到收款期次（可选）
              </Button>
            </Space>
          )}
        </Form.List>

        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}

OutgoingInvoiceDrawer.displayName = "销项发票快速新增抽屉";
