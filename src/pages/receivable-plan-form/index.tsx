/**
 * title: 收款计划维护
 */
import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Spin,
  message,
} from "antd";
import dayjs from "dayjs";
import { useNavigate, useSearchParams } from "react-router-dom";
import PageScaffold from "@/components/page-scaffold/PageScaffold";
import {
  getReceivableContractDetail,
  manageReceivableContract,
} from "@/features/crm-domain/api";
import type { ReceivableContractDetailResponse } from "@/features/crm-domain/types";

const PLAN_STATUS_OPTIONS = [
  { value: "DRAFT", label: "待补全" },
  { value: "PENDING", label: "待收款" },
  { value: "INVOICED", label: "已开票" },
  { value: "PARTIALLY_RECEIVED", label: "部分收款" },
  { value: "RECEIVED", label: "已收款" },
  { value: "NOT_REQUIRED", label: "无需收款" },
];

function dateValue(value?: string) {
  return value ? dayjs(value) : null;
}

export default function ReceivablePlanFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const contractId = Number(searchParams.get("contractId"));
  const planId = Number(searchParams.get("planId"));
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<ReceivableContractDetailResponse>();

  const load = async () => {
    if (!contractId) {
      setError("缺少有效的收款合同参数");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await getReceivableContractDetail(contractId);
      setDetail(response);
      const current = response.plans.find((plan) => plan.id === planId);
      form.setFieldsValue(
        current
          ? {
              phaseNo: current.phase_no,
              phaseName: current.phase_name,
              plannedAmount: current.planned_amount,
              currency: current.currency,
              plannedReceiptDate: dateValue(current.planned_receipt_date),
              triggerCondition: current.trigger_condition,
              status: current.status,
              invoicedAmount: current.invoiced_amount,
              receivedAmount: current.received_amount,
              actualReceivedDate: dateValue(current.actual_received_date),
              remark: current.remark,
            }
          : {
              phaseNo: response.plans.length + 1,
              phaseName: `第${response.plans.length + 1}期`,
              currency: response.contract.currency || "CNY",
              status: "PENDING",
              invoicedAmount: 0,
              receivedAmount: 0,
            },
      );
      if (planId && !current) setError("指定的收款计划不存在");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "加载收款计划失败",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [contractId, planId]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await manageReceivableContract({
        action: "save_plan",
        contractId,
        plan: {
          id: planId || undefined,
          ...values,
          plannedReceiptDate:
            values.plannedReceiptDate?.format("YYYY-MM-DD") || "",
          actualReceivedDate:
            values.actualReceivedDate?.format("YYYY-MM-DD") || "",
        },
      });
      message.success(planId ? "收款计划已更新" : "收款计划已创建");
      navigate(`/receivable-contract-detail/${contractId}`);
    } catch (requestError) {
      message.error(
        requestError instanceof Error ? requestError.message : "保存失败",
      );
    } finally {
      setSaving(false);
    }
  };

  const cancelPlan = async () => {
    setSaving(true);
    try {
      await manageReceivableContract({
        action: "cancel_plan",
        contractId,
        planId,
      });
      message.success("收款计划已取消");
      navigate(`/receivable-contract-detail/${contractId}`);
    } catch (requestError) {
      message.error(
        requestError instanceof Error ? requestError.message : "取消失败",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <PageScaffold
      title={planId ? "编辑收款计划" : "新增收款计划"}
      description={
        detail
          ? `${detail.contract.title} · ${detail.contract.companyName}`
          : "维护客户合同的应收期次"
      }
      variant="form"
      maxWidth={980}
    >
      {error ? <Alert type="error" showIcon message={error} /> : null}
      <Card>
        <Form form={form} layout="vertical" disabled={Boolean(error)}>
          <Space size={16} align="start" wrap style={{ width: "100%" }}>
            <Form.Item
              name="phaseNo"
              label="期次序号"
              rules={[{ required: true, message: "请输入期次序号" }]}
            >
              <InputNumber min={1} precision={0} style={{ width: 180 }} />
            </Form.Item>
            <Form.Item
              name="phaseName"
              label="期次名称"
              rules={[{ required: true, message: "请输入期次名称" }]}
            >
              <Input style={{ width: 260 }} placeholder="例如：首期服务费" />
            </Form.Item>
            <Form.Item name="status" label="状态" rules={[{ required: true }]}>
              <Select style={{ width: 180 }} options={PLAN_STATUS_OPTIONS} />
            </Form.Item>
          </Space>
          <Space size={16} align="start" wrap style={{ width: "100%" }}>
            <Form.Item name="plannedAmount" label="计划收款金额">
              <InputNumber min={0} precision={2} style={{ width: 220 }} />
            </Form.Item>
            <Form.Item
              name="currency"
              label="币种"
              rules={[{ required: true }]}
            >
              <Select
                style={{ width: 140 }}
                options={["CNY", "USD", "HKD", "EUR"].map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </Form.Item>
            <Form.Item name="plannedReceiptDate" label="计划收款日">
              <DatePicker style={{ width: 180 }} />
            </Form.Item>
          </Space>
          <Form.Item name="triggerCondition" label="收款触发条件">
            <Input.TextArea
              rows={3}
              placeholder="例如：验收通过并开具发票后 15 个工作日内"
            />
          </Form.Item>
          <Space size={16} align="start" wrap style={{ width: "100%" }}>
            <Form.Item name="invoicedAmount" label="已开票金额">
              <InputNumber min={0} precision={2} style={{ width: 220 }} />
            </Form.Item>
            <Form.Item name="receivedAmount" label="已收款金额">
              <InputNumber min={0} precision={2} style={{ width: 220 }} />
            </Form.Item>
            <Form.Item name="actualReceivedDate" label="实际收款日">
              <DatePicker style={{ width: 180 }} />
            </Form.Item>
          </Space>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space>
            <Button
              type="primary"
              loading={saving}
              onClick={() => void submit()}
            >
              保存
            </Button>
            <Button
              onClick={() =>
                navigate(`/receivable-contract-detail/${contractId}`)
              }
            >
              取消
            </Button>
            {planId ? (
              <Popconfirm
                title="确认取消这个收款期次？"
                description="计划会保留并标记为已取消，不会删除历史记录。"
                onConfirm={() => void cancelPlan()}
              >
                <Button danger loading={saving}>
                  取消该期次
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        </Form>
      </Card>
    </PageScaffold>
  );
}
