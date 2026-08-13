/**
 * title: 新建对外销售合同
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Select,
  Skeleton,
  Space,
  message,
} from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { lovrabetClient } from "@/api/client";
import { listCrmCustomers, type CrmCustomer } from "@/api/crm";
import { CURRENT_APP_MODEL_KEYS } from "@/api/model-keys";
import AttachmentUpload from "@/components/attachment-upload";
import FormFooter from "@/components/form-footer";
import FormLayout, { FormRow } from "@/components/form-layout";
import MoneyInput from "@/components/money-input";
import {
  type AttachmentFileValue,
  listAttachmentValues,
  syncAttachmentRecords,
} from "@/features/attachments/api";
import { manageReceivableContract } from "@/features/crm-domain/api";

type Opportunity = {
  id: number;
  company_id: number;
  name: string;
  stage?: string;
};

type FormValues = {
  company_id: number;
  opportunity_id?: number;
  contract_no: string;
  title: string;
  amount: number;
  currency: string;
  start_date?: dayjs.Dayjs | null;
  end_date?: dayjs.Dayjs | null;
  remark?: string;
  attachments?: AttachmentFileValue[];
};

const EDITABLE_STATUSES = new Set(["draft", "rejected"]);

export default function SalesContractFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = Number(searchParams.get("id")) || 0;
  const [form] = Form.useForm<FormValues>();
  const companyId = Form.useWatch("company_id", form);
  const [loading, setLoading] = useState(Boolean(editId));
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [customerKeyword, setCustomerKeyword] = useState("");
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [recordStatus, setRecordStatus] = useState("draft");
  const readOnly = Boolean(editId) && !EDITABLE_STATUSES.has(recordStatus);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        listCrmCustomers({ keyword: customerKeyword, pageSize: 200 })
          .then((rows) => !cancelled && setCustomers(rows))
          .catch(
            (error) =>
              !cancelled &&
              message.error(
                error instanceof Error ? error.message : "加载客户失败",
              ),
          );
      },
      customerKeyword ? 240 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [customerKeyword]);

  useEffect(() => {
    if (!companyId) {
      setOpportunities([]);
      return;
    }
    lovrabetClient.models[CURRENT_APP_MODEL_KEYS.salesOpportunity]
      .filter({
        where: { company_id: { $eq: Number(companyId) } },
        select: ["id", "company_id", "name", "stage"],
        currentPage: 1,
        pageSize: 200,
        orderBy: [{ updated_at: "desc" }],
      })
      .then((response) =>
        setOpportunities((response.tableData || []) as Opportunity[]),
      )
      .catch(() => setOpportunities([]));
  }, [companyId]);

  useEffect(() => {
    if (!editId) return;
    Promise.all([
      lovrabetClient.models[CURRENT_APP_MODEL_KEYS.receivableContract].getOne({
        id: editId,
      }),
      listAttachmentValues({
        bizType: "crm_contract",
        bizId: editId,
        attachmentType: "contract_file",
      }),
    ])
      .then(([record, attachments]) => {
        if (!record?.id) {
          throw new Error("未找到该销售合同");
        }
        const status = String(record.sign_status || "").toLowerCase();
        setRecordStatus(status);
        form.setFieldsValue({
          company_id: Number(record.company_id),
          opportunity_id: record.opportunity_id
            ? Number(record.opportunity_id)
            : undefined,
          contract_no: record.contract_no,
          title: record.title,
          amount: Number(record.amount),
          currency: record.currency || "CNY",
          start_date: record.start_date ? dayjs(record.start_date) : null,
          end_date: record.end_date ? dayjs(record.end_date) : null,
          remark: record.remark || "",
          attachments,
        });
      })
      .catch((error) =>
        message.error(error instanceof Error ? error.message : "加载合同失败"),
      )
      .finally(() => setLoading(false));
  }, [editId, form]);

  const customerOptions = useMemo(
    () =>
      customers.map((customer) => ({
        value: Number(customer.id),
        label: customer.uscc
          ? `${customer.name}（${customer.uscc}）`
          : customer.name,
      })),
    [customers],
  );

  const persist = async (values: FormValues) => {
    const contract = {
      companyId: values.company_id,
      opportunityId: values.opportunity_id || null,
      contractNo: values.contract_no.trim(),
      title: values.title.trim(),
      amount: values.amount,
      currency: values.currency || "CNY",
      startDate: values.start_date?.format("YYYY-MM-DD") || null,
      endDate: values.end_date?.format("YYYY-MM-DD") || null,
      remark: values.remark?.trim() || null,
    };
    const result = await manageReceivableContract(
      editId
        ? { action: "update_contract", contractId: editId, contract }
        : { action: "create_draft", contract },
    );
    return Number(result.contractId);
  };

  const save = async (submit: boolean) => {
    if (readOnly) return;
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    if (submit && !(values.attachments || []).length) {
      message.warning("提交审批前请上传待审核的合同文件");
      return;
    }
    setSaving(true);
    try {
      const contractId = await persist(values);
      const attachments = await syncAttachmentRecords({
        bizType: "crm_contract",
        bizId: contractId,
        attachmentType: "contract_file",
        files: values.attachments,
      });
      form.setFieldValue("attachments", attachments);
      if (submit) {
        await lovrabetClient.bff.execute({
          scriptName: "cpoSubmitApplication",
          params: {
            bizType: "crm_contract",
            bizId: contractId,
            comment: values.title,
          },
        });
        message.success("销售合同已提交审批");
        navigate(`/receivable-contract-detail/${contractId}`);
        return;
      }
      message.success(editId ? "草稿已更新" : "草稿已保存");
      if (!editId) {
        navigate(`/sales-contract-form?id=${contractId}`, { replace: true });
      }
    } catch (error) {
      message.error(
        `${submit ? "提交" : "保存"}失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card style={{ maxWidth: 1040, margin: "0 auto" }}>
        <Skeleton active paragraph={{ rows: 12 }} />
      </Card>
    );
  }

  return (
    <Card
      style={{ maxWidth: 1040, margin: "0 auto" }}
      title={
        <Space>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(-1)}
          />
          {readOnly
            ? "查看对外销售合同"
            : editId
              ? "编辑对外销售合同"
              : "新建对外销售合同"}
        </Space>
      }
    >
      {readOnly ? (
        <Alert
          type="info"
          showIcon
          message="合同已进入流程，当前页面只读"
          action={
            <Button
              onClick={() => navigate(`/receivable-contract-detail/${editId}`)}
            >
              查看流程
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      ) : null}
      <Form
        form={form}
        layout="vertical"
        disabled={saving || readOnly}
        initialValues={{ currency: "CNY" }}
      >
        <FormLayout>
          <Form.Item
            label="合同名称"
            name="title"
            rules={[{ required: true, message: "请输入合同名称" }]}
          >
            <Input
              maxLength={200}
              showCount
              placeholder="例如：2026 年度技术服务合同"
            />
          </Form.Item>
          <FormRow columns={2}>
            <Form.Item
              label="合同编号"
              name="contract_no"
              rules={[{ required: true, message: "请输入合同编号" }]}
            >
              <Input maxLength={100} placeholder="请输入双方确认的合同编号" />
            </Form.Item>
            <Form.Item
              label="客户"
              name="company_id"
              rules={[{ required: true, message: "请选择客户" }]}
            >
              <Select
                showSearch
                filterOption={false}
                searchValue={customerKeyword}
                onSearch={setCustomerKeyword}
                options={customerOptions}
                placeholder="按名称或统一信用代码搜索客户"
                onChange={() => form.setFieldValue("opportunity_id", undefined)}
              />
            </Form.Item>
          </FormRow>
          <FormRow columns={2}>
            <Form.Item label="来源商机" name="opportunity_id">
              <Select
                allowClear
                disabled={!companyId || saving || readOnly}
                options={opportunities.map((opportunity) => ({
                  value: Number(opportunity.id),
                  label: opportunity.name,
                }))}
                placeholder={companyId ? "可选：关联销售机会" : "请先选择客户"}
              />
            </Form.Item>
            <Form.Item
              label="合同金额"
              name="amount"
              rules={[
                { required: true, message: "请输入合同金额" },
                { type: "number", min: 0.01, message: "合同金额必须大于 0" },
              ]}
            >
              <MoneyInput min={0.01} />
            </Form.Item>
          </FormRow>
          <FormRow columns={3}>
            <Form.Item label="币种" name="currency">
              <Select
                options={["CNY", "USD", "HKD"].map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </Form.Item>
            <Form.Item label="开始日期" name="start_date">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="结束日期" name="end_date">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </FormRow>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={3} maxLength={1000} showCount />
          </Form.Item>
          <Form.Item
            label="待审核合同文件"
            name="attachments"
            extra="草稿可暂不上传；提交审批时至少需要一份合同文件。"
          >
            <AttachmentUpload
              maxCount={10}
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            message="收款计划在合同详情中维护"
            description="审批前可先保存草稿并配置多期收款计划；合同签署完成后，草稿期次会自动转为待收款。"
          />
        </FormLayout>
      </Form>
      {!readOnly ? (
        <FormFooter
          saving={saving}
          onCancel={() => navigate("/contracts")}
          onSaveDraft={() => void save(false)}
          onSaveAndSubmit={() => void save(true)}
          hint="提交后进入销售合同审核，审批通过后由签署节点确认合同签署完成。"
        />
      ) : null}
    </Card>
  );
}

SalesContractFormPage.displayName = "对外销售合同表单";
