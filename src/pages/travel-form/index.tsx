/**
 * title: 新建差旅出行
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
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
import AttachmentUpload from "@/components/attachment-upload";
import FormFooter from "@/components/form-footer";
import FormLayout, { FormRow } from "@/components/form-layout";
import MoneyInput from "@/components/money-input";
import PartySelector from "@/components/party-selector";
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
import {
  employeeToSelectOption,
  findEmployeeByValue,
  listEmployeeOptions,
  type EmployeeOption,
} from "@/features/employees/api";

const TRAVEL_CODE = "28494f18f334400c893576b6e168d3f6";
const ATTACHMENTS_FIELD = "_attachments";
const COMPANIONS_FIELD = "_companion_user_ids";

type TravelCompanionSnapshot = {
  userId: string;
  name: string;
  workNo?: string;
  email?: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeCompanionSnapshot(
  value: unknown,
): TravelCompanionSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const userId = normalizeText(
    record.userId ?? record.user_id ?? record.lovrabet_member_id ?? record.id,
  );
  if (!userId) return null;

  const name =
    normalizeText(
      record.name ??
        record.snapshotName ??
        record.fullName ??
        record.full_name ??
        record.username ??
        record.nickname,
    ) || userId;

  const workNo = normalizeText(record.workNo ?? record.work_no);
  const email = normalizeText(
    record.email ?? record.yuntooEmail ?? record.yuntoo_email,
  );

  return {
    userId,
    name,
    ...(workNo ? { workNo } : {}),
    ...(email ? { email } : {}),
  };
}

function parseTravelCompanions(value: unknown): TravelCompanionSnapshot[] {
  if (!value) return [];
  let raw = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  return raw
    .map(normalizeCompanionSnapshot)
    .filter((companion): companion is TravelCompanionSnapshot => {
      if (!companion || seen.has(companion.userId)) return false;
      seen.add(companion.userId);
      return true;
    });
}

function employeeToCompanion(employee: EmployeeOption): TravelCompanionSnapshot {
  const email = employee.yuntooEmail || employee.email;
  return {
    userId: employee.userId,
    name: employee.snapshotName || employee.username || employee.userId,
    ...(employee.workNo ? { workNo: employee.workNo } : {}),
    ...(email ? { email } : {}),
  };
}

function buildTravelCompanionSnapshots(
  userIds: unknown,
  employees: EmployeeOption[],
  savedCompanions: TravelCompanionSnapshot[],
) {
  if (!Array.isArray(userIds)) return [];

  const savedMap = new Map(savedCompanions.map((item) => [item.userId, item]));
  return userIds
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .map((userId) => {
      const employee = findEmployeeByValue(employees, userId);
      if (employee) return employeeToCompanion(employee);
      return savedMap.get(userId) || { userId, name: userId };
    });
}

function serializeTravelCompanions(
  userIds: unknown,
  employees: EmployeeOption[],
  savedCompanions: TravelCompanionSnapshot[],
) {
  const snapshots = buildTravelCompanionSnapshots(
    userIds,
    employees,
    savedCompanions,
  );
  return JSON.stringify(snapshots, ["userId", "name", "workNo", "email"]);
}

const TravelForm: React.FC = () => {
  const [params] = useSearchParams();
  const editId = params.get("id");
  const mode = params.get("mode");
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordStatus, setRecordStatus] = useState<string>();
  const [employeeKeyword, setEmployeeKeyword] = useState("");
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [savedCompanions, setSavedCompanions] = useState<
    TravelCompanionSnapshot[]
  >([]);
  const isEdit = !!editId;
  const readOnly = isWorkflowReadonly(recordStatus, mode);
  const companionSelectOptions = useMemo(() => {
    const options = employees.map(employeeToSelectOption);
    for (const companion of savedCompanions) {
      if (options.some((option) => option.value === companion.userId)) continue;
      options.unshift({
        value: companion.userId,
        label: companion.name,
        secondary: "已保存的历史同行人",
        employee: {
          userId: companion.userId,
          username: companion.name,
          snapshotName: companion.name,
          workNo: companion.workNo,
          email: companion.email,
        },
      });
    }
    return options;
  }, [employees, savedCompanions]);

  useEffect(() => {
    if (!editId) return;
    setLoading(true);
    lovrabetClient.models[`dataset_${TRAVEL_CODE}`]
      .getOne({ id: Number(editId) })
      .then(async (rec: any) => {
        if (!rec?.id) {
          message.error("未找到该差旅出行申请");
          return;
        }
        const companions = parseTravelCompanions(rec.companions_json);
        setSavedCompanions(companions);
        form.setFieldsValue({
          ...rec,
          start_date: rec.start_date ? dayjs(rec.start_date) : null,
          end_date: rec.end_date ? dayjs(rec.end_date) : null,
          [COMPANIONS_FIELD]: companions.map((companion) => companion.userId),
          [ATTACHMENTS_FIELD]: await listAttachmentValues({
            bizType: "travel",
            bizId: Number(rec.id),
            attachmentType: "approval_material",
          }),
        });
        setRecordStatus(rec.status);
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
            if (!cancelled) setEmployees(options);
          })
          .catch((error) => {
            console.error(error);
            if (!cancelled) setEmployees([]);
          })
          .finally(() => {
            if (!cancelled) setEmployeeLoading(false);
          });
      },
      employeeKeyword ? 240 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [employeeKeyword]);

  useEffect(() => {
    if (editId) return;
    lovrabetClient.bff
      .execute<CurrentActor>({
        scriptName: CURRENT_ACTOR_SCRIPT,
        params: {},
      })
      .then((actor) => prefillApplicantFields(form, actor))
      .catch(() => undefined);
  }, [editId, form]);

  const applyCompanions = (userIds?: string[]) => {
    setSavedCompanions(
      buildTravelCompanionSnapshots(userIds || [], employees, savedCompanions),
    );
  };

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

    if (
      values.start_date &&
      values.end_date &&
      values.end_date.isBefore(values.start_date, "day")
    ) {
      message.error("结束日期不能早于开始日期");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        title: values.title ?? "",
        travel_type: values.travel_type || "business",
        trip_region: values.trip_region || "domestic",
        origin_city: values.origin_city ?? "",
        destination_city: values.destination_city ?? "",
        start_date: values.start_date
          ? dayjs(values.start_date).format("YYYY-MM-DD")
          : null,
        end_date: values.end_date
          ? dayjs(values.end_date).format("YYYY-MM-DD")
          : null,
        estimated_amount: values.estimated_amount ?? 0,
        currency: values.currency || "CNY",
        hotel_needed: values.hotel_needed ?? 0,
        travel_reason: values.travel_reason ?? "",
        transport_type: values.transport_type ?? null,
        partner_id: values.partner_id ?? null,
        project_name: values.project_name ?? "",
        companions_json: serializeTravelCompanions(
          values[COMPANIONS_FIELD],
          employees,
          savedCompanions,
        ),
        remark: values.remark ?? "",
      };

      const saved = await lovrabetClient.bff.execute<{ bizId: number }>({
        scriptName: "cpoSaveDraft",
        params: {
          bizType: "travel",
          bizId: isEdit ? Number(editId) : undefined,
          values: payload,
          submit: thenSubmit,
        },
      });
      const id = saved.bizId;

      const attachments = await syncAttachmentRecords({
        bizType: "travel",
        bizId: id,
        attachmentType: "approval_material",
        files: values[ATTACHMENTS_FIELD],
        uploadedBy: values.applicant_name_snapshot,
      });
      form.setFieldValue(ATTACHMENTS_FIELD, attachments);

      if (thenSubmit) {
        message.success("已提交审核");
        navigate("/my-submitted");
      } else {
        message.success(isEdit ? "已更新" : "草稿已保存");
        if (!isEdit) navigate(`/travel-form?id=${id}`);
      }
    } catch (e: any) {
      message.error(`${thenSubmit ? "提交" : "保存"}失败：${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton active paragraph={{ rows: 10 }} />;

  return (
    <Card
      style={{ maxWidth: 800, margin: "0 auto" }}
      title={
        <Space>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(-1)}
          />
          {readOnly ? "查看差旅出行" : isEdit ? "编辑差旅出行" : "新建差旅出行"}
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        disabled={saving || readOnly}
        requiredMark
        initialValues={{
          travel_type: "business",
          trip_region: "domestic",
          estimated_amount: 0,
          currency: "CNY",
          hotel_needed: 0,
          [COMPANIONS_FIELD]: [],
        }}
      >
        <FormLayout>
          <Form.Item
            label="出行标题"
            name="title"
            rules={[{ required: true, message: "请输入出行标题" }]}
          >
            <Input
              placeholder="如：北京客户拜访"
              maxLength={120}
              showCount
            />
          </Form.Item>

          <PartySelector
            form={form}
            bizType="travel"
            typeName="travel_type"
            typeLabel="出行类型"
            partnerName="partner_id"
            partnerLabel="关联客户 / 供应商"
            typeRequired
            partnerRequired={false}
            isSalesType={(value) => value === "customer_visit"}
          >
            <Select
              options={[
                { value: "business", label: "商务出行" },
                { value: "customer_visit", label: "客户拜访" },
                { value: "training", label: "培训学习" },
                { value: "conference", label: "会议会展" },
                { value: "other", label: "其他" },
              ]}
            />
          </PartySelector>

          <FormRow template="160px minmax(260px, 1fr)">
            <Form.Item
              label="出行区域"
              name="trip_region"
              rules={[{ required: true, message: "请选择出行区域" }]}
            >
              <Select
                options={[
                  { value: "domestic", label: "境内" },
                  { value: "overseas", label: "境外" },
                ]}
              />
            </Form.Item>
            <Form.Item label="交通方式" name="transport_type">
              <Select
                allowClear
                options={[
                  { value: "flight", label: "飞机" },
                  { value: "train", label: "高铁 / 火车" },
                  { value: "car", label: "汽车" },
                  { value: "other", label: "其他" },
                ]}
              />
            </Form.Item>
          </FormRow>

          <FormRow template="repeat(2, minmax(260px, 1fr))">
            <Form.Item label="出发城市" name="origin_city">
              <Input placeholder="如：杭州" maxLength={128} />
            </Form.Item>
            <Form.Item
              label="目的城市"
              name="destination_city"
              rules={[{ required: true, message: "请输入目的城市" }]}
            >
              <Input placeholder="如：北京" maxLength={128} />
            </Form.Item>
            <Form.Item
              label="开始日期"
              name="start_date"
              rules={[{ required: true, message: "请选择开始日期" }]}
            >
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              label="结束日期"
              name="end_date"
              rules={[{ required: true, message: "请选择结束日期" }]}
            >
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </FormRow>

          <FormRow template="minmax(260px, 1fr) 160px">
            <Form.Item
              label="预计费用"
              name="estimated_amount"
              rules={[{ required: true, message: "请输入预计费用" }]}
            >
              <MoneyInput min={0} minWidth={260} />
            </Form.Item>
            <Form.Item
              label="是否住宿"
              name="hotel_needed"
              rules={[{ required: true, message: "请选择" }]}
            >
              <Select
                options={[
                  { value: 0, label: "否" },
                  { value: 1, label: "是" },
                ]}
              />
            </Form.Item>
          </FormRow>

          <Form.Item label="项目名称" name="project_name">
            <Input placeholder="可选" maxLength={128} />
          </Form.Item>

          <Form.Item label="同行人" name={COMPANIONS_FIELD}>
            <Select
              mode="multiple"
              allowClear
              showSearch
              filterOption={false}
              loading={employeeLoading}
              placeholder="搜索我方员工姓名、花名、工号、手机或邮箱"
              options={companionSelectOptions.map((option) => ({
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
              onChange={applyCompanions}
            />
          </Form.Item>

          <Form.Item label="出行事由" name="travel_reason">
            <Input.TextArea rows={3} placeholder="说明出行背景和目标" />
          </Form.Item>

          <Form.Item label="出行材料" name={ATTACHMENTS_FIELD}>
            <AttachmentUpload
              disabled={readOnly}
              maxCount={20}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
            />
          </Form.Item>

          <Form.Item label="备注说明" name="remark">
            <Input.TextArea
              rows={3}
              placeholder="填写特殊安排、风险提示或其他补充说明"
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

export default TravelForm;
