/**
 * title: 录入供应商 / 服务商
 */
import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Card,
  Form,
  Input,
  Select,
  Button,
  Space,
  message,
  Skeleton,
} from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { lovrabetClient } from "@/api/client";
import FormFooter from "@/components/form-footer";
import FormLayout, { FormRow } from "@/components/form-layout";

const PARTNER_CODE = "68c70907e27c481cbefb96dd3906936e";

type FormValues = {
  name: string;
  partner_type: "supplier" | "service_provider" | "individual";
  status?: "active" | "disabled";
  unified_credit_code?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  bank_name?: string;
  bank_account?: string;
  supplier_category?: string;
  payment_purpose?: string;
  external_source?: string;
  external_record_id?: string;
  remark?: string;
};

const SUPPLIER_CATEGORY_OPTIONS = [
  "杭州启智云图供应商",
  "杭州云兔供应商",
  "杭州梦码兔供应商",
  "杭州梦码象供应商",
  "启智云图上海分公司供应商",
  "杭州启智云图客户",
].map((value) => ({ value, label: value }));

const PartnerForm: React.FC = () => {
  const [params] = useSearchParams();
  const editId = params.get("id");
  const prefilledName = params.get("name") ?? "";
  const openerToken = params.get("openerToken");
  const navigate = useNavigate();
  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const isEdit = !!editId;

  useEffect(() => {
    if (prefilledName && !editId) {
      form.setFieldValue("name", prefilledName);
    }
  }, [prefilledName, editId, form]);

  useEffect(() => {
    if (!editId) return;
    setLoading(true);
    lovrabetClient.models[`dataset_${PARTNER_CODE}`]
      .getOne({ id: Number(editId) })
      .then((rec: any) => {
        if (rec?.id) form.setFieldsValue(rec);
        else message.error("未找到该商业伙伴");
      })
      .catch((e: any) => message.error(`加载失败：${e?.message || e}`))
      .finally(() => setLoading(false));
  }, [editId, form]);

  const onSave = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      const model = lovrabetClient.models[`dataset_${PARTNER_CODE}`];
      const payload: any = {
        name: values.name,
        partner_type: values.partner_type,
        status: values.status || "active",
      };
      [
        "unified_credit_code",
        "contact_name",
        "contact_phone",
        "contact_email",
        "address",
        "bank_name",
        "bank_account",
        "supplier_category",
        "payment_purpose",
        "external_source",
        "external_record_id",
        "remark",
      ].forEach((k) => {
        const v = (values as any)[k];
        if (v !== undefined && v !== null && v !== "") payload[k] = v;
      });
      if (isEdit) {
        await model.update({ id: Number(editId), ...payload });
        message.success("已更新");
      } else {
        const created = await model.create(payload);
        if (openerToken && window.opener) {
          window.opener.postMessage(
            {
              type: "cpo:partner-created",
              token: openerToken,
              partner: created,
            },
            window.location.origin,
          );
          window.close();
        } else {
          message.success("已录入");
          navigate("/partner-form");
        }
      }
    } catch (e: any) {
      message.error(`保存失败：${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }

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
          {isEdit ? "编辑商业伙伴" : "录入商业伙伴"}
        </Space>
      }
    >
      <Form form={form} layout="vertical" disabled={saving} requiredMark>
        <FormLayout>
          <Form.Item
            label="名称"
            name="name"
            rules={[{ required: true, message: "请输入名称" }]}
          >
            <Input
              placeholder="例如：阿里云计算有限公司"
              maxLength={120}
              showCount
            />
          </Form.Item>

          <FormRow template="minmax(0, 1fr) 120px">
            <Form.Item
              label="类型"
              name="partner_type"
              rules={[{ required: true, message: "请选择" }]}
              initialValue="supplier"
            >
              <Select
                options={[
                  { value: "supplier", label: "供应商" },
                  { value: "service_provider", label: "服务商" },
                  { value: "individual", label: "个人往来方" },
                ]}
              />
            </Form.Item>
            <Form.Item label="状态" name="status" initialValue="active">
              <Select
                options={[
                  { value: "active", label: "启用" },
                  { value: "disabled", label: "停用" },
                ]}
              />
            </Form.Item>
          </FormRow>

          <Form.Item label="统一社会信用代码" name="unified_credit_code">
            <Input placeholder="选填（个人往来方可不填）" />
          </Form.Item>

          <FormRow columns={2}>
            <Form.Item label="供应商类别" name="supplier_category">
              <Select
                allowClear
                showSearch
                options={SUPPLIER_CATEGORY_OPTIONS}
                placeholder="选填"
              />
            </Form.Item>
            <Form.Item label="付款用途" name="payment_purpose">
              <Input placeholder="选填" />
            </Form.Item>
          </FormRow>

          <FormRow columns={2}>
            <Form.Item label="联系人" name="contact_name">
              <Input placeholder="选填" />
            </Form.Item>
            <Form.Item label="联系电话" name="contact_phone">
              <Input placeholder="选填" />
            </Form.Item>
          </FormRow>

          <Form.Item label="联系邮箱" name="contact_email">
            <Input placeholder="选填" />
          </Form.Item>

          <Form.Item label="地址 / 寄送地址" name="address">
            <Input.TextArea rows={2} placeholder="选填" />
          </Form.Item>

          <FormRow columns={2}>
            <Form.Item label="开户行" name="bank_name">
              <Input placeholder="选填" />
            </Form.Item>
            <Form.Item label="银行账号" name="bank_account">
              <Input placeholder="选填" />
            </Form.Item>
          </FormRow>

          <FormRow columns={2}>
            <Form.Item label="外部来源" name="external_source">
              <Input placeholder="选填" />
            </Form.Item>
            <Form.Item label="外部记录ID" name="external_record_id">
              <Input placeholder="选填" />
            </Form.Item>
          </FormRow>

          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={3} placeholder="选填" />
          </Form.Item>
        </FormLayout>
      </Form>

      <FormFooter
        mode="single"
        onCancel={() => navigate(-1)}
        onSaveDraft={onSave}
        saving={saving}
        hint={
          isEdit ? "修改后立即生效。" : "录入后立即在合同/付款页面下拉中可用。"
        }
      />
    </Card>
  );
};

export default PartnerForm;
