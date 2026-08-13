import React from "react";
import { Form, Input, Select } from "antd";
import FormLayout, { FormRow } from "@/components/form-layout";

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
        label="名称"
        name="name"
        rules={[{ required: true, whitespace: true, message: "请输入名称" }]}
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
  );
}
