import React from "react";
import { Form, Input, Select } from "antd";
import FormLayout, { FormRow, FormSection } from "./index";

export const formLayoutTypecheck = (
  <Form layout="vertical">
    <FormLayout maxWidth={720}>
      <FormSection title="基础信息" description="字段分组说明">
        <Form.Item label="名称" name="name">
          <Input />
        </Form.Item>
        <FormRow template="minmax(0, 1fr) 120px">
          <Form.Item label="类型" name="type">
            <Select />
          </Form.Item>
          <Form.Item label="状态" name="status">
            <Select />
          </Form.Item>
        </FormRow>
        <FormRow columns={2}>
          <Form.Item label="联系人" name="contactName">
            <Input />
          </Form.Item>
          <Form.Item label="联系电话" name="contactPhone">
            <Input />
          </Form.Item>
        </FormRow>
      </FormSection>
    </FormLayout>
  </Form>
);
