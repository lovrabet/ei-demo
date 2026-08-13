import React, { useEffect, useState } from "react";
import { Button, Drawer, Form, Space, message } from "antd";
import {
  createLocalPartner,
  type CreateLocalPartnerInput,
  type LocalPartner,
} from "@/api/crm";
import PartnerFormFields from "./PartnerFormFields";

type PartnerCreateDrawerProps = {
  open: boolean;
  initialName: string;
  onCancel: () => void;
  onCreated: (partner: LocalPartner) => void;
};

export default function PartnerCreateDrawer({
  open,
  initialName,
  onCancel,
  onCreated,
}: PartnerCreateDrawerProps) {
  const [form] = Form.useForm<CreateLocalPartnerInput>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: initialName.trim(),
      partner_type: "supplier",
      status: "active",
    });
  }, [form, initialName, open]);

  const submit = async () => {
    let values: CreateLocalPartnerInput;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      const partner = await createLocalPartner(values);
      message.success("供应商已创建并关联");
      onCreated(partner);
    } catch (error: any) {
      message.error(`创建失败：${error?.message || error}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      title="新建供应商 / 服务商"
      placement="right"
      width="min(760px, 96vw)"
      open={open}
      destroyOnHidden
      maskClosable={!saving}
      closable={!saving}
      onClose={onCancel}
      afterOpenChange={(nextOpen) => {
        if (!nextOpen) form.resetFields();
      }}
      footer={
        <Space style={{ width: "100%", justifyContent: "flex-end" }}>
          <Button disabled={saving} onClick={onCancel}>
            取消
          </Button>
          <Button type="primary" loading={saving} onClick={submit}>
            创建并关联
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" requiredMark disabled={saving}>
        <PartnerFormFields />
      </Form>
    </Drawer>
  );
}
