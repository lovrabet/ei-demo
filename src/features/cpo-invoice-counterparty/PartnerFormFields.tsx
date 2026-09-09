import React from "react";
import { Form, Input, Select } from "antd";
import FormLayout, { FormRow } from "@/components/form-layout";
import { $i18n } from "@/i18n";

const t = (key: string, fallback: string) => $i18n.t(key, fallback);

export const SUPPLIER_CATEGORY_OPTIONS = [
  "杭州启智云图供应商",
  "杭州云兔供应商",
  "杭州梦码兔供应商",
  "杭州梦码象供应商",
  "启智云图上海分公司供应商",
  "杭州启智云图客户",
].map((value) => ({ value, label: value }));

export default function PartnerFormFields() {
  return (
    <FormLayout>
      <Form.Item
        label={t("partnerForm.field.name", "名称")}
        name="name"
        rules={[
          {
            required: true,
            whitespace: true,
            message: t("partnerForm.field.nameRequired", "请输入名称"),
          },
        ]}
      >
        <Input
          placeholder={t(
            "partnerForm.field.namePlaceholder",
            "例如：阿里云计算有限公司",
          )}
          maxLength={120}
          showCount
        />
      </Form.Item>

      <FormRow template="minmax(0, 1fr) 120px">
        <Form.Item
          label={t("partnerForm.field.type", "类型")}
          name="partner_type"
          rules={[
            { required: true, message: t("partnerForm.field.typeRequired", "请选择") },
          ]}
          initialValue="supplier"
        >
          <Select
            options={[
              {
                value: "supplier",
                label: t("partnerForm.type.supplier", "供应商"),
              },
              {
                value: "service_provider",
                label: t("partnerForm.type.serviceProvider", "服务商"),
              },
              {
                value: "individual",
                label: t("partnerForm.type.individual", "个人往来方"),
              },
            ]}
          />
        </Form.Item>
        <Form.Item
          label={t("partnerForm.field.status", "状态")}
          name="status"
          initialValue="active"
        >
          <Select
            options={[
              { value: "active", label: t("partnerForm.status.active", "启用") },
              {
                value: "disabled",
                label: t("partnerForm.status.disabled", "停用"),
              },
            ]}
          />
        </Form.Item>
      </FormRow>

      <Form.Item
        label={t("partnerForm.field.uscc", "统一社会信用代码")}
        name="unified_credit_code"
      >
        <Input
          placeholder={t(
            "partnerForm.field.optional",
            "选填（个人往来方可不填）",
          )}
        />
      </Form.Item>

      <FormRow columns={2}>
        <Form.Item
          label={t("partnerForm.field.supplierCategory", "供应商类别")}
          name="supplier_category"
        >
          <Select
            allowClear
            showSearch
            options={SUPPLIER_CATEGORY_OPTIONS}
            placeholder={t("partnerForm.field.optionalShort", "选填")}
          />
        </Form.Item>
        <Form.Item
          label={t("partnerForm.field.paymentPurpose", "付款用途")}
          name="payment_purpose"
        >
          <Input placeholder={t("partnerForm.field.optionalShort", "选填")} />
        </Form.Item>
      </FormRow>

      <FormRow columns={2}>
        <Form.Item
          label={t("partnerForm.field.contactName", "联系人")}
          name="contact_name"
        >
          <Input placeholder={t("partnerForm.field.optionalShort", "选填")} />
        </Form.Item>
        <Form.Item
          label={t("partnerForm.field.contactPhone", "联系电话")}
          name="contact_phone"
        >
          <Input placeholder={t("partnerForm.field.optionalShort", "选填")} />
        </Form.Item>
      </FormRow>

      <Form.Item
        label={t("partnerForm.field.contactEmail", "联系邮箱")}
        name="contact_email"
      >
        <Input placeholder={t("partnerForm.field.optionalShort", "选填")} />
      </Form.Item>

      <Form.Item
        label={t("partnerForm.field.address", "地址 / 寄送地址")}
        name="address"
      >
        <Input.TextArea
          rows={2}
          placeholder={t("partnerForm.field.optionalShort", "选填")}
        />
      </Form.Item>

      <FormRow columns={2}>
        <Form.Item
          label={t("partnerForm.field.bankName", "开户行")}
          name="bank_name"
        >
          <Input placeholder={t("partnerForm.field.optionalShort", "选填")} />
        </Form.Item>
        <Form.Item
          label={t("partnerForm.field.bankAccount", "银行账号")}
          name="bank_account"
        >
          <Input placeholder={t("partnerForm.field.optionalShort", "选填")} />
        </Form.Item>
      </FormRow>

      <FormRow columns={2}>
        <Form.Item
          label={t("partnerForm.field.externalSource", "外部来源")}
          name="external_source"
        >
          <Input placeholder={t("partnerForm.field.optionalShort", "选填")} />
        </Form.Item>
        <Form.Item
          label={t("partnerForm.field.externalRecordId", "外部记录ID")}
          name="external_record_id"
        >
          <Input placeholder={t("partnerForm.field.optionalShort", "选填")} />
        </Form.Item>
      </FormRow>

      <Form.Item label={t("partnerForm.field.remark", "备注")} name="remark">
        <Input.TextArea
          rows={3}
          placeholder={t("partnerForm.field.optionalShort", "选填")}
        />
      </Form.Item>
    </FormLayout>
  );
}
