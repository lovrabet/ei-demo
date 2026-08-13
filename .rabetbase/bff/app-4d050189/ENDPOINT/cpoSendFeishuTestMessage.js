/**
 * 向当前登录用户发送一条飞书测试消息。
 *
 * [接口路径] POST /api/endpoint/app-4d050189/cpoSendFeishuTestMessage
 * [平台配置] https://app.lovrabet.com/app/app-4d050189/data/backend-function
 *
 * [HTTP 请求体参数]
 * { "message": "需要发送的测试消息，1-1000 个字符" }
 *
 * [返回数据结构]
 * { sent, channelType, recipient, message }
 */
const CONFIG_CODE = "ncc_b47e8b3887624c55bee730cdaa5733cf";

function requiredMessage(value) {
  const message = typeof value === "string" ? value.trim() : "";
  if (!message) {
    throw new Error("INVALID_PARAMS:message is required");
  }
  if (message.length > 1000) {
    throw new Error("INVALID_PARAMS:message must not exceed 1000 characters");
  }
  return message;
}

export default async function cpoSendFeishuTestMessage(params, context) {
  const content = requiredMessage(params?.message);
  const actor = await context.client.bff.execute({
    scriptName: "cpoCurrentActor",
    params: {},
  });
  const recipientId =
    typeof actor?.userId === "string" ? actor.userId.trim() : "";

  if (!recipientId) {
    throw new Error("CURRENT_ACTOR_MISSING");
  }

  const result = await context.client.extension.execute(
    "notification",
    "send",
    {
      configCode: CONFIG_CODE,
      audiences: [{ type: "USER", ids: [recipientId] }],
      message: {
        title: "飞书消息测试",
        summary: "来自消息发送测试页",
        theme: "blue",
        detailMarkdown: content,
      },
    },
  );

  return {
    sent: result?.sent === true,
    channelType: result?.channelType || "FEISHU",
    recipient: actor?.displayName || actor?.userName || recipientId,
    message: result?.message || "通知发送成功",
  };
}
