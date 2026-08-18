/**
 * title: 新建付款
 */
import React, { useEffect, useState } from "react";
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
  Alert,
  Divider,
  Table,
  Tag,
  Typography,
  Tooltip,
  message,
  Skeleton,
} from "antd";
import { ArrowLeftOutlined, EditOutlined } from "@ant-design/icons";
import { YtUserSelect, useUserList } from "@yuntoo/components";
import dayjs from "dayjs";
import { lovrabetClient } from "@/api/client";
import AgentFormGuide from "@/components/agent-form-guide";
import AttachmentUpload from "@/components/attachment-upload";
import FormFooter from "@/components/form-footer";
import FormLayout, { FormRow } from "@/components/form-layout";
import MoneyInput from "@/components/money-input";
import PartySelector from "@/components/party-selector";
import ProjectTabs from "@/components/project-tabs";
import {
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

const PAYMENT_CODE = "7da208a5059b4b13896d7c7ae29c8492";
const CONTRACT_CODE = "53869993f80f45ae8ef6cdf051d8e355";
const PARTNER_CODE = "68c70907e27c481cbefb96dd3906936e";
const APP_CODE = "app-4d050189";
const ATTACHMENTS_FIELD = "_attachments";
type PaymentMode = "with_contract" | "without_contract";

function normalizeComparableText(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function normalizeComparableDate(value: unknown) {
  return value && dayjs(value).isValid()
    ? dayjs(value).format("YYYY-MM-DD")
    : "";
}

type ContractPaymentPlan = {
  id: number;
  contract_id: number;
  phase_no: number;
  phase_name?: string;
  planned_amount: number;
  currency?: string;
  planned_pay_date?: string;
  trigger_condition?: string;
  status: "pending" | "processing" | "paid" | "not_required" | "cancelled";
  linked_payment_application_id?: number;
  payment_count?: number;
  paid_payment_count?: number;
  applied_amount?: number;
  confirmed_paid_amount?: number;
  remaining_amount?: number;
};

type PaymentHistoryRow = {
  id: number;
  payment_plan_id?: number;
  title?: string;
  amount?: number;
  currency?: string;
  payment_phase_no?: number;
  payment_phase_name?: string;
  expected_pay_date?: string;
  status?: string;
  created_at?: string;
};

type ContractPaymentContext = {
  contract: Record<string, any>;
  partner?: Record<string, any> | null;
  plans: ContractPaymentPlan[];
  pendingPlan: ContractPaymentPlan | null;
  paymentHistory: PaymentHistoryRow[];
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  submitted: "审核中",
  reviewed: "已审核",
  voucher_created: "财务已制单",
  bank_review_pending: "网银待复核",
  bank_pending: "银行处理中",
  paid_confirmed: "已付款",
  payment_failed: "付款失败",
  rejected: "已驳回",
  cancelled: "已取消",
};

const PAYMENT_PLAN_STATUS_LABELS: Record<
  ContractPaymentPlan["status"],
  string
> = {
  pending: "待支付",
  processing: "支付处理中",
  paid: "已支付",
  not_required: "无需支付",
  cancelled: "已取消",
};

const PaymentForm: React.FC = () => {
  const [params] = useSearchParams();
  const editId = params.get("id");
  const mode = params.get("mode");
  const initialContractId = Number(params.get("contractId") || 0) || undefined;
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordStatus, setRecordStatus] = useState<string>();
  const [contracts, setContracts] = useState<
    { id: number; name: string; amount?: number }[]
  >([]);
  const [paymentPlans, setPaymentPlans] = useState<ContractPaymentPlan[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryRow[]>([]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("with_contract");
  const [contractContext, setContractContext] =
    useState<ContractPaymentContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [planFieldsEditing, setPlanFieldsEditing] = useState(false);
  const watchedContractId = Form.useWatch("contract_id", form);
  const watchedPaymentPlanId = Form.useWatch("payment_plan_id", form);
  const watchedLiaisonUserId = Form.useWatch("liaison_user_id", form);
  const watchedTitle = Form.useWatch("title", form);
  const watchedAmount = Form.useWatch("amount", form);
  const watchedCurrency = Form.useWatch("currency", form);
  const watchedPhaseNo = Form.useWatch("payment_phase_no", form);
  const watchedPhaseName = Form.useWatch("payment_phase_name", form);
  const watchedTotalPhaseCount = Form.useWatch("total_phase_count", form);
  const watchedTriggerCondition = Form.useWatch(
    "phase_trigger_condition",
    form,
  );
  const watchedExpectedPayDate = Form.useWatch("expected_pay_date", form);
  const watchedPlanVarianceReason = Form.useWatch("plan_variance_reason", form);
  const { originUserList: liaisonUsers } = useUserList(APP_CODE);
  const isEdit = !!editId;
  const readOnly = isWorkflowReadonly(recordStatus, mode);
  const withContract = paymentMode === "with_contract";
  const selectedPlan =
    paymentPlans.find(
      (plan) => Number(plan.id) === Number(watchedPaymentPlanId),
    ) || null;
  const expectedPlanTitle = selectedPlan
    ? `${contractContext?.contract?.contract_name || "合同"}${
        selectedPlan.phase_name || `第${selectedPlan.phase_no}期`
      }付款`
    : "";
  const planDataModified = Boolean(
    withContract &&
    selectedPlan &&
    (normalizeComparableText(watchedTitle) !==
      normalizeComparableText(expectedPlanTitle) ||
      Number(watchedAmount) !== Number(selectedPlan.planned_amount) ||
      normalizeComparableText(watchedCurrency || "CNY") !==
        normalizeComparableText(
          selectedPlan.currency || contractContext?.contract?.currency || "CNY",
        ) ||
      Number(watchedPhaseNo) !== Number(selectedPlan.phase_no) ||
      normalizeComparableText(watchedPhaseName) !==
        normalizeComparableText(selectedPlan.phase_name) ||
      Number(watchedTotalPhaseCount) !== paymentPlans.length ||
      normalizeComparableText(watchedTriggerCondition) !==
        normalizeComparableText(selectedPlan.trigger_condition) ||
      normalizeComparableDate(watchedExpectedPayDate) !==
        normalizeComparableDate(selectedPlan.planned_pay_date)),
  );
  const planFieldsReadonly = withContract && !planFieldsEditing;

  const applyPaymentPlan = (
    plan: ContractPaymentPlan | null,
    contract?: Record<string, any>,
    planCount = paymentPlans.length,
    partner?: Record<string, any> | null,
  ) => {
    setPlanFieldsEditing(false);
    form.setFields([{ name: "plan_variance_reason", errors: [] }]);
    const contractName = contract?.contract_name || "合同";
    const contractFields = {
      payment_type: "contract_payment",
      partner_id: contract?.partner_id ?? null,
      liaison_user_id: contract?.liaison_user_id ?? null,
      liaison_name_snapshot: contract?.liaison_name_snapshot ?? null,
      currency: contract?.currency || "CNY",
      bank_account_snapshot:
        [partner?.bank_name, partner?.bank_account].filter(Boolean).join(" ") ||
        null,
    };
    if (!plan) {
      form.setFieldsValue({
        ...contractFields,
        title: contract ? `${contractName}付款` : "",
        payment_plan_id: null,
        payment_phase_no: null,
        payment_phase_name: null,
        total_phase_count: planCount || null,
        phase_trigger_condition: null,
        amount: null,
        expected_pay_date: null,
        planned_amount_snapshot: null,
        planned_pay_date_snapshot: null,
        plan_variance_reason: null,
      });
      return;
    }
    form.setFieldsValue({
      ...contractFields,
      payment_plan_id: Number(plan.id),
      payment_phase_no: Number(plan.phase_no),
      payment_phase_name: plan.phase_name || "",
      total_phase_count: planCount,
      phase_trigger_condition: plan.trigger_condition || "",
      amount: Number(plan.planned_amount),
      planned_amount_snapshot: Number(plan.planned_amount),
      currency: plan.currency || contract?.currency || "CNY",
      expected_pay_date: plan.planned_pay_date
        ? dayjs(plan.planned_pay_date)
        : null,
      planned_pay_date_snapshot: plan.planned_pay_date || null,
      plan_variance_reason: null,
      title: `${contractName}${plan.phase_name || `第${plan.phase_no}期`}付款`,
    });
  };

  const resetBusinessFields = (nextMode: PaymentMode) => {
    form.setFieldsValue({
      title: "",
      payment_type:
        nextMode === "with_contract" ? "contract_payment" : "vendor_payment",
      partner_id: null,
      contract_id: null,
      payment_plan_id: null,
      payment_phase_no: null,
      payment_phase_name: null,
      total_phase_count: null,
      phase_trigger_condition: null,
      amount: null,
      planned_amount_snapshot: null,
      currency: "CNY",
      expected_pay_date: null,
      planned_pay_date_snapshot: null,
      plan_variance_reason: null,
      liaison_user_id: null,
      liaison_name_snapshot: null,
      bank_account_snapshot: null,
    });
    setContractContext(null);
    setPaymentPlans([]);
    setPaymentHistory([]);
    setPlanFieldsEditing(false);
  };

  const handlePaymentModeChange = (nextMode: string) => {
    const normalizedMode = nextMode as PaymentMode;
    if (normalizedMode === paymentMode || readOnly) return;
    resetBusinessFields(normalizedMode);
    setPaymentMode(normalizedMode);
  };

  const loadContractPaymentContext = async (
    contractId: number,
    autoApply: boolean,
  ) => {
    setContextLoading(true);
    try {
      const result = await lovrabetClient.bff.execute<ContractPaymentContext>({
        scriptName: "cpoGetContractPaymentContext",
        params: { contractId },
      });
      const partner =
        result.contract?.contract_type !== "sales" &&
        result.contract?.partner_id
          ? await lovrabetClient.models[`dataset_${PARTNER_CODE}`]
              .getOne({
                id: Number(result.contract.partner_id),
              })
              .catch(() => null)
          : null;
      const enrichedResult = { ...result, partner };
      const plans = result.plans || [];
      setContractContext(enrichedResult);
      setPaymentPlans(plans);
      setPaymentHistory(result.paymentHistory || []);
      if (autoApply) {
        applyPaymentPlan(
          result.pendingPlan,
          result.contract,
          plans.length,
          partner,
        );
      }
      return enrichedResult;
    } finally {
      setContextLoading(false);
    }
  };

  const handleContractChange = async (contractId?: number) => {
    if (!contractId) {
      setContractContext(null);
      setPaymentPlans([]);
      setPaymentHistory([]);
      applyPaymentPlan(null, undefined, 0);
      return;
    }
    setContractContext(null);
    setPaymentPlans([]);
    setPaymentHistory([]);
    applyPaymentPlan(null, undefined, 0);
    try {
      const result = await loadContractPaymentContext(contractId, true);
      if (!result.pendingPlan) {
        message.warning("该合同当前没有待付款计划，请先维护付款计划");
      }
    } catch (error: any) {
      form.setFieldValue("contract_id", null);
      setContractContext(null);
      setPaymentPlans([]);
      setPaymentHistory([]);
      applyPaymentPlan(null, undefined, 0);
      message.error(`付款计划加载失败：${error?.message || error}`);
    }
  };

  const handlePlanChange = (planId?: number) => {
    const plan =
      paymentPlans.find((item) => Number(item.id) === Number(planId)) || null;
    applyPaymentPlan(
      plan,
      contractContext?.contract,
      paymentPlans.length,
      contractContext?.partner,
    );
  };

  const handleLiaisonChange = (userIds: string[]) => {
    const userId = userIds[0] || null;
    const selectedUser = liaisonUsers.find(
      (user) => String(user.code) === String(userId),
    );
    form.setFieldsValue({
      liaison_user_id: userId,
      liaison_name_snapshot: userId
        ? selectedUser?.nickName || selectedUser?.userName || String(userId)
        : null,
    });
  };

  useEffect(() => {
    lovrabetClient.models[`dataset_${CONTRACT_CODE}`]
      .filter({
        where: {
          status: {
            $in: ["submitted", "reviewed", "signed", "archived", "completed"],
          },
        },
        currentPage: 1,
        pageSize: 200,
      })
      .then((r: any) => {
        const nextContracts = (r.tableData || []).map((c: any) => ({
          id: c.id,
          name: c.contract_name,
          amount: c.amount,
        }));
        setContracts(nextContracts);
        if (!editId && initialContractId) {
          const exists = nextContracts.some(
            (contract: { id: number }) =>
              Number(contract.id) === initialContractId,
          );
          if (!exists) {
            message.warning("该合同当前不可发起付款");
            return;
          }
          form.setFieldValue("contract_id", initialContractId);
          void handleContractChange(initialContractId);
        }
      });
  }, []);

  useEffect(() => {
    if (!editId) return;
    setLoading(true);
    lovrabetClient.models[`dataset_${PAYMENT_CODE}`]
      .getOne({ id: Number(editId) })
      .then(async (rec: any) => {
        if (rec?.id) {
          setPaymentMode(
            rec.contract_id ? "with_contract" : "without_contract",
          );
          const [attachments] = await Promise.all([
            listAttachmentValues({
              bizType: "payment",
              bizId: Number(rec.id),
              attachmentType: "approval_material",
            }),
            rec.contract_id
              ? loadContractPaymentContext(Number(rec.contract_id), false)
              : Promise.resolve(null),
          ]);
          form.setFieldsValue({
            ...rec,
            expected_pay_date: rec.expected_pay_date
              ? dayjs(rec.expected_pay_date)
              : null,
            [ATTACHMENTS_FIELD]: attachments,
          });
          setRecordStatus(rec.status);
        } else message.error("未找到该付款");
      })
      .catch((e: any) => message.error(`加载失败：${e?.message || e}`))
      .finally(() => setLoading(false));
  }, [editId, form]);

  useEffect(() => {
    lovrabetClient.bff
      .execute<CurrentActor>({
        scriptName: CURRENT_ACTOR_SCRIPT,
        params: {},
      })
      .then((actor) => prefillApplicantFields(form, actor))
      .catch(() => undefined);
  }, [form]);

  const onSave = async (thenSubmit = false) => {
    if (readOnly) {
      message.warning("当前单据不可编辑");
      return;
    }
    if (withContract && !form.getFieldValue("contract_id")) {
      message.warning("请先选择合同");
      return;
    }
    if (withContract && !form.getFieldValue("payment_plan_id")) {
      message.warning("所选合同没有可用的待付款计划，请先维护付款计划");
      return;
    }
    if (
      withContract &&
      planDataModified &&
      !normalizeComparableText(form.getFieldValue("plan_variance_reason"))
    ) {
      form.setFields([
        {
          name: "plan_variance_reason",
          errors: ["修改期次数据后必须填写修改备注"],
        },
      ]);
      message.warning("请填写期次数据的修改备注");
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
    setSaving(true);
    try {
      const payload: any = {
        partner_id: values.partner_id ?? null,
        contract_id: withContract ? values.contract_id : null,
        payment_plan_id: withContract ? values.payment_plan_id : null,
        payment_type: values.payment_type ?? null,
        title: values.title ?? "",
        amount: values.amount ?? 0,
        planned_amount_snapshot: withContract
          ? (values.planned_amount_snapshot ?? null)
          : null,
        currency: values.currency || "CNY",
        remark: values.remark ?? "",
      };
      [
        "payment_phase_no",
        "payment_phase_name",
        "total_phase_count",
        "phase_trigger_condition",
        "liaison_user_id",
        "liaison_name_snapshot",
        "bank_account_snapshot",
        "planned_pay_date_snapshot",
        "plan_variance_reason",
      ].forEach((k) => {
        const contractScoped =
          k === "planned_pay_date_snapshot" || k === "plan_variance_reason";
        if (!withContract && contractScoped) {
          payload[k] = null;
          return;
        }
        payload[k] =
          values[k] !== undefined && values[k] !== null && values[k] !== ""
            ? values[k]
            : null;
      });
      payload.expected_pay_date = values.expected_pay_date
        ? dayjs(values.expected_pay_date).format("YYYY-MM-DD HH:mm:ss")
        : null;

      const saved = await lovrabetClient.bff.execute<{ bizId: number }>({
        scriptName: "cpoSaveDraft",
        params: {
          bizType: "payment",
          bizId: isEdit ? Number(editId) : undefined,
          values: payload,
          submit: thenSubmit,
        },
      });
      const id = saved.bizId;
      const attachments = await syncAttachmentRecords({
        bizType: "payment",
        bizId: id,
        attachmentType: "approval_material",
        files: values[ATTACHMENTS_FIELD],
        uploadedBy: values.applicant_name_snapshot,
      });
      form.setFieldValue(ATTACHMENTS_FIELD, attachments);
      if (thenSubmit) {
        message.success("已提交，进入审核");
      } else {
        message.success(isEdit ? "已更新" : "已创建草稿");
      }
      navigate("/ce56ba4ceec8471cbddf4068ea9c397a");
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(`保存失败：${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton active paragraph={{ rows: 10 }} />;

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
          {readOnly ? "查看付款" : isEdit ? "编辑付款" : "新建付款"}
        </Space>
      }
    >
      {readOnly ? null : (
        <AgentFormGuide
          skillCode="cpo-payment-application"
          skillName="付款申请助手"
          prompt="请根据合同和付款材料创建并提交付款申请"
          description="提供合同和付款材料后，Agent 可核对付款计划、整理附件并完成申请。"
        />
      )}
      <Form
        form={form}
        layout="vertical"
        disabled={saving || readOnly}
        initialValues={{
          payment_type: "contract_payment",
          currency: "CNY",
        }}
        requiredMark
      >
        <FormLayout>
          <ProjectTabs
            activeKey={paymentMode}
            onChange={handlePaymentModeChange}
            items={[
              {
                key: "with_contract",
                label: "已有合同",
                disabled: readOnly && paymentMode !== "with_contract",
              },
              {
                key: "without_contract",
                label: "无合同",
                disabled: readOnly && paymentMode !== "without_contract",
              },
            ]}
          />

          {withContract ? (
            <>
              <Typography.Paragraph
                type="secondary"
                style={{ margin: "-4px 0 16px" }}
              >
                选择合同后，系统自动读取合同基本信息，并默认带出首个待付款计划。付款期次可以改选，带出的付款数据可以调整。
              </Typography.Paragraph>
              <Form.Item
                label="选择合同"
                name="contract_id"
                rules={[{ required: true, message: "请选择合同" }]}
              >
                <Select
                  disabled={contextLoading}
                  showSearch
                  optionFilterProp="label"
                  placeholder="请选择本次付款对应的合同"
                  loading={contextLoading}
                  onChange={(value) =>
                    handleContractChange(value ? Number(value) : undefined)
                  }
                  options={contracts.map((c) => ({
                    value: c.id,
                    label:
                      c.amount != null
                        ? `${c.name}（¥${Number(c.amount).toLocaleString()}）`
                        : c.name,
                  }))}
                />
              </Form.Item>
            </>
          ) : (
            <Typography.Paragraph
              type="secondary"
              style={{ margin: "-4px 0 16px" }}
            >
              此模式不会关联合同。若属于合同付款，请先
              <Button
                type="link"
                size="small"
                href="/contract-form"
                target="_blank"
                style={{ paddingInline: 4 }}
              >
                新建合同
              </Button>
              ，再返回选择。
            </Typography.Paragraph>
          )}

          {!withContract || watchedContractId ? (
            <>
              <Form.Item
                label="付款标题"
                name="title"
                rules={[{ required: true, message: "请输入付款标题" }]}
              >
                <Input
                  disabled={planFieldsReadonly}
                  placeholder="如：XX 服务费首付款"
                  maxLength={120}
                  showCount
                />
              </Form.Item>

              <PartySelector
                form={form}
                bizType="payment"
                typeName="payment_type"
                typeLabel="付款类型"
                partnerName="partner_id"
                partnerLabel="收款方"
                disabled={withContract}
                isSalesType={(v) =>
                  withContract
                    ? contractContext?.contract?.contract_type === "sales"
                    : v === "contract_payment" || v === "reimbursement"
                }
              >
                <Select
                  defaultValue="vendor_payment"
                  options={[
                    { value: "contract_payment", label: "合同付款" },
                    { value: "reimbursement", label: "报销付款" },
                    { value: "vendor_payment", label: "供应商付款" },
                    { value: "certification", label: "认证付款" },
                    { value: "cloud", label: "云服务" },
                    { value: "telecom", label: "通讯" },
                    { value: "other", label: "其他" },
                  ]}
                />
              </PartySelector>

              <FormRow template="110px">
                <Form.Item label="币种" name="currency" initialValue="CNY">
                  <Select
                    disabled={planFieldsReadonly}
                    options={[
                      { value: "CNY", label: "CNY" },
                      { value: "USD", label: "USD" },
                      { value: "HKD", label: "HKD" },
                    ]}
                  />
                </Form.Item>
              </FormRow>

              {withContract && watchedContractId ? (
                <>
                  <Form.Item label="选择付款期次" name="payment_plan_id">
                    <Select
                      loading={contextLoading}
                      placeholder="默认选择首个待付款计划，也可以改选"
                      onChange={(value) =>
                        handlePlanChange(value ? Number(value) : undefined)
                      }
                      options={paymentPlans.map((plan) => {
                        const selectedByCurrentPayment =
                          Number(plan.id) === Number(watchedPaymentPlanId);
                        const selectable =
                          plan.status === "pending" ||
                          plan.status === "processing" ||
                          (plan.status === "paid" &&
                            (selectedByCurrentPayment ||
                              Number(plan.remaining_amount || 0) > 0));
                        const paymentSummary = Number(plan.payment_count || 0)
                          ? ` · ${plan.payment_count} 笔付款`
                          : "";
                        return {
                          value: Number(plan.id),
                          label: `第 ${plan.phase_no} 期${plan.phase_name ? ` · ${plan.phase_name}` : ""} · ${plan.currency || "CNY"} ${Number(plan.planned_amount).toLocaleString()} · ${PAYMENT_PLAN_STATUS_LABELS[plan.status]}${paymentSummary}`,
                          disabled: !selectable,
                        };
                      })}
                    />
                  </Form.Item>
                  {watchedPaymentPlanId ? (
                    <Typography.Text
                      type={planDataModified ? "warning" : "secondary"}
                      style={{ display: "block", margin: "-8px 0 12px" }}
                    >
                      {planDataModified
                        ? "期次数据已修改，请填写修改备注"
                        : planFieldsEditing
                          ? "期次数据已解锁，可以调整"
                          : "期次数据来自合同付款计划，默认只读"}
                    </Typography.Text>
                  ) : null}
                  {!contextLoading && !watchedPaymentPlanId ? (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginBottom: 12 }}
                      message="该合同没有待付款计划"
                      description="请先在合同中新增或调整待支付计划，当前模式不能手工填写付款信息。"
                    />
                  ) : null}
                  <Form.Item name="planned_amount_snapshot" hidden>
                    <Input />
                  </Form.Item>
                  <Form.Item name="planned_pay_date_snapshot" hidden>
                    <Input />
                  </Form.Item>
                </>
              ) : null}

              <FormRow
                template={
                  withContract && watchedPaymentPlanId && !readOnly
                    ? "minmax(320px, 420px) 32px"
                    : "minmax(320px, 420px)"
                }
              >
                <Form.Item
                  label="付款金额"
                  name="amount"
                  rules={[{ required: true, message: "请输入金额" }]}
                >
                  <MoneyInput min={0} disabled={planFieldsReadonly} />
                </Form.Item>
                {withContract && watchedPaymentPlanId && !readOnly ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      paddingTop: 30,
                    }}
                  >
                    <Tooltip
                      title={
                        planFieldsEditing ? "期次数据已解锁" : "修改期次数据"
                      }
                    >
                      <Button
                        type="text"
                        size="small"
                        aria-label="修改期次数据"
                        icon={<EditOutlined />}
                        disabled={planFieldsEditing}
                        onClick={() => setPlanFieldsEditing(true)}
                      />
                    </Tooltip>
                  </div>
                ) : null}
              </FormRow>

              <FormRow template="120px minmax(0, 1fr) 110px">
                <Form.Item label="期次编号" name="payment_phase_no">
                  <InputNumber
                    min={1}
                    placeholder="期次"
                    disabled={planFieldsReadonly}
                  />
                </Form.Item>
                <Form.Item label="期次名称" name="payment_phase_name">
                  <Input
                    placeholder="如：首付款"
                    disabled={planFieldsReadonly}
                  />
                </Form.Item>
                <Form.Item label="总期数" name="total_phase_count">
                  <InputNumber
                    min={1}
                    placeholder="总期"
                    disabled={planFieldsReadonly}
                  />
                </Form.Item>
              </FormRow>

              <Form.Item label="付款触发条件" name="phase_trigger_condition">
                <Input
                  placeholder="如：合同签署后 / 报完账后"
                  disabled={planFieldsReadonly}
                />
              </Form.Item>

              <FormRow template="240px">
                <Form.Item label="期望付款日期" name="expected_pay_date">
                  <DatePicker
                    placeholder="选择日期"
                    disabled={planFieldsReadonly}
                  />
                </Form.Item>
              </FormRow>

              {watchedPaymentPlanId &&
              (planFieldsEditing ||
                planDataModified ||
                normalizeComparableText(watchedPlanVarianceReason)) ? (
                <Form.Item
                  label="修改备注"
                  name="plan_variance_reason"
                  required={planDataModified}
                  rules={[
                    {
                      validator: async (_, value) => {
                        if (
                          planDataModified &&
                          !normalizeComparableText(value)
                        ) {
                          throw new Error("修改期次数据后必须填写修改备注");
                        }
                      },
                    },
                  ]}
                >
                  <Input
                    disabled={!planFieldsEditing}
                    maxLength={500}
                    placeholder="请说明本次付款数据的修改原因"
                  />
                </Form.Item>
              ) : null}

              <Form.Item label="对外接口人">
                <YtUserSelect
                  appCode={APP_CODE}
                  value={
                    watchedLiaisonUserId ? [String(watchedLiaisonUserId)] : []
                  }
                  maxCount={1}
                  maxTagCount={1}
                  placeholder="请选择对外接口人"
                  disabled={withContract}
                  onChange={handleLiaisonChange}
                />
              </Form.Item>
              <Form.Item name="liaison_user_id" hidden>
                <Input />
              </Form.Item>
              <Form.Item name="liaison_name_snapshot" hidden>
                <Input />
              </Form.Item>

              <Form.Item label="收款账户快照" name="bank_account_snapshot">
                <Input.TextArea
                  disabled={withContract}
                  rows={2}
                  placeholder="供应商账户信息，提交后被快照"
                />
              </Form.Item>
            </>
          ) : null}

          <Form.Item label="付款材料" name={ATTACHMENTS_FIELD}>
            <AttachmentUpload
              disabled={readOnly}
              maxCount={20}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
            />
          </Form.Item>

          <Form.Item label="备注说明" name="remark">
            <Input.TextArea
              rows={3}
              placeholder="填写付款背景、特殊安排或其他补充说明"
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

          {withContract && watchedContractId ? (
            <>
              <Divider orientation="left">历史付款记录</Divider>
              <Typography.Text
                type="secondary"
                style={{ display: "block", marginBottom: 12 }}
              >
                展示当前合同下已创建的全部付款申请，便于核对期次与执行状态。
              </Typography.Text>
              <Table<PaymentHistoryRow>
                rowKey="id"
                size="small"
                loading={contextLoading}
                pagination={false}
                dataSource={paymentHistory}
                locale={{ emptyText: "暂无历史付款记录" }}
                scroll={{ x: 720 }}
                columns={[
                  {
                    title: "付款标题",
                    dataIndex: "title",
                    width: 220,
                  },
                  {
                    title: "期次",
                    width: 120,
                    render: (_, row) =>
                      row.payment_phase_name ||
                      (row.payment_phase_no
                        ? `第 ${row.payment_phase_no} 期`
                        : "-"),
                  },
                  {
                    title: "金额",
                    width: 140,
                    render: (_, row) =>
                      `${row.currency || "CNY"} ${Number(row.amount || 0).toLocaleString()}`,
                  },
                  {
                    title: "期望付款日",
                    dataIndex: "expected_pay_date",
                    width: 140,
                    render: (value) =>
                      value ? dayjs(value).format("YYYY-MM-DD") : "-",
                  },
                  {
                    title: "状态",
                    dataIndex: "status",
                    width: 110,
                    render: (value) => (
                      <Tag
                        color={
                          value === "paid_confirmed"
                            ? "success"
                            : value === "payment_failed"
                              ? "error"
                              : value === "bank_pending"
                                ? "processing"
                                : "default"
                        }
                      >
                        {PAYMENT_STATUS_LABELS[value] || value || "-"}
                      </Tag>
                    ),
                  },
                ]}
              />
            </>
          ) : null}
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

export default PaymentForm;
