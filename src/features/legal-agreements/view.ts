import type { LegalAgreementRecord, LegalAgreementStatus } from "./types";

const STATUS_META: Record<
  LegalAgreementStatus,
  { label: string; color: string }
> = {
  DRAFT: { label: "草稿", color: "default" },
  IN_REVIEW: { label: "审核中", color: "processing" },
  APPROVED: { label: "已通过", color: "blue" },
  GENERATED: { label: "已生成", color: "cyan" },
  SENT: { label: "已发送", color: "blue" },
  SIGNING: { label: "签署中", color: "processing" },
  SIGNED: { label: "已签署", color: "green" },
  EFFECTIVE: { label: "已生效", color: "green" },
  TERMINATED: { label: "已终止", color: "red" },
  EXPIRED: { label: "已过期", color: "orange" },
  CANCELLED: { label: "已取消", color: "default" },
  REJECTED: { label: "已驳回", color: "red" },
};

const TYPE_LABEL: Record<string, string> = {
  NDA: "保密协议",
  DPA: "数据处理协议",
  SERVICE_AGREEMENT: "服务协议",
  COOPERATION_AGREEMENT: "合作协议",
  OTHER: "其他协议",
};

export function formatLegalAgreementStatus(status?: LegalAgreementStatus) {
  return status && STATUS_META[status]
    ? STATUS_META[status]
    : { label: status || "-", color: "default" };
}

export function formatLegalAgreementType(type?: string) {
  return type ? TYPE_LABEL[type] || type : "-";
}

export function legalAgreementMatchesKeyword(
  record: LegalAgreementRecord,
  keyword: string,
) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  const status = formatLegalAgreementStatus(record.status).label;
  const type = formatLegalAgreementType(record.agreement_type);
  return [
    record.agreement_no,
    record.agreement_title,
    record.project_name,
    record.cooperation_matter,
    record.primary_party_name_snapshot,
    status,
    type,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

export function getLegalAgreementLoadErrorDescription(message?: string) {
  const text = String(message || "");
  if (text.includes("用户未登录") || text.includes("401")) {
    return "请先在 Lovrabet 页面完成浏览器登录；CLI 登录态不能替代页面登录态。";
  }
  if (text.includes("模型未注册") || text.includes("Model")) {
    return "请确认 legal_* 数据集已完成平台分析，并已执行 rabetbase api pull 生成 SDK 模型。";
  }
  return "请检查网络、运行环境和 legal_* 数据集访问权限。";
}
