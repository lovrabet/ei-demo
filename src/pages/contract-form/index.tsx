/**
 * title: 新建合同
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Button,
  Space,
  Divider,
  Alert,
  Collapse,
  Tag,
  Typography,
  message,
  Skeleton,
} from "antd";
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { lovrabetClient } from "@/api/client";
import AttachmentUpload from "@/components/attachment-upload";
import FormFooter from "@/components/form-footer";
import FormLayout, { FormRow } from "@/components/form-layout";
import MoneyInput from "@/components/money-input";
import PartySelector from "@/components/party-selector";
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
import {
  employeeToSelectOption,
  findEmployeeByValue,
  listEmployeeOptions,
  type EmployeeOption,
} from "@/features/employees/api";

const CONTRACT_CODE = "53869993f80f45ae8ef6cdf051d8e355";
const ATTACHMENTS_FIELD = "_attachments";
type ContractDirection = "receivable" | "payable";

export function normalizeContractDirection(
  direction?: string,
  contractType?: string,
): ContractDirection {
  if (
    ["receivable", "outbound", "outgoing", "income"].includes(direction || "")
  ) {
    return "receivable";
  }
  if (["payable", "inbound", "incoming", "expense"].includes(direction || "")) {
    return "payable";
  }
  return contractType === "sales" ? "receivable" : "payable";
}
const PAYMENT_PLAN_STATUS_META: Record<
  NonNullable<ContractPaymentPlanFormValue["status"]>,
  { color: string; label: string }
> = {
  pending: { color: "blue", label: "待支付" },
  processing: { color: "processing", label: "支付处理中" },
  paid: { color: "success", label: "已支付" },
  not_required: { color: "default", label: "无需支付" },
  cancelled: { color: "error", label: "已取消" },
};

type ContractPaymentPlanFormValue = {
  id?: number;
  phase_no?: number;
  phase_name?: string;
  planned_amount?: number;
  currency?: string;
  planned_pay_date?: dayjs.Dayjs | null;
  trigger_condition?: string;
  status?: "pending" | "processing" | "paid" | "not_required" | "cancelled";
  linked_payment_application_id?: number | null;
  payment_count?: number;
  remark?: string;
};

type FormValues = {
  contract_name: string;
  direction: ContractDirection;
  contract_type:
    | "sales"
    | "procurement"
    | "service"
    | "rent"
    | "hr"
    | "certification"
    | "other";
  payment_requirement: "required" | "not_required" | "unknown";
  our_role: "party_a" | "party_b";
  currency: string;
  partner_id: number;
  amount: number;
  start_date?: any;
  end_date?: any;
  liaison_user_id?: string;
  liaison_name_snapshot?: string;
  applicant_name_snapshot?: string;
  applicant_user_id?: string;
  remark?: string;
  contract_assessment?: string;
  payment_plans?: ContractPaymentPlanFormValue[];
  _attachments?: AttachmentFileValue[];
};

const ContractForm: React.FC = () => {
  const [params] = useSearchParams();
  const editId = params.get("id");
  const mode = params.get("mode");
  const navigate = useNavigate();
  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordStatus, setRecordStatus] = useState<string>();
  const [employeeKeyword, setEmployeeKeyword] = useState("");
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeLoading, setEmployeeLoading] = useState(false);

  const isEdit = !!editId;
  const readOnly = isWorkflowReadonly(recordStatus, mode);
  const watchedPaymentPlans = Form.useWatch("payment_plans", form) || [];
  const watchedPaymentRequirement =
    Form.useWatch("payment_requirement", form) || "unknown";
  const employeeSelectOptions = useMemo(() => {
    const selectedValue = form.getFieldValue("liaison_user_id");
    const selectedName = form.getFieldValue("liaison_name_snapshot");
    const options = employees.map(employeeToSelectOption);

    if (
      selectedValue &&
      selectedName &&
      !options.some((option) => option.value === selectedValue)
    ) {
      options.unshift({
        value: selectedValue,
        label: selectedName,
        secondary: "已保存的历史接口人",
        employee: {
          userId: selectedValue,
          username: selectedName,
          snapshotName: selectedName,
        },
      });
    }

    return options;
  }, [employees, form]);

  useEffect(() => {
    if (!editId) return;
    setLoading(true);
    lovrabetClient.models[`dataset_${CONTRACT_CODE}`]
      .getOne({ id: Number(editId) })
      .then(async (rec: any) => {
        if (rec?.id) {
          const [attachments, paymentContext] = await Promise.all([
            listAttachmentValues({
              bizType: "contract",
              bizId: Number(rec.id),
              attachmentType: "contract_file",
            }),
            lovrabetClient.bff.execute<{
              plans?: ContractPaymentPlanFormValue[];
            }>({
              scriptName: "cpoGetContractPaymentContext",
              params: { contractId: Number(rec.id) },
            }),
          ]);
          form.setFieldsValue({
            ...rec,
            direction: normalizeContractDirection(
              rec.direction,
              rec.contract_type,
            ),
            contract_type:
              rec.contract_type === "sales" ? "service" : rec.contract_type,
            start_date: rec.start_date ? dayjs(rec.start_date) : null,
            end_date: rec.end_date ? dayjs(rec.end_date) : null,
            payment_plans: (paymentContext.plans || []).map((plan) => ({
              ...plan,
              id: Number(plan.id),
              phase_no: Number(plan.phase_no),
              planned_amount: Number(plan.planned_amount),
              planned_pay_date: plan.planned_pay_date
                ? dayjs(plan.planned_pay_date)
                : null,
            })),
            [ATTACHMENTS_FIELD]: attachments,
          });
          setRecordStatus(rec.status);
        } else {
          message.error("未找到该合同");
        }
      })
      .catch((e: any) => message.error(`加载失败：${e?.message || e}`))
      .finally(() => setLoading(false));
  }, [editId, form]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        setEmployeeLoading(true);
        listEmployeeOptions(employeeKeyword)
          .then((options) => {
            if (!cancelled) {
              setEmployees(options);
            }
          })
          .catch((error) => {
            console.error(error);
            if (!cancelled) {
              setEmployees([]);
            }
          })
          .finally(() => {
            if (!cancelled) {
              setEmployeeLoading(false);
            }
          });
      },
      employeeKeyword ? 240 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [employeeKeyword]);

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

  // PartySelector 内部会在 salesMode 切换时清空 partner_id

  const applyLiaisonEmployee = (userId?: string) => {
    const employee =
      findEmployeeByValue(employees, userId) ||
      employeeSelectOptions.find((option) => option.value === userId)?.employee;
    form.setFieldsValue({
      liaison_user_id: userId,
      liaison_name_snapshot: employee?.snapshotName,
    });
  };

  const persist = async (values: FormValues): Promise<number> => {
    const payload: any = {
      contract_name: values.contract_name ?? "",
      direction: values.direction,
      contract_type: values.contract_type ?? null,
      payment_requirement: values.payment_requirement || "unknown",
      our_role: values.our_role ?? "party_a",
      partner_id: values.partner_id ?? null,
      amount: values.amount ?? 0,
      currency: values.currency || "CNY",
      remark: values.remark ?? "",
      contract_assessment: values.contract_assessment ?? "",
    };
    [
      "start_date",
      "end_date",
      "liaison_user_id",
      "liaison_name_snapshot",
    ].forEach((k) => {
      const v = (values as any)[k];
      payload[k] =
        v !== undefined && v !== null && v !== ""
          ? k.endsWith("_date")
            ? dayjs(v).format("YYYY-MM-DD")
            : v
          : null;
    });
    const saved = await lovrabetClient.bff.execute<{ bizId: number }>({
      scriptName: "cpoSaveDraft",
      params: {
        bizType: "contract",
        bizId: isEdit ? Number(editId) : undefined,
        values: payload,
      },
    });
    await lovrabetClient.bff.execute({
      scriptName: "cpoSyncContractPaymentPlans",
      params: {
        contractId: saved.bizId,
        plans: (values.payment_plans || []).map((plan) => ({
          id: plan.id ? Number(plan.id) : undefined,
          phase_no: Number(plan.phase_no),
          phase_name: plan.phase_name?.trim() || null,
          planned_amount: Number(plan.planned_amount),
          currency: plan.currency || values.currency || "CNY",
          planned_pay_date: plan.planned_pay_date
            ? dayjs(plan.planned_pay_date).format("YYYY-MM-DD")
            : null,
          trigger_condition: plan.trigger_condition?.trim() || null,
          status: plan.status || "pending",
          remark: plan.remark?.trim() || null,
        })),
      },
    });
    return saved.bizId;
  };

  const onSave = async (thenSubmit: boolean) => {
    if (readOnly) {
      message.warning("当前单据不可编辑");
      return;
    }
    let values: FormValues;
    try {
      values = await collectCpoFormValues(
        form,
        thenSubmit ? "submit" : "draft",
      );
    } catch {
      return;
    }
    setSaving(true);
    try {
      const id = await persist(values);
      const attachments = await syncAttachmentRecords({
        bizType: "contract",
        bizId: id,
        attachmentType: "contract_file",
        files: values[ATTACHMENTS_FIELD],
        uploadedBy: values.applicant_name_snapshot,
      });
      form.setFieldValue(ATTACHMENTS_FIELD, attachments);
      if (thenSubmit) {
        await lovrabetClient.bff.execute({
          scriptName: "cpoSubmitApplication",
          params: {
            bizType: "contract",
            bizId: id,
            comment: values.contract_name,
          },
        });
        message.success("已提交审核");
        navigate("/4cf8289fc0df45a4a13818fce6bfcc59");
      } else {
        message.success(isEdit ? "已更新" : "草稿已保存");
      }
    } catch (e: any) {
      message.error(`${thenSubmit ? "提交" : "保存"}失败：${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
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
          {readOnly ? "查看合同" : isEdit ? "编辑合同" : "新建合同"}
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        disabled={saving || readOnly}
        initialValues={{
          direction: "payable",
          payment_requirement: "unknown",
          payment_plans: [],
        }}
        requiredMark
      >
        <FormLayout>
          <Form.Item
            label="合同名称"
            name="contract_name"
            rules={[{ required: true, message: "请输入合同名称" }]}
          >
            <Input
              placeholder="例如：阿里云 2026 年度服务采购合同"
              maxLength={120}
              showCount
            />
          </Form.Item>

          <Form.Item
            label="资金方向"
            name="direction"
            rules={[{ required: true, message: "请选择资金方向" }]}
          >
            <Select
              placeholder="请选择合同的资金方向"
              options={[
                {
                  value: "payable",
                  label: "付款合同（供应商为我们提供服务）",
                },
              ]}
              onChange={() => form.setFieldValue("partner_id", undefined)}
            />
          </Form.Item>

          <PartySelector
            form={form}
            bizType="contract"
            typeName="contract_type"
            typeLabel="合同业务类型"
            partnerName="partner_id"
            partnerLabel="对方主体"
            customerMode={false}
          >
            <Select
              placeholder="请选择合同业务类型"
              options={[
                { value: "service", label: "服务" },
                { value: "procurement", label: "商品 / 物资采购" },
                { value: "rent", label: "租赁" },
                { value: "hr", label: "人力" },
                { value: "certification", label: "认证" },
                { value: "other", label: "其他" },
              ]}
            />
          </PartySelector>

          <Divider style={{ margin: "8px 0 4px" }} />

          <FormRow template="minmax(0, 1fr) 110px">
            <Form.Item
              label="我方角色"
              name="our_role"
              rules={[{ required: true }]}
              initialValue="party_a"
            >
              <Select
                options={[
                  { value: "party_a", label: "甲方" },
                  { value: "party_b", label: "乙方" },
                ]}
              />
            </Form.Item>
            <Form.Item label="币种" name="currency" initialValue="CNY">
              <Select
                options={[
                  { value: "CNY", label: "CNY" },
                  { value: "USD", label: "USD" },
                  { value: "HKD", label: "HKD" },
                ]}
              />
            </Form.Item>
          </FormRow>

          <FormRow template="minmax(320px, 420px)">
            <Form.Item
              label="合同金额"
              name="amount"
              rules={[
                { required: true, message: "请输入金额" },
                { type: "number", min: 0, message: "金额不能为负" },
              ]}
            >
              <MoneyInput min={0} />
            </Form.Item>
          </FormRow>

          <Divider style={{ margin: "8px 0 4px" }} />

          <FormRow columns={2}>
            <Form.Item label="开始日期" name="start_date">
              <DatePicker placeholder="开始日期" />
            </Form.Item>
            <Form.Item label="结束日期" name="end_date">
              <DatePicker placeholder="结束日期" />
            </Form.Item>
          </FormRow>

          <Alert
            type="info"
            showIcon
            message="本页面维护付款合同"
            description="这里维护供应商为我们提供服务、需要对外付款的合同；客户收款合同请从合同工作台或客户 360 进入。"
            style={{ margin: "8px 0 12px" }}
          />

          <FormRow template="minmax(320px, 520px)">
            <Form.Item
              label="付款要求"
              name="payment_requirement"
              rules={[{ required: true, message: "请确认该合同是否需要付款" }]}
              extra="合同可明确为无需付款；需要付款时至少维护一个付款计划。"
            >
              <Select
                options={[
                  { value: "required", label: "需要付款" },
                  { value: "not_required", label: "无需付款" },
                  { value: "unknown", label: "待确认" },
                ]}
                onChange={(value) => {
                  if (value !== "not_required") return;
                  const plans =
                    (form.getFieldValue(
                      "payment_plans",
                    ) as ContractPaymentPlanFormValue[]) || [];
                  if (plans.some((plan) => Number(plan.payment_count) > 0)) {
                    message.warning("已有实际付款的合同不能改为无需付款");
                    form.setFieldValue("payment_requirement", "required");
                    return;
                  }
                  form.setFieldValue("payment_plans", []);
                }}
              />
            </Form.Item>
          </FormRow>

          {watchedPaymentRequirement === "not_required" ? (
            <Alert
              type="success"
              showIcon
              message="该合同无需付款"
              description="不会生成付款计划，也不会出现在待付款合同中。"
              style={{ margin: "8px 0 12px" }}
            />
          ) : (
            <Collapse
              bordered={false}
              defaultActiveKey={["payment-plans"]}
              expandIconPosition="end"
              style={{
                margin: "8px 0 12px",
                overflow: "hidden",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                background: "#fafafa",
              }}
              items={[
                {
                  key: "payment-plans",
                  styles: {
                    header: {
                      padding: "13px 16px",
                      background: "#f5f5f5",
                      borderBottom: "1px solid #e5e7eb",
                      borderRadius: 0,
                    },
                    body: {
                      padding: "14px 16px 16px",
                      background: "#fafafa",
                    },
                  },
                  label: (
                    <Space size={10}>
                      <Typography.Text strong>付款计划</Typography.Text>
                      <Typography.Text type="secondary">
                        已设置 {watchedPaymentPlans.length} 个
                      </Typography.Text>
                    </Space>
                  ),
                  children: (
                    <>
                      <Typography.Paragraph
                        type="secondary"
                        style={{ margin: "0 0 12px" }}
                      >
                        付款时自动带出期次最靠前且仍有余额的计划；已有实际付款的计划不可修改或删除。
                      </Typography.Paragraph>
                      <Form.List
                        name="payment_plans"
                        rules={[
                          {
                            validator: async (
                              _,
                              plans: ContractPaymentPlanFormValue[] = [],
                            ) => {
                              const phaseNumbers = plans
                                .map((plan) => Number(plan?.phase_no))
                                .filter(Boolean);
                              if (
                                new Set(phaseNumbers).size !==
                                phaseNumbers.length
                              ) {
                                throw new Error("付款期次不能重复");
                              }
                            },
                          },
                        ]}
                      >
                        {(fields, { add, remove }, { errors }) => (
                          <div>
                            {fields.map(
                              ({ key, name, ...restField }, index) => {
                                const currentPlan =
                                  watchedPaymentPlans[name] || {};
                                const status =
                                  currentPlan.status ||
                                  form.getFieldValue([
                                    "payment_plans",
                                    name,
                                    "status",
                                  ]);
                                const locked =
                                  Number(currentPlan.payment_count) > 0 ||
                                  status === "processing" ||
                                  status === "cancelled";
                                const statusMeta =
                                  PAYMENT_PLAN_STATUS_META[status || "pending"];
                                return (
                                  <div
                                    key={key}
                                    style={{
                                      padding:
                                        index === 0 ? "0 0 16px" : "16px 0",
                                      borderTop:
                                        index > 0
                                          ? "1px solid #f0f0f0"
                                          : undefined,
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: 12,
                                        marginBottom: 12,
                                      }}
                                    >
                                      <Space size={8}>
                                        <Typography.Text strong>
                                          付款计划 {index + 1}
                                        </Typography.Text>
                                        <Tag
                                          color={statusMeta.color}
                                          style={{ marginInlineEnd: 0 }}
                                        >
                                          {statusMeta.label}
                                        </Tag>
                                      </Space>
                                      {readOnly || locked ? null : (
                                        <Button
                                          type="text"
                                          danger
                                          size="small"
                                          icon={<DeleteOutlined />}
                                          onClick={() => remove(name)}
                                        >
                                          删除
                                        </Button>
                                      )}
                                    </div>
                                    <Form.Item
                                      {...restField}
                                      name={[name, "id"]}
                                      hidden
                                    >
                                      <Input />
                                    </Form.Item>
                                    <Form.Item
                                      {...restField}
                                      name={[name, "payment_count"]}
                                      hidden
                                    >
                                      <Input />
                                    </Form.Item>
                                    <Form.Item
                                      {...restField}
                                      name={[
                                        name,
                                        "linked_payment_application_id",
                                      ]}
                                      hidden
                                    >
                                      <Input />
                                    </Form.Item>
                                    <FormRow template="120px minmax(0, 1fr) 160px">
                                      <Form.Item
                                        {...restField}
                                        label="期次"
                                        name={[name, "phase_no"]}
                                        rules={[
                                          {
                                            required: true,
                                            message: "请输入付款期次",
                                          },
                                        ]}
                                      >
                                        <InputNumber
                                          min={1}
                                          precision={0}
                                          disabled={locked}
                                          style={{ width: "100%" }}
                                        />
                                      </Form.Item>
                                      <Form.Item
                                        {...restField}
                                        label="期次名称"
                                        name={[name, "phase_name"]}
                                      >
                                        <Input
                                          disabled={locked}
                                          maxLength={128}
                                          placeholder="如：首付款、验收款"
                                        />
                                      </Form.Item>
                                      <Form.Item
                                        {...restField}
                                        label="支付状态"
                                        name={[name, "status"]}
                                        initialValue="pending"
                                        rules={[
                                          {
                                            required: true,
                                            message: "请选择支付状态",
                                          },
                                        ]}
                                      >
                                        <Select
                                          disabled={locked}
                                          options={[
                                            {
                                              value: "pending",
                                              label: "待支付",
                                            },
                                            { value: "paid", label: "已支付" },
                                            {
                                              value: "not_required",
                                              label: "无需支付",
                                            },
                                            {
                                              value: "processing",
                                              label: "支付处理中",
                                              disabled: true,
                                            },
                                            {
                                              value: "cancelled",
                                              label: "已取消",
                                              disabled: true,
                                            },
                                          ]}
                                        />
                                      </Form.Item>
                                    </FormRow>
                                    <FormRow template="minmax(220px, 1fr) 110px 180px">
                                      <Form.Item
                                        {...restField}
                                        label="计划金额"
                                        name={[name, "planned_amount"]}
                                        rules={[
                                          {
                                            required: true,
                                            message: "请输入计划金额",
                                          },
                                          {
                                            validator: (_, value) =>
                                              Number(value) > 0
                                                ? Promise.resolve()
                                                : Promise.reject(
                                                    new Error(
                                                      "计划金额必须大于 0",
                                                    ),
                                                  ),
                                          },
                                        ]}
                                      >
                                        <MoneyInput
                                          min={0.01}
                                          disabled={locked}
                                        />
                                      </Form.Item>
                                      <Form.Item
                                        {...restField}
                                        label="币种"
                                        name={[name, "currency"]}
                                        initialValue="CNY"
                                      >
                                        <Select
                                          disabled={locked}
                                          options={[
                                            { value: "CNY", label: "CNY" },
                                            { value: "USD", label: "USD" },
                                            { value: "HKD", label: "HKD" },
                                          ]}
                                        />
                                      </Form.Item>
                                      <Form.Item
                                        {...restField}
                                        label="计划付款日"
                                        name={[name, "planned_pay_date"]}
                                      >
                                        <DatePicker
                                          disabled={locked}
                                          style={{ width: "100%" }}
                                        />
                                      </Form.Item>
                                    </FormRow>
                                    <Form.Item
                                      {...restField}
                                      label="付款触发条件"
                                      name={[name, "trigger_condition"]}
                                    >
                                      <Input
                                        disabled={locked}
                                        maxLength={500}
                                        placeholder="如：合同签署后、项目验收后"
                                      />
                                    </Form.Item>
                                    <Form.Item
                                      {...restField}
                                      label="计划备注"
                                      name={[name, "remark"]}
                                    >
                                      <Input.TextArea
                                        disabled={locked}
                                        rows={2}
                                        maxLength={1000}
                                      />
                                    </Form.Item>
                                  </div>
                                );
                              },
                            )}
                            <Form.ErrorList errors={errors} />
                            {readOnly ? null : (
                              <Button
                                block
                                type="dashed"
                                icon={<PlusOutlined />}
                                onClick={() =>
                                  add({
                                    phase_no: fields.length + 1,
                                    currency:
                                      form.getFieldValue("currency") || "CNY",
                                    status: "pending",
                                  })
                                }
                              >
                                新增付款计划
                              </Button>
                            )}
                          </div>
                        )}
                      </Form.List>
                    </>
                  ),
                },
              ]}
            />
          )}

          <FormRow columns={1}>
            <Form.Item label="对外接口人" name="liaison_user_id">
              <Select
                allowClear
                showSearch
                filterOption={false}
                loading={employeeLoading}
                placeholder="搜索我方员工姓名、花名、工号、手机或邮箱"
                options={employeeSelectOptions.map((option) => ({
                  value: option.value,
                  label: option.label,
                  secondary: option.secondary,
                }))}
                optionRender={(option) => (
                  <Space direction="vertical" size={0}>
                    <span>{option.label}</span>
                    {option.data.secondary ? (
                      <span style={{ color: "#8c8c8c", fontSize: 12 }}>
                        {option.data.secondary}
                      </span>
                    ) : null}
                  </Space>
                )}
                onSearch={setEmployeeKeyword}
                onChange={applyLiaisonEmployee}
              />
            </Form.Item>
          </FormRow>
          <Form.Item name="liaison_name_snapshot" hidden>
            <Input />
          </Form.Item>

          <Form.Item label="合同文件" name={ATTACHMENTS_FIELD}>
            <AttachmentUpload
              disabled={readOnly}
              maxCount={20}
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            />
          </Form.Item>

          <Form.Item label="备注说明" name="remark">
            <Input.TextArea
              rows={3}
              placeholder="填写合同背景、特殊约定或其他补充说明"
              maxLength={1000}
              showCount
            />
          </Form.Item>

          <Form.Item
            label="合同评价与注意事项"
            name="contract_assessment"
            extra="支持 Markdown；建议客观描述合同价值、履约基础、主要风险及审批后需要持续关注的事项。"
          >
            <Input.TextArea
              rows={10}
              placeholder={[
                "## 客观评价",
                "",
                "合同目标、商业价值及条款总体评价。",
                "",
                "## 注意事项",
                "",
                "- 付款前需取得对应发票",
                "- 验收资料需由项目负责人留档",
                "",
                "## 风险与处置",
                "",
                "- **中风险**：风险事实、影响和处置建议",
              ].join("\n")}
              maxLength={10000}
              showCount
              style={{
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              }}
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
          onSaveDraft={() => onSave(false)}
          onSaveAndSubmit={() => onSave(true)}
          saving={saving}
        />
      )}
    </Card>
  );
};

export default ContractForm;
