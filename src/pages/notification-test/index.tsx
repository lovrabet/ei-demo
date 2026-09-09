/**
 * title: 飞书消息测试
 */
import React, { useState } from "react";
import { SendOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, Space, Typography } from "antd";
import PageScaffold from "@/components/page-scaffold/PageScaffold";
import { executeCommand, getCommandErrorMessage } from "@/utils/commands";
import { $i18n } from "@/i18n";
import styles from "./index.module.css";

const SCRIPT_NAME = "cpoSendFeishuTestMessage";

const t = (key: string, fallbackText: string) => $i18n.t(key, fallbackText);

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
      title={t("notificationTest.title", "飞书消息测试")}
      description={t("notificationTest.description", "向当前登录用户发送一条飞书测试消息。")}
      maxWidth={760}
      notice={
        <Alert
          showIcon
          type="warning"
          message={t(
            "notificationTest.notice",
            "点击发送后会立即产生一条外部消息，请勿重复提交。",
          )}
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
            label={t("notificationTest.field.message", "消息内容")}
            name="message"
            extra={t(
              "notificationTest.field.messageExtra",
              "消息将发送到当前登录用户绑定的飞书账号，支持 Markdown，例如 # 一级标题；HTML 标签不会按 HTML 渲染。",
            )}
            rules={[
              { required: true, whitespace: true, message: t("notificationTest.field.messageRequired", "请输入消息内容") },
              { max: 1000, message: t("notificationTest.field.messageTooLong", "消息内容不能超过 1000 个字符") },
            ]}
          >
            <Input.TextArea
              autoFocus
              autoSize={{ minRows: 8, maxRows: 16 }}
              maxLength={1000}
              placeholder={t("notificationTest.field.messagePlaceholder", "请输入需要验证的消息内容")}
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
              {t("notificationTest.action.send", "发送测试消息")}
            </Button>
          </div>
        </Form>
      </Card>

      <Space direction="vertical" size={12} className={styles.feedback}>
        {result ? (
          <Alert
            showIcon
            type={result.sent ? "success" : "info"}
            message={result.sent ? t("notificationTest.result.success", "发送成功") : t("notificationTest.result.queued", "发送请求已完成")}
            description={
              <Typography.Text>
                {t("notificationTest.result.detail", "接收人：{recipient}，渠道：{channel}")
                  .replace("{recipient}", result.recipient)
                  .replace("{channel}", result.channelType)}
              </Typography.Text>
            }
          />
        ) : null}
        {error ? (
          <Alert showIcon type="error" message={t("notificationTest.result.failed", "发送失败")} description={error} />
        ) : null}
      </Space>
    </PageScaffold>
  );
};

NotificationTestPage.displayName = "飞书消息测试";

export default NotificationTestPage;
