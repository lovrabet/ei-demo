/**
 * title: 新建工资付款
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Select,
  Skeleton,
  Space,
  Typography,
  message,
} from "antd";
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { lovrabetClient } from "@/api/client";
import { $i18n } from "@/i18n";
import AgentFormGuide from "@/components/agent-form-guide";
import AttachmentUpload from "@/components/attachment-upload";
import FormFooter from "@/components/form-footer";
import FormLayout, { FormRow } from "@/components/form-layout";
import MoneyInput from "@/components/money-input";
import type { AttachmentFileValue } from "@/features/attachments/api";
import { collectCpoFormValues } from "@/features/cpo-workflow/form-submit";
import {
  CPO_FORM_CANCEL_PATH,
  getCpoDetailPath,
  isWorkflowReadonly,
} from "@/features/cpo-workflow/routes";
import {
  CURRENT_ACTOR_SCRIPT,
  prefillApplicantFields,
  type CurrentActor,
} from "@/features/current-actor/api";
import {
  listInternalLegalEntities,
  type InternalLegalEntityOption,
} from "@/features/internal-legal-entities/api";
import { parseSalaryPaymentDate } from "@/features/salary-payment/date";
import { createSalaryPaymentItemDefaults } from "@/features/salary-payment/form";

const t = (key: string, fallbackText: string) => $i18n.t(key, fallbackText);

const ATTACHMENTS_FIELD = "_attachments";

type SalaryPaymentItemFormValue = {
  id?: number;
  internal_legal_entity_id?: number;
  internal_legal_entity_name_snapshot?: string;
  payment_project?: string;
  employee_count?: number;
  amount?: number;
  currency?: string;
  payment_method?: "bank_card" | "bank_transfer" | "other";
  remark?: string;
};

type SalaryPaymentFormValues = {
  title: string;
  payroll_month: dayjs.Dayjs;
  expected_pay_date: dayjs.Dayjs;
  items: SalaryPaymentItemFormValue[];
  remark?: string;
  applicant_name_snapshot?: string;
  applicant_user_id?: string;
  _attachments?: AttachmentFileValue[];
  _comment?: string;
};

type SalaryPaymentDetail = {
  biz: Record<string, unknown>;
  attachments?: Array<Record<string, unknown>>;
  salaryItems?: SalaryPaymentItemFormValue[];
};

function normalizeDetailAttachments(
  attachments: Array<Record<string, unknown>>,
): AttachmentFileValue[] {
  return attachments
    .filter((file) => file.attachment_type === "payroll_sheet")
    .map((file) => ({
      id: Number(file.id),
      fileName: String(file.file_name || ""),
      filePath: String(file.file_path || ""),
      fileType: String(file.file_type || ""),
      sourceDir: String(file.source_dir || ""),
      uploadedBy: String(file.uploaded_by || ""),
    }))
    .filter((file) => file.id > 0 && file.fileName && file.filePath);
}

const SalaryPaymentForm: React.FC = () => {
  const [params] = useSearchParams();
  const editId = params.get("id");
  const mode = params.get("mode");
  const navigate = useNavigate();
  const [form] = Form.useForm<SalaryPaymentFormValues>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recordStatus, setRecordStatus] = useState<string>();
  const [entities, setEntities] = useState<InternalLegalEntityOption[]>([]);
  const isEdit = Boolean(editId);
  const readOnly = isWorkflowReadonly(recordStatus, mode);
  const watchedItems = Form.useWatch("items", form) || [];
  const totalAmount = useMemo(
    () =>
      watchedItems.reduce(
        (sum, item) => sum + (Number(item?.amount) || 0),
        0,
      ),
    [watchedItems],
  );
  const totalEmployees = useMemo(
    () =>
      watchedItems.reduce(
        (sum, item) => sum + (Number(item?.employee_count) || 0),
        0,
      ),
    [watchedItems],
  );

  useEffect(() => {
    let active = true;
    Promise.all([
      listInternalLegalEntities(),
      lovrabetClient.bff.execute<CurrentActor>({
        scriptName: CURRENT_ACTOR_SCRIPT,
        params: {},
      }),
    ])
      .then(async ([legalEntities, actor]) => {
        if (!active) return;
        setEntities(legalEntities);
        prefillApplicantFields(form, actor);

        if (!editId) {
          form.setFieldsValue({
            payroll_month: dayjs().startOf("month"),
            expected_pay_date: dayjs().endOf("month"),
            items: [createSalaryPaymentItemDefaults()],
          });
          return;
        }

        const detail = await lovrabetClient.bff.execute<SalaryPaymentDetail>({
          scriptName: "cpoGetBizTimeline",
          params: { bizType: "salary_payment", bizId: Number(editId) },
        });
        const record = detail.biz;
        if (!record?.id) throw new Error(t("salaryPaymentForm.error.notFound", "未找到该工资付款申请"));
        form.setFieldsValue({
          ...(record as unknown as SalaryPaymentFormValues),
          payroll_month: parseSalaryPaymentDate(
            record.payroll_month,
            dayjs().startOf("month"),
          ),
          expected_pay_date: parseSalaryPaymentDate(
            record.expected_pay_date,
            dayjs().endOf("month"),
          ),
          items: (detail.salaryItems || []).map((item) => ({
            ...item,
            id: Number(item.id),
            internal_legal_entity_id: Number(item.internal_legal_entity_id),
            amount: Number(item.amount),
            employee_count:
              item.employee_count === null ||
              item.employee_count === undefined
                ? undefined
                : Number(item.employee_count),
          })),
          [ATTACHMENTS_FIELD]: normalizeDetailAttachments(
            detail.attachments || [],
          ),
        } as SalaryPaymentFormValues);
        setRecordStatus(String(record.status || ""));
      })
      .catch((error: any) =>
        message.error(
          t("salaryPaymentForm.error.load", "加载失败：{reason}").replace(
            "{reason}",
            error?.message || String(error),
          ),
        ),
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [editId, form]);

  const handleEntityChange = (rowIndex: number, entityId?: number) => {
    const entity = entities.find((item) => Number(item.id) === entityId);
    form.setFieldValue(
      ["items", rowIndex, "internal_legal_entity_name_snapshot"],
      entity?.entityName || "",
    );
    if (!form.getFieldValue(["items", rowIndex, "payment_project"])) {
      form.setFieldValue(
        ["items", rowIndex, "payment_project"],
        entity
          ? t("salaryPaymentForm.defaultProject", "{name}工资").replace(
              "{name}",
              entity.shortName || entity.entityName,
            )
          : "",
      );
    }
  };

  const onSave = async (thenSubmit: boolean) => {
    if (readOnly) {
      message.warning(t("salaryPaymentForm.error.readonly", "当前单据不可编辑"));
      return;
    }
    let values: SalaryPaymentFormValues;
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
      const saved = await lovrabetClient.bff.execute<{
        bizId: number;
        attachments?: AttachmentFileValue[];
        salaryItems?: Array<{ id: number }>;
      }>({
        scriptName: "cpoSaveDraft",
        params: {
          bizType: "salary_payment",
          bizId: isEdit ? Number(editId) : undefined,
          values: {
            title: values.title?.trim() || "",
            payroll_month: values.payroll_month
              ? dayjs(values.payroll_month).startOf("month").format("YYYY-MM-DD")
              : null,
            expected_pay_date: values.expected_pay_date
              ? dayjs(values.expected_pay_date).format("YYYY-MM-DD")
              : null,
            remark: values.remark?.trim() || "",
          },
          items: (values.items || []).map((item) => ({
            ...item,
            payment_project: item.payment_project?.trim() || "",
            currency: item.currency || "CNY",
            payment_method: item.payment_method || "bank_transfer",
            remark: item.remark?.trim() || "",
          })),
          attachments: values[ATTACHMENTS_FIELD] || [],
          submit: thenSubmit,
        },
      });
      const id = saved.bizId;
      if (saved.attachments) {
        form.setFieldValue(ATTACHMENTS_FIELD, saved.attachments);
      }

      if (thenSubmit) {
        message.success(t("salaryPaymentForm.success.submitted", "已提交，进入工资付款审批"));
        navigate(getCpoDetailPath("salary_payment", id));
        return;
      }

      message.success(
        isEdit
          ? t("salaryPaymentForm.success.draftUpdated", "草稿已更新")
          : t("salaryPaymentForm.success.draftCreated", "草稿已创建"),
      );
      navigate(CPO_FORM_CANCEL_PATH);
    } catch (error: any) {
      const reason = String(error?.message || error);
      message.error(
        reason.includes("payroll_sheet")
          ? t("salaryPaymentForm.error.uploadRequired", "请先上传工资发放表")
          : t("salaryPaymentForm.error.saveFailed", "保存失败：{reason}").replace("{reason}", reason),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton active paragraph={{ rows: 12 }} />;

  return (
    <Card
      style={{ maxWidth: 1080, margin: "0 auto" }}
      title={
        <Space>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(-1)}
          />
          {readOnly
            ? t("salaryPaymentForm.title.view", "查看工资付款")
            : isEdit
              ? t("salaryPaymentForm.title.edit", "编辑工资付款")
              : t("salaryPaymentForm.title.create", "工资付款申请")}
        </Space>
      }
    >
      {readOnly ? null : (
        <AgentFormGuide
          skillCode="cpo-salary-payment-from-excel"
          skillName={t("salaryPaymentForm.agent.skillName", "工资付款 Excel 自动录入")}
          prompt={t(
            "salaryPaymentForm.agent.prompt",
            "请根据我上传的工资 Excel 核对并创建工资付款申请",
          )}
          description={t(
            "salaryPaymentForm.agent.description",
            "上传工资 Excel 后，Agent 可校验月份和合计、按主体拆分并完成工资付款申请。",
          )}
        />
      )}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 20 }}
        message={t("salaryPaymentForm.alert.title", "按合规审批主体分别创建工资付款申请")}
        description={t("salaryPaymentForm.alert.description", "同一审批主体下可追加多个付款项目；不同审批主体必须分别创建申请单。")}
      />
      <Form
        form={form}
        layout="vertical"
        disabled={saving || readOnly}
        requiredMark
      >
        <FormLayout>
          <Form.Item
            label={t("salaryPaymentForm.field.title", "付款事由")}
            name="title"
            rules={[
              {
                required: true,
                message: t(
                  "salaryPaymentForm.field.titleRequired",
                  "请输入付款事由",
                ),
              },
            ]}
          >
            <Input
              placeholder={t(
                "salaryPaymentForm.field.titlePlaceholder",
                "如：2026年7月启智云图及上海分公司工资付款",
              )}
              maxLength={255}
              showCount
            />
          </Form.Item>

          <FormRow columns={2}>
            <Form.Item
              label={t("salaryPaymentForm.field.payrollMonth", "工资月份")}
              name="payroll_month"
              rules={[
                {
                  required: true,
                  message: t(
                    "salaryPaymentForm.field.payrollMonthRequired",
                    "请选择工资月份",
                  ),
                },
              ]}
            >
              <DatePicker picker="month" style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              label={t("salaryPaymentForm.field.payDate", "付款日期")}
              name="expected_pay_date"
              rules={[
                {
                  required: true,
                  message: t(
                    "salaryPaymentForm.field.payDateRequired",
                    "请选择付款日期",
                  ),
                },
              ]}
            >
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </FormRow>

          <Divider orientation="left">
            {t("salaryPaymentForm.divider.items", "付款明细")}
          </Divider>
          <Form.List
            name="items"
            rules={[
              {
                validator: async (_, items: SalaryPaymentItemFormValue[]) => {
                  if (!items?.length) {
                    throw new Error(
                      t(
                        "salaryPaymentForm.error.itemsRequired",
                        "至少需要一条付款明细",
                      ),
                    );
                  }
                  const entityIds = items
                    .map((item) => Number(item?.internal_legal_entity_id))
                    .filter(Boolean);
                  if (new Set(entityIds).size !== entityIds.length) {
                    throw new Error(
                      t(
                        "salaryPaymentForm.error.entityDuplicate",
                        "同一付款公司不能重复添加",
                      ),
                    );
                  }
                },
              },
            ]}
          >
            {(fields, { add, remove }, { errors }) => (
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                {fields.map(({ key, name, ...restField }, index) => (
                  <Card
                    key={key}
                    size="small"
                    title={t(
                      "salaryPaymentForm.item.title",
                      "付款项目 {index}",
                    ).replace("{index}", String(index + 1))}
                    extra={
                      readOnly ? null : (
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          disabled={fields.length <= 1}
                          onClick={() => remove(name)}
                        >
                          {t("salaryPaymentForm.action.delete", "删除")}
                        </Button>
                      )
                    }
                  >
                    <Form.Item {...restField} name={[name, "id"]} hidden>
                      <Input />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[
                        name,
                        "internal_legal_entity_name_snapshot",
                      ]}
                      hidden
                    >
                      <Input />
                    </Form.Item>
                    <FormRow columns={2}>
                      <Form.Item
                        {...restField}
                        label={t(
                          "salaryPaymentForm.field.entity",
                          "付款公司",
                        )}
                        name={[name, "internal_legal_entity_id"]}
                        rules={[
                          {
                            required: true,
                            message: t(
                              "salaryPaymentForm.field.entityRequired",
                              "请选择付款公司",
                            ),
                          },
                        ]}
                      >
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder={t(
                            "salaryPaymentForm.field.entityPlaceholder",
                            "选择我方付款主体",
                          )}
                          onChange={(value) =>
                            handleEntityChange(name, Number(value))
                          }
                          options={entities.map((entity) => ({
                            value: Number(entity.id),
                            label: entity.entityName,
                          }))}
                        />
                      </Form.Item>
                      <Form.Item
                        {...restField}
                        label={t(
                          "salaryPaymentForm.field.project",
                          "支付项目",
                        )}
                        name={[name, "payment_project"]}
                        rules={[
                          {
                            required: true,
                            message: t(
                              "salaryPaymentForm.field.projectRequired",
                              "请输入支付项目",
                            ),
                          },
                        ]}
                      >
                        <Input
                          placeholder={t(
                            "salaryPaymentForm.field.projectPlaceholder",
                            "如：启智云图7月工资",
                          )}
                          maxLength={255}
                        />
                      </Form.Item>
                    </FormRow>
                    <FormRow template="minmax(220px, 1fr) 140px 180px">
                      <Form.Item
                        {...restField}
                        label={t(
                          "salaryPaymentForm.field.amount",
                          "付款金额",
                        )}
                        name={[name, "amount"]}
                        rules={[
                          {
                            required: true,
                            message: t(
                              "salaryPaymentForm.field.amountRequired",
                              "请输入付款金额",
                            ),
                          },
                          {
                            validator: (_, value) =>
                              Number(value) > 0
                                ? Promise.resolve()
                                : Promise.reject(
                                    new Error(
                                      t(
                                        "salaryPaymentForm.field.amountMin",
                                        "付款金额必须大于 0",
                                      ),
                                    ),
                                  ),
                          },
                        ]}
                      >
                        <MoneyInput min={0.01} />
                      </Form.Item>
                      <Form.Item
                        {...restField}
                        label={t("salaryPaymentForm.field.currency", "币种")}
                        name={[name, "currency"]}
                        initialValue="CNY"
                      >
                        <Select
                          options={[
                            {
                              value: "CNY",
                              label: t(
                                "salaryPaymentForm.currency.cny",
                                "人民币 CNY",
                              ),
                            },
                          ]}
                        />
                      </Form.Item>
                      <Form.Item
                        {...restField}
                        label={t("salaryPaymentForm.field.method", "付款方式")}
                        name={[name, "payment_method"]}
                        initialValue="bank_transfer"
                        rules={[
                          {
                            required: true,
                            message: t(
                              "salaryPaymentForm.field.methodRequired",
                              "请选择付款方式",
                            ),
                          },
                        ]}
                      >
                        <Select
                          options={[
                            {
                              value: "bank_card",
                              label: t(
                                "salaryPaymentForm.method.bankCard",
                                "银行卡",
                              ),
                            },
                            {
                              value: "bank_transfer",
                              label: t(
                                "salaryPaymentForm.method.bankTransfer",
                                "银行转账",
                              ),
                            },
                            {
                              value: "other",
                              label: t(
                                "salaryPaymentForm.method.other",
                                "其他",
                              ),
                            },
                          ]}
                        />
                      </Form.Item>
                    </FormRow>
                    <FormRow columns={2}>
                      <Form.Item
                        {...restField}
                        label={t(
                          "salaryPaymentForm.field.employeeCount",
                          "发薪人数",
                        )}
                        name={[name, "employee_count"]}
                      >
                        <InputNumber
                          min={1}
                          precision={0}
                          style={{ width: "100%" }}
                          placeholder={t(
                            "salaryPaymentForm.field.optional",
                            "可选",
                          )}
                        />
                      </Form.Item>
                      <Form.Item
                        {...restField}
                        label={t(
                          "salaryPaymentForm.field.itemRemark",
                          "明细备注",
                        )}
                        name={[name, "remark"]}
                      >
                        <Input
                          maxLength={1000}
                          placeholder={t(
                            "salaryPaymentForm.field.optional",
                            "可选",
                          )}
                        />
                      </Form.Item>
                    </FormRow>
                  </Card>
                ))}
                <Form.ErrorList errors={errors} />
                {readOnly ? null : (
                  <Button
                    block
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() =>
                      add({
                        currency: "CNY",
                        payment_method: "bank_transfer",
                      })
                    }
                  >
                    {t(
                      "salaryPaymentForm.action.addItem",
                      "新增付款项目",
                    )}
                  </Button>
                )}
              </Space>
            )}
          </Form.List>

          <Alert
            type="success"
            showIcon={false}
            message={
              <Space size={24} wrap>
                <Typography.Text strong>
                  {t(
                    "salaryPaymentForm.summary.totalAmount",
                    "合计金额：¥ {amount}",
                  ).replace("{amount}", totalAmount.toFixed(2))}
                </Typography.Text>
                <Typography.Text>
                  {t(
                    "salaryPaymentForm.summary.totalEmployees",
                    "合计人数：{count}",
                  ).replace("{count}", String(totalEmployees))}
                </Typography.Text>
                <Typography.Text>
                  {t(
                    "salaryPaymentForm.summary.itemCount",
                    "付款项目：{count}",
                  ).replace("{count}", String(watchedItems.length))}
                </Typography.Text>
              </Space>
            }
          />

          <Form.Item
            label={t("salaryPaymentForm.field.sheet", "工资发放表（必传）")}
            name={ATTACHMENTS_FIELD}
            rules={[
              {
                validator: (_, value) =>
                  Array.isArray(value) && value.length > 0
                    ? Promise.resolve()
                    : Promise.reject(
                        new Error(
                          t(
                            "salaryPaymentForm.error.sheetRequired",
                            "请上传工资发放表",
                          ),
                        ),
                      ),
              },
            ]}
          >
            <AttachmentUpload
              disabled={readOnly}
              maxCount={20}
              accept=".xls,.xlsx,.csv,.pdf"
            />
          </Form.Item>

          <Form.Item label={t("salaryPaymentForm.field.remark", "备注说明")} name="remark">
            <Input.TextArea
              rows={3}
              placeholder={t(
                "salaryPaymentForm.field.remarkPlaceholder",
                "填写工资发放背景、特殊安排或其他补充说明",
              )}
              maxLength={2000}
              showCount
            />
          </Form.Item>

          <Form.Item
            label={t("salaryPaymentForm.field.applicant", "申请人")}
            name="applicant_name_snapshot"
          >
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

SalaryPaymentForm.displayName = "SalaryPaymentForm";

export default SalaryPaymentForm;
