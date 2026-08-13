import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  message,
} from "antd";
import dayjs from "dayjs";
import { manageReceivableContract } from "./api";
import type { ReceivablePlan } from "./types";
import styles from "./receivable-plan-drawer.module.css";

const PLAN_STATUS_OPTIONS = [
  { value: "DRAFT", label: "待补全" },
  { value: "PENDING", label: "待收款" },
  { value: "INVOICED", label: "已开票" },
  { value: "PARTIALLY_RECEIVED", label: "部分收款" },
  { value: "RECEIVED", label: "已收款" },
  { value: "NOT_REQUIRED", label: "无需收款" },
];

type ReceivablePlanDrawerProps = {
  open: boolean;
  contractId: number;
  contractTitle: string;
  companyName: string;
  contractCurrency?: string;
  plans: ReceivablePlan[];
  plan?: ReceivablePlan;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

function dateValue(value?: string) {
  return value ? dayjs(value) : null;
}

export default function ReceivablePlanDrawer({
  open,
  contractId,
  contractTitle,
  companyName,
  contractCurrency,
  plans,
  plan,
  onClose,
  onSaved,
}: ReceivablePlanDrawerProps) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const editing = Boolean(plan?.id);
  const nextPhaseNo = useMemo(
    () => Math.max(0, ...plans.map((item) => Number(item.phase_no) || 0)) + 1,
    [plans],
  );

  useEffect(() => {
    if (!open) return;
    if (plan) {
      form.setFieldsValue({
        phaseNo: plan.phase_no,
        phaseName: plan.phase_name,
        plannedAmount: plan.planned_amount,
        currency: plan.currency,
        plannedReceiptDate: dateValue(plan.planned_receipt_date),
        triggerCondition: plan.trigger_condition,
        status: plan.status,
        invoicedAmount: plan.invoiced_amount,
        receivedAmount: plan.received_amount,
        actualReceivedDate: dateValue(plan.actual_received_date),
        remark: plan.remark,
      });
      return;
    }
    form.setFieldsValue({
      phaseNo: nextPhaseNo,
      phaseName: `第${nextPhaseNo}期`,
      plannedAmount: undefined,
      currency: contractCurrency || "CNY",
      plannedReceiptDate: null,
      triggerCondition: undefined,
      status: "PENDING",
      invoicedAmount: 0,
      receivedAmount: 0,
      actualReceivedDate: null,
      remark: undefined,
    });
  }, [contractCurrency, form, nextPhaseNo, open, plan]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await manageReceivableContract({
        action: "save_plan",
        contractId,
        plan: {
          id: plan?.id,
          ...values,
          plannedReceiptDate:
            values.plannedReceiptDate?.format("YYYY-MM-DD") || "",
          actualReceivedDate:
            values.actualReceivedDate?.format("YYYY-MM-DD") || "",
        },
      });
      message.success(editing ? "收款计划已更新" : "收款计划已创建");
      onClose();
      await onSaved();
    } catch (requestError) {
      message.error(
        requestError instanceof Error ? requestError.message : "保存失败",
      );
    } finally {
      setSaving(false);
    }
  };

  const cancelPlan = async () => {
    if (!plan?.id) return;
    setSaving(true);
    try {
      await manageReceivableContract({
        action: "cancel_plan",
        contractId,
        planId: plan.id,
      });
      message.success("收款计划已取消");
      onClose();
      await onSaved();
    } catch (requestError) {
      message.error(
        requestError instanceof Error ? requestError.message : "取消失败",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      width={720}
      title={editing ? "编辑收款计划" : "新增收款计划"}
      onClose={saving ? undefined : onClose}
      footer={
        <div className={styles.footer}>
          <Space>
            <Button
              type="primary"
              loading={saving}
              onClick={() => void submit()}
            >
              保存
            </Button>
            <Button disabled={saving} onClick={onClose}>
              取消
            </Button>
          </Space>
          {editing ? (
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
        </div>
      }
    >
      <div className={styles.context}>
        <strong>{contractTitle}</strong>
        <span>{companyName}</span>
      </div>
      <Alert
        type="info"
        showIcon
        message="这里维护合同约定的收款期次"
        description="实际到账仍以回款记录及核销结果为准。"
      />
      <Form form={form} layout="vertical" className={styles.form}>
        <div className={styles.threeColumns}>
          <Form.Item
            name="phaseNo"
            label="期次序号"
            rules={[{ required: true, message: "请输入期次序号" }]}
          >
            <InputNumber min={1} precision={0} />
          </Form.Item>
          <Form.Item
            name="phaseName"
            label="期次名称"
            rules={[{ required: true, message: "请输入期次名称" }]}
          >
            <Input placeholder="例如：首期服务费" />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={PLAN_STATUS_OPTIONS} />
          </Form.Item>
        </div>

        <div className={styles.threeColumns}>
          <Form.Item name="plannedAmount" label="计划收款金额">
            <InputNumber min={0} precision={2} />
          </Form.Item>
          <Form.Item name="currency" label="币种" rules={[{ required: true }]}>
            <Select
              options={["CNY", "USD", "HKD", "EUR"].map((value) => ({
                value,
                label: value,
              }))}
            />
          </Form.Item>
          <Form.Item name="plannedReceiptDate" label="计划收款日">
            <DatePicker />
          </Form.Item>
        </div>

        <Form.Item name="triggerCondition" label="收款触发条件">
          <Input.TextArea
            rows={3}
            placeholder="例如：验收通过并开具发票后 15 个工作日内"
          />
        </Form.Item>

        <div className={styles.threeColumns}>
          <Form.Item name="invoicedAmount" label="已开票金额">
            <InputNumber min={0} precision={2} />
          </Form.Item>
          <Form.Item name="receivedAmount" label="已收款金额">
            <InputNumber min={0} precision={2} />
          </Form.Item>
          <Form.Item name="actualReceivedDate" label="实际收款日">
            <DatePicker />
          </Form.Item>
        </div>

        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}

ReceivablePlanDrawer.displayName = "收款计划抽屉";
