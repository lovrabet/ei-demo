/**
 * title: 飞书消息测试
 */
import React, { useState } from "react";
import { SendOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, Space, Typography } from "antd";
import PageScaffold from "@/components/page-scaffold/PageScaffold";
import { executeCommand, getCommandErrorMessage } from "@/utils/commands";
import styles from "./index.module.css";

const SCRIPT_NAME = "cpoSendFeishuTestMessage";

type FormValues = {
  message: string;
};

type SendResult = {
  sent: boolean;
  channelType: string;
  recipient: string;
  message: string;
};

const NotificationTestPage: React.FC = () => {
  const [form] = Form.useForm<FormValues>();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult>();
  const [error, setError] = useState("");

  const handleSubmit = async (values: FormValues) => {
    setSending(true);
    setResult(undefined);
    setError("");

    try {
      const response = await executeCommand<SendResult>(SCRIPT_NAME, {
        message: values.message.trim(),
      });
      setResult(response);
    } catch (submitError) {
      setError(getCommandErrorMessage(submitError));
    } finally {
      setSending(false);
    }
  };

  return (
    <PageScaffold
      title="飞书消息测试"
      description="向当前登录用户发送一条飞书测试消息。"
      maxWidth={760}
      notice={
        <Alert
          showIcon
          type="warning"
          message="点击发送后会立即产生一条外部消息，请勿重复提交。"
        />
      }
    >
      <Card className={styles.card}>
        <Form<FormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={handleSubmit}
          onValuesChange={() => {
            setResult(undefined);
            setError("");
          }}
        >
          <Form.Item
            label="消息内容"
            name="message"
            extra="消息将发送到当前登录用户绑定的飞书账号，支持 Markdown，例如 # 一级标题；HTML 标签不会按 HTML 渲染。"
            rules={[
              { required: true, whitespace: true, message: "请输入消息内容" },
              { max: 1000, message: "消息内容不能超过 1000 个字符" },
            ]}
          >
            <Input.TextArea
              autoFocus
              autoSize={{ minRows: 8, maxRows: 16 }}
              maxLength={1000}
              placeholder="请输入需要验证的消息内容"
              showCount
            />
          </Form.Item>

          <div className={styles.actions}>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SendOutlined />}
              loading={sending}
            >
              发送测试消息
            </Button>
          </div>
        </Form>
      </Card>

      <Space direction="vertical" size={12} className={styles.feedback}>
        {result ? (
          <Alert
            showIcon
            type={result.sent ? "success" : "info"}
            message={result.sent ? "发送成功" : "发送请求已完成"}
            description={
              <Typography.Text>
                接收人：{result.recipient}，渠道：{result.channelType}
              </Typography.Text>
            }
          />
        ) : null}
        {error ? (
          <Alert showIcon type="error" message="发送失败" description={error} />
        ) : null}
      </Space>
    </PageScaffold>
  );
};

NotificationTestPage.displayName = "飞书消息测试";

export default NotificationTestPage;
