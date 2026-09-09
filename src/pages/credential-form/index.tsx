/**
 * title: 新建资质
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Card,
  Form,
  Input,
  Select,
  DatePicker,
  Button,
  Space,
  message,
  Skeleton,
} from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { lovrabetClient } from "@/api/client";
import FormFooter from "@/components/form-footer";
import FormLayout, { FormRow } from "@/components/form-layout";
import {
  FALLBACK_INTERNAL_LEGAL_ENTITY,
  internalLegalEntityToNameSelectOption,
  listInternalLegalEntities,
  selectDefaultInternalLegalEntity,
  type InternalLegalEntityOption,
} from "@/features/internal-legal-entities/api";
import { $i18n } from "@/i18n";

const t = (key: string, fallbackText: string) => $i18n.t(key, fallbackText);

const CREDENTIAL_CODE = "b4a72c4ca0984102aba03a393063ba65";

const CredentialForm: React.FC = () => {
  const [params] = useSearchParams();
  const editId = params.get("id");
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [internalEntities, setInternalEntities] = useState<
    InternalLegalEntityOption[]
  >([FALLBACK_INTERNAL_LEGAL_ENTITY]);
  const [internalEntityLoading, setInternalEntityLoading] = useState(false);
  const isEdit = !!editId;
  const defaultInternalEntity = useMemo(
    () => selectDefaultInternalLegalEntity(internalEntities),
    [internalEntities],
  );
  const internalEntityOptions = useMemo(
    () => internalEntities.map(internalLegalEntityToNameSelectOption),
    [internalEntities],
  );

  useEffect(() => {
    if (!editId) return;
    setLoading(true);
    lovrabetClient.models[`dataset_${CREDENTIAL_CODE}`]
      .getOne({ id: Number(editId) })
      .then((rec: any) => {
        if (rec?.id) {
          form.setFieldsValue({
            ...rec,
            issued_at: rec.issued_at ? dayjs(rec.issued_at) : null,
            expires_at: rec.expires_at ? dayjs(rec.expires_at) : null,
          });
        } else message.error(t("credentialForm.error.notFound", "未找到该资质"));
      })
      .catch((e: any) =>
        message.error(
          t("credentialForm.error.load", "加载失败：{reason}").replace(
            "{reason}",
            e?.message || String(e),
          ),
        ),
      )
      .finally(() => setLoading(false));
  }, [editId, form]);

  useEffect(() => {
    let cancelled = false;
    if (!isEdit && !form.getFieldValue("holder_entity_name")) {
      form.setFieldValue(
        "holder_entity_name",
        defaultInternalEntity.entityName,
      );
    }
    setInternalEntityLoading(true);
    listInternalLegalEntities()
      .then((entities) => {
        if (cancelled) {
          return;
        }
        setInternalEntities(entities);
        const nextDefault = selectDefaultInternalLegalEntity(entities);
        if (!isEdit && !form.getFieldValue("holder_entity_name")) {
          form.setFieldValue("holder_entity_name", nextDefault.entityName);
        }
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) {
          setInternalEntities([FALLBACK_INTERNAL_LEGAL_ENTITY]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setInternalEntityLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [defaultInternalEntity.entityName, form, isEdit]);

  const onSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const model = lovrabetClient.models[`dataset_${CREDENTIAL_CODE}`];
      const payload: any = {
        credential_name: values.credential_name,
        credential_type: values.credential_type,
        holder_entity_name: values.holder_entity_name,
        status: values.status || "active",
      };
      ["issuer", "credential_no"].forEach((k) => {
        if (values[k]) payload[k] = values[k];
      });
      if (values.issued_at)
        payload.issued_at = dayjs(values.issued_at).format("YYYY-MM-DD");
      if (values.expires_at)
        payload.expires_at = dayjs(values.expires_at).format("YYYY-MM-DD");
      if (values.remark) payload.remark = values.remark;

      if (isEdit) {
        await model.update({ id: Number(editId), ...payload });
        message.success(t("credentialForm.success.updated", "已更新"));
      } else {
        const id = await model.create(payload);
        message.success(
          t("credentialForm.success.created", "已创建（id={id}）").replace(
            "{id}",
            String(id),
          ),
        );
      }
      navigate("/e3d2d89fe2d44a31828ead3cb50d01a9");
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(
        t("credentialForm.error.save", "保存失败：{reason}").replace(
          "{reason}",
          e?.message || String(e),
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton active paragraph={{ rows: 6 }} />;

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
          {isEdit
            ? t("credentialForm.title.edit", "编辑资质")
            : t("credentialForm.title.create", "新建资质")}
        </Space>
      }
    >
      <Form form={form} layout="vertical" disabled={saving} requiredMark>
        <FormLayout>
          <Form.Item
            label={t("credentialForm.field.name", "证照/资质名称")}
            name="credential_name"
            rules={[
              {
                required: true,
                message: t("credentialForm.field.nameRequired", "请输入名称"),
              },
            ]}
          >
            <Input
              placeholder={t(
                "credentialForm.field.namePlaceholder",
                "如：营业执照 / 增值税一般纳税人认证",
              )}
            />
          </Form.Item>

          <FormRow template="minmax(0, 1fr) 140px">
            <Form.Item
              label={t("credentialForm.field.type", "类型")}
              name="credential_type"
              rules={[{ required: true }]}
              initialValue="business_license"
            >
              <Select
                options={[
                  {
                    value: "business_license",
                    label: t("credentialForm.type.businessLicense", "营业执照"),
                  },
                  {
                    value: "qualification",
                    label: t("credentialForm.type.qualification", "行业资质"),
                  },
                  {
                    value: "certification",
                    label: t("credentialForm.type.certification", "认证证书"),
                  },
                  {
                    value: "seal",
                    label: t("credentialForm.type.seal", "印章备案"),
                  },
                  {
                    value: "other",
                    label: t("credentialForm.type.other", "其他"),
                  },
                ]}
              />
            </Form.Item>
            <Form.Item
              label={t("credentialForm.field.status", "状态")}
              name="status"
              initialValue="active"
            >
              <Select
                options={[
                  {
                    value: "active",
                    label: t("credentialForm.status.active", "有效"),
                  },
                  {
                    value: "expiring",
                    label: t("credentialForm.status.expiring", "即将到期"),
                  },
                  {
                    value: "expired",
                    label: t("credentialForm.status.expired", "已过期"),
                  },
                  {
                    value: "archived",
                    label: t("credentialForm.status.archived", "已归档"),
                  },
                ]}
              />
            </Form.Item>
          </FormRow>

          <Form.Item
            label={t("credentialForm.field.holder", "持有主体")}
            name="holder_entity_name"
            rules={[
              {
                required: true,
                message: t("credentialForm.field.holderRequired", "请选择持有主体"),
              },
            ]}
          >
            <Select
              showSearch
              loading={internalEntityLoading}
              optionFilterProp="label"
              options={internalEntityOptions}
            />
          </Form.Item>

          <FormRow columns={2}>
            <Form.Item
              label={t("credentialForm.field.issuer", "签发机构")}
              name="issuer"
            >
              <Input />
            </Form.Item>
            <Form.Item
              label={t("credentialForm.field.no", "编号")}
              name="credential_no"
            >
              <Input />
            </Form.Item>
          </FormRow>

          <FormRow columns={2}>
            <Form.Item
              label={t("credentialForm.field.issuedAt", "签发日期")}
              name="issued_at"
            >
              <DatePicker />
            </Form.Item>
            <Form.Item
              label={t("credentialForm.field.expiresAt", "到期日期")}
              name="expires_at"
            >
              <DatePicker />
            </Form.Item>
          </FormRow>

          <Form.Item
            label={t("credentialForm.field.remark", "备注")}
            name="remark"
          >
            <Input.TextArea rows={3} />
          </Form.Item>
        </FormLayout>
      </Form>

      <FormFooter
        mode="single"
        onCancel={() => navigate(-1)}
        onSaveDraft={onSave}
        saving={saving}
        hint={t("credentialForm.footer.hint", "保存后立即生效。")}
      />
    </Card>
  );
};

export default CredentialForm;
