/**
 * title: 报销规则
 */
import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { EditOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { lovrabetClient } from "@/api/client";
import { useCpoDictionaryOptions } from "@/features/cpo-dictionary/options";
import { $i18n } from "@/i18n";
import {
  formatExpenseRuleDate,
  parseExpenseRuleDate,
} from "./date";

const t = (key: string, fallbackText: string) => $i18n.t(key, fallbackText);

const EXPENSE_RULE_CODE = "d60179efd37846e380aafdd166a02871";

type ExpenseRuleRecord = {
  id: number;
  rule_code: string;
  rule_name: string;
  expense_type: string;
  category: string;
  condition_text?: string;
  calculation_type: string;
  reimburse_ratio?: number | string | null;
  limit_amount?: number | string | null;
  requirement_text?: string;
  priority: number;
  status: string;
  effective_from?: string | number | null;
  effective_to?: string | number | null;
  remark?: string;
};

type ExpenseRuleFormValues = Omit<ExpenseRuleRecord, "id" | "status"> & {
  enabled?: boolean;
  effective_from?: any;
  effective_to?: any;
};

const ALL_EXPENSE_TYPE_OPTION = {
  value: "all",
  label: t("expenseRules.expenseType.all", "全部"),
};

const CATEGORY_OPTIONS = [
  { value: "all", label: t("expenseRules.category.all", "全部") },
  { value: "flight", label: t("expenseRules.category.flight", "机票") },
  { value: "hotel", label: t("expenseRules.category.hotel", "酒店") },
  { value: "taxi", label: t("expenseRules.category.taxi", "打车") },
  { value: "train", label: t("expenseRules.category.train", "火车") },
  { value: "meal", label: t("expenseRules.category.meal", "餐饮") },
  { value: "other", label: t("expenseRules.category.other", "其他") },
];

const CALCULATION_TYPE_OPTIONS = [
  { value: "full", label: t("expenseRules.calc.full", "全额报销") },
  { value: "ratio", label: t("expenseRules.calc.ratio", "按比例报销") },
  {
    value: "fixed_limit",
    label: t("expenseRules.calc.fixedLimit", "封顶报销"),
  },
  {
    value: "manual_review",
    label: t("expenseRules.calc.manualReview", "人工确认"),
  },
];

function getExpenseRuleModel() {
  const models = lovrabetClient.models as Record<string, any>;
  return models.expenseRule || models[`dataset_${EXPENSE_RULE_CODE}`];
}

function optionLabel(
  options: Array<{ value: string; label: string }>,
  value: string,
) {
  return options.find((option) => option.value === value)?.label || value || "-";
}

function toDateText(value: any) {
  return parseExpenseRuleDate(value)?.format("YYYY-MM-DD") || null;
}

function normalizeMoney(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function buildPayload(values: ExpenseRuleFormValues) {
  return {
    rule_code: values.rule_code?.trim(),
    rule_name: values.rule_name?.trim(),
    expense_type: values.expense_type || "all",
    category: values.category || "all",
    condition_text: values.condition_text || "",
    calculation_type: values.calculation_type || "manual_review",
    reimburse_ratio:
      values.calculation_type === "ratio" || values.calculation_type === "full"
        ? Number(
            values.reimburse_ratio ??
              (values.calculation_type === "full" ? 1 : 0),
          )
        : null,
    limit_amount:
      values.calculation_type === "fixed_limit"
        ? normalizeMoney(values.limit_amount)
        : null,
    requirement_text: values.requirement_text || "",
    priority: Number(values.priority) || 100,
    status: values.enabled === false ? "inactive" : "active",
    effective_from: toDateText(values.effective_from),
    effective_to: toDateText(values.effective_to),
    remark: values.remark || "",
  };
}

const ExpenseRulesPage: React.FC = () => {
  const [form] = Form.useForm<ExpenseRuleFormValues>();
  const [list, setList] = useState<ExpenseRuleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRuleRecord | null>(null);
  const [selectedExpenseType, setSelectedExpenseType] = useState("all");
  const {
    options: dictionaryExpenseTypeOptions,
    loading: expenseTypeOptionsLoading,
    error: expenseTypeOptionsError,
  } = useCpoDictionaryOptions("expense_type");
  const expenseTypeOptions = useMemo(
    () => [ALL_EXPENSE_TYPE_OPTION, ...dictionaryExpenseTypeOptions],
    [dictionaryExpenseTypeOptions],
  );
  const selectedCalculationType = Form.useWatch("calculation_type", form);

  const filteredList = useMemo(() => {
    if (selectedExpenseType === "all") return list;
    return list.filter(
      (rule) =>
        rule.expense_type === selectedExpenseType ||
        rule.expense_type === "all",
    );
  }, [list, selectedExpenseType]);

  const load = async () => {
    setLoading(true);
    try {
      const response = await getExpenseRuleModel().filter({
        currentPage: 1,
        pageSize: 500,
        orderBy: [{ priority: "asc" }, { id: "asc" }],
      });
      setList(response.tableData || []);
    } catch (error: any) {
      message.error(
        t("expenseRules.loadFailed", "加载失败：{reason}").replace(
          "{reason}",
          error?.message || String(error),
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue({
      expense_type: "all",
      category: "all",
      calculation_type: "manual_review",
      priority: 100,
      enabled: true,
      effective_from: dayjs(),
      effective_to: null,
      reimburse_ratio: undefined,
      limit_amount: undefined,
    });
    setModalOpen(true);
  };

  const openEdit = (record: ExpenseRuleRecord) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      enabled: record.status === "active",
      reimburse_ratio:
        record.reimburse_ratio === null ||
        record.reimburse_ratio === undefined
          ? undefined
          : Number(record.reimburse_ratio),
      limit_amount:
        record.limit_amount === null || record.limit_amount === undefined
          ? undefined
          : Number(record.limit_amount),
      effective_from: parseExpenseRuleDate(record.effective_from),
      effective_to: parseExpenseRuleDate(record.effective_to),
    });
    setModalOpen(true);
  };

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload = buildPayload(values);
      if (editing?.id) {
        await getExpenseRuleModel().update({ id: editing.id, ...payload });
        message.success(t("expenseRules.ruleUpdated", "已更新报销规则"));
      } else {
        await getExpenseRuleModel().create(payload);
        message.success(t("expenseRules.ruleCreated", "已新增报销规则"));
      }
      setModalOpen(false);
      await load();
    } catch (error: any) {
      message.error(
        t("expenseRules.saveFailed", "保存失败：{reason}").replace(
          "{reason}",
          error?.message || String(error),
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<ExpenseRuleRecord> = [
    {
      title: t("expenseRules.table.priority", "优先级"),
      dataIndex: "priority",
      width: 90,
      sorter: (a, b) => Number(a.priority) - Number(b.priority),
    },
    {
      title: t("expenseRules.table.rule", "规则"),
      dataIndex: "rule_name",
      width: 240,
      render: (_: string, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.rule_name}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {record.rule_code}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: t("expenseRules.table.scope", "适用范围"),
      width: 180,
      render: (_: unknown, record) => (
        <Space wrap size={4}>
          <Tag>{optionLabel(expenseTypeOptions, record.expense_type)}</Tag>
          <Tag>{optionLabel(CATEGORY_OPTIONS, record.category)}</Tag>
        </Space>
      ),
    },
    {
      title: t("expenseRules.table.calculation", "计算方式"),
      width: 160,
      render: (_: unknown, record) => {
        const typeLabel = optionLabel(
          CALCULATION_TYPE_OPTIONS,
          record.calculation_type,
        );
        if (
          record.calculation_type === "ratio" ||
          record.calculation_type === "full"
        ) {
          const ratio = Number(record.reimburse_ratio ?? 0);
          return `${typeLabel} ${Math.round(ratio * 100)}%`;
        }
        if (record.calculation_type === "fixed_limit") {
          return `${typeLabel} ${record.limit_amount || "-"} ${t(
            "expenseRules.unit.yuan",
            "元",
          )}`;
        }
        return typeLabel;
      },
    },
    {
      title: t("expenseRules.table.condition", "适用条件"),
      dataIndex: "condition_text",
      ellipsis: true,
    },
    {
      title: t("expenseRules.table.effectivePeriod", "生效期"),
      width: 180,
      render: (_: unknown, record) =>
        `${formatExpenseRuleDate(
          record.effective_from,
          t("expenseRules.effective.openEnded", "不限"),
        )} ${t("expenseRules.to", "至")} ${formatExpenseRuleDate(
          record.effective_to,
          t("expenseRules.effective.longTerm", "长期"),
        )}`,
    },
    {
      title: t("expenseRules.table.status", "状态"),
      dataIndex: "status",
      width: 90,
      render: (status: string) =>
        status === "active" ? (
          <Tag color="green">{t("expenseRules.status.active", "生效中")}</Tag>
        ) : (
          <Tag>{t("expenseRules.status.inactive", "停用")}</Tag>
        ),
    },
    {
      title: t("expenseRules.table.actions", "操作"),
      width: 100,
      render: (_: unknown, record) => (
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={() => openEdit(record)}
        >
          {t("expenseRules.action.edit", "编辑")}
        </Button>
      ),
    },
  ];

  return (
    <Card
      title={t("expenseRules.pageTitle", "报销规则")}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>
            {t("expenseRules.refresh", "刷新")}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t("expenseRules.newRule", "新增规则")}
          </Button>
        </Space>
      }
    >
      <Space wrap style={{ marginBottom: 16 }}>
        <Typography.Text strong>
          {t("expenseRules.expenseTypeFilter", "报销类型")}
        </Typography.Text>
        <Select
          style={{ width: 220 }}
          value={selectedExpenseType}
          onChange={setSelectedExpenseType}
          loading={expenseTypeOptionsLoading}
          status={expenseTypeOptionsError ? "error" : undefined}
          options={expenseTypeOptions}
        />
        <Typography.Text type="secondary">
          {t(
            "expenseRules.agentHint",
            "Agent 和审批辅助会读取所有生效规则，不再从 Skill 中写死制度。",
          )}
        </Typography.Text>
      </Space>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={filteredList}
        loading={loading}
        pagination={false}
        scroll={{ x: 1180 }}
      />

      <Modal
        title={
          editing
            ? t("expenseRules.modal.edit", "编辑报销规则")
            : t("expenseRules.modal.new", "新增报销规则")
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={save}
        confirmLoading={saving}
        okText={t("expenseRules.modal.save", "保存")}
        cancelText={t("expenseRules.modal.cancel", "取消")}
        destroyOnHidden
        width={880}
      >
        <Form form={form} layout="vertical" requiredMark>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: 16,
            }}
          >
            <Form.Item
              label={t("expenseRules.field.ruleCode", "规则编码")}
              name="rule_code"
              rules={[
                {
                  required: true,
                  message: t(
                    "expenseRules.field.ruleCodeRequired",
                    "请输入规则编码",
                  ),
                },
              ]}
            >
              <Input
                placeholder={t(
                  "expenseRules.field.ruleCodePlaceholder",
                  "如：flight_premium_half",
                )}
                disabled={Boolean(editing)}
              />
            </Form.Item>
            <Form.Item
              label={t("expenseRules.field.ruleName", "规则名称")}
              name="rule_name"
              rules={[
                {
                  required: true,
                  message: t(
                    "expenseRules.field.ruleNameRequired",
                    "请输入规则名称",
                  ),
                },
              ]}
            >
              <Input
                placeholder={t(
                  "expenseRules.field.ruleNamePlaceholder",
                  "如：商务舱和头等舱机票按 50% 报销",
                )}
              />
            </Form.Item>
            <Form.Item
              label={t("expenseRules.field.expenseType", "报销类型")}
              name="expense_type"
            >
              <Select
                loading={expenseTypeOptionsLoading}
                status={expenseTypeOptionsError ? "error" : undefined}
                options={expenseTypeOptions}
              />
            </Form.Item>
            <Form.Item
              label={t("expenseRules.field.category", "明细类目")}
              name="category"
            >
              <Select options={CATEGORY_OPTIONS} />
            </Form.Item>
            <Form.Item
              label={t("expenseRules.field.calculation", "计算方式")}
              name="calculation_type"
              rules={[
                {
                  required: true,
                  message: t(
                    "expenseRules.field.calculationRequired",
                    "请选择计算方式",
                  ),
                },
              ]}
            >
              <Select options={CALCULATION_TYPE_OPTIONS} />
            </Form.Item>
            {(selectedCalculationType === "ratio" ||
              selectedCalculationType === "full") && (
              <Form.Item
                label={t("expenseRules.field.reimburseRatio", "报销比例")}
                name="reimburse_ratio"
                rules={[
                  {
                    required: true,
                    message: t(
                      "expenseRules.field.reimburseRatioRequired",
                      "请输入报销比例",
                    ),
                  },
                ]}
              >
                <InputNumber
                  min={0}
                  max={1}
                  step={0.1}
                  precision={4}
                  style={{ width: "100%" }}
                  addonAfter={t(
                    "expenseRules.field.reimburseRatioAddon",
                    "比例",
                  )}
                />
              </Form.Item>
            )}
            {selectedCalculationType === "fixed_limit" && (
              <Form.Item
                label={t("expenseRules.field.limitAmount", "封顶金额")}
                name="limit_amount"
                rules={[
                  {
                    required: true,
                    message: t(
                      "expenseRules.field.limitAmountRequired",
                      "请输入封顶金额",
                    ),
                  },
                ]}
              >
                <InputNumber
                  min={0}
                  precision={2}
                  style={{ width: "100%" }}
                  addonAfter={t(
                    "expenseRules.field.limitAmountAddon",
                    "元",
                  )}
                />
              </Form.Item>
            )}
            <Form.Item
              label={t("expenseRules.field.priority", "优先级")}
              name="priority"
            >
              <InputNumber min={1} precision={0} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              label={t("expenseRules.field.enabled", "启用")}
              name="enabled"
              valuePropName="checked"
            >
              <Switch
                checkedChildren={t(
                  "expenseRules.switch.active",
                  "生效",
                )}
                unCheckedChildren={t(
                  "expenseRules.switch.inactive",
                  "停用",
                )}
              />
            </Form.Item>
            <Form.Item
              label={t("expenseRules.field.effectiveFrom", "生效开始")}
              name="effective_from"
            >
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              label={t("expenseRules.field.effectiveTo", "生效结束")}
              name="effective_to"
            >
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </div>

          <Form.Item
            label={t("expenseRules.field.condition", "适用条件")}
            name="condition_text"
            rules={[
              {
                required: true,
                message: t(
                  "expenseRules.field.conditionRequired",
                  "请输入适用条件",
                ),
              },
            ]}
          >
            <Input.TextArea
              autoSize={{ minRows: 2, maxRows: 6 }}
              placeholder={t(
                "expenseRules.field.conditionPlaceholder",
                "写给 Agent 和审批人看的规则条件，例如：机票舱位为商务舱、头等舱或等价高等级舱位。",
              )}
            />
          </Form.Item>
          <Form.Item
            label={t("expenseRules.field.requirement", "材料要求")}
            name="requirement_text"
          >
            <Input.TextArea
              autoSize={{ minRows: 2, maxRows: 6 }}
              placeholder={t(
                "expenseRules.field.requirementPlaceholder",
                "例如：需提供电子普通发票、行程单；海外票据需在备注中说明对应关系。",
              )}
            />
          </Form.Item>
          <Form.Item
            label={t("expenseRules.field.remark", "备注")}
            name="remark"
          >
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default ExpenseRulesPage;
