import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Space,
  Spin,
  Typography,
  message,
} from "antd";
import AttachmentUpload from "@/components/attachment-upload";
import {
  recognizeInvoiceFile,
  type AttachmentFileValue,
  type InvoiceOcrResult,
} from "@/features/attachments/api";
import type { ApplicationDetailResponse } from "@/features/cpo-application-detail/types";
import {
  completeInvoiceApplication,
  type RecognizedIssuedInvoice,
} from "./api";

type Props = {
  open: boolean;
  detail: ApplicationDetailResponse;
  onClose: () => void;
  onCompleted: () => void | Promise<void>;
};

function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function normalizeInvoiceDate(value: string) {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})日?$/);
  if (!match) return "";
  return [match[1], match[2].padStart(2, "0"), match[3].padStart(2, "0")].join(
    "-",
  );
}

function invoiceContentOf(kvData: Record<string, string>, fallback: string) {
  const details = String(kvData.invoiceDetails || "");
  const itemName = details.match(/itemName=([^,}\]]+)/)?.[1]?.trim();
  return itemName || fallback;
}

function invoiceTypeOf(value: string): RecognizedIssuedInvoice["invoiceType"] {
  if (value.includes("专用")) return "vat_special";
  if (value.includes("普通")) return "vat_normal";
  return "other";
}

export function normalizeRecognizedInvoice(
  result: InvoiceOcrResult,
  application: Record<string, unknown>,
): RecognizedIssuedInvoice {
  const data = result.kvData || {};
  const amount = money(data.invoiceAmountPreTax);
  const taxAmount = money(data.invoiceTax);
  const totalAmount = money(data.totalAmount);
  const invoiceDate = normalizeInvoiceDate(data.invoiceDate);
  const invoiceNo = String(
    data.invoiceNumber || data.printedInvoiceNumber || "",
  ).trim();
  const sellerName = String(data.sellerName || "").trim();
  const buyerName = String(data.purchaserName || "").trim();
  const buyerTaxNo = String(data.purchaserTaxNumber || "").trim();
  const invoiceContent = invoiceContentOf(
    data,
    String(application.invoice_content || "").trim(),
  );
  const missing = [
    [invoiceNo, "发票号码"],
    [invoiceDate, "开票日期"],
    [sellerName, "销售方名称"],
    [buyerName, "购买方名称"],
    [amount > 0, "不含税金额"],
    [totalAmount > 0, "价税合计"],
    [invoiceContent, "开票内容"],
  ]
    .filter(([value]) => !value)
    .map(([, label]) => label);
  if (missing.length) throw new Error(`OCR 未识别出：${missing.join("、")}`);
  if (sellerName !== String(application.seller_name || "").trim()) {
    throw new Error("票面销售方与开票申请不一致");
  }
  if (buyerName !== String(application.buyer_name || "").trim()) {
    throw new Error("票面购买方与开票申请不一致");
  }
  const applicationTaxNo = String(application.buyer_tax_no || "").trim();
  if (applicationTaxNo && buyerTaxNo && applicationTaxNo !== buyerTaxNo) {
    throw new Error("票面购买方税号与开票申请不一致");
  }
  if (Math.abs(amount + taxAmount - totalAmount) > 0.02) {
    throw new Error("票面金额、税额与价税合计无法勾稽");
  }
  return {
    invoiceNo,
    invoiceDate,
    sellerName,
    buyerName,
    buyerTaxNo,
    amount,
    taxAmount,
    totalAmount,
    taxRate:
      amount > 0 ? Math.round((taxAmount / amount) * 1_000_000) / 1_000_000 : 0,
    invoiceType: invoiceTypeOf(String(data.invoiceType || data.title || "")),
    invoiceContent,
  };
}

function formatMoney(value: number, currency: unknown) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: String(currency || "CNY"),
  }).format(value);
}

export default function IssuedInvoiceUploadDrawer({
  open,
  detail,
  onClose,
  onCompleted,
}: Props) {
  const [files, setFiles] = useState<AttachmentFileValue[]>([]);
  const [recognized, setRecognized] = useState<RecognizedIssuedInvoice>();
  const [recognizing, setRecognizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const currency = detail.biz.currency || "CNY";
  const remainingAmount = useMemo(() => {
    const metric = detail.businessContext?.metrics?.find(
      (item) => item.key === "remaining",
    );
    return money(metric?.value ?? detail.biz.requested_total_amount);
  }, [detail]);

  useEffect(() => {
    if (!open) {
      setFiles([]);
      setRecognized(undefined);
      setRecognizing(false);
      setSaving(false);
    }
  }, [open]);

  const changeFiles = async (nextFiles: AttachmentFileValue[]) => {
    setFiles(nextFiles);
    setRecognized(undefined);
    const file = nextFiles[0];
    if (!file?.filePath) return;
    setRecognizing(true);
    try {
      const result = await recognizeInvoiceFile(file.filePath);
      const normalized = normalizeRecognizedInvoice(result, detail.biz);
      if (normalized.totalAmount > remainingAmount + 0.001) {
        throw new Error("票面价税合计超过当前开票申请待开金额");
      }
      setRecognized(normalized);
      message.success("发票识别完成，请核对后确认登记");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "发票识别失败");
    } finally {
      setRecognizing(false);
    }
  };

  const submit = async () => {
    const attachment = files[0];
    if (!attachment || !recognized) return;
    setSaving(true);
    try {
      await completeInvoiceApplication({
        invoiceApplicationId: detail.summary.bizId,
        invoice: recognized,
        attachment,
      });
      message.success("真实发票已登记，并已关联开票申请和销售合同");
      onClose();
      await onCompleted();
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "真实发票登记失败，请重试",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      width={620}
      title="上传已开具发票"
      onClose={saving ? undefined : onClose}
      footer={
        <Space>
          <Button
            type="primary"
            loading={saving}
            disabled={!recognized || recognizing}
            onClick={() => void submit()}
          >
            确认登记并关联
          </Button>
          <Button disabled={saving} onClick={onClose}>
            取消
          </Button>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        message="财务只需上传真实发票 PDF"
        description="系统将自动识别票面信息；确认后直接登记发票台账、履约当前开票申请，并继承申请已关联的销售合同。"
        style={{ marginBottom: 16 }}
      />
      <Typography.Paragraph type="secondary">
        当前待开金额：{formatMoney(remainingAmount, currency)}
      </Typography.Paragraph>
      <AttachmentUpload
        value={files}
        onChange={(value) => void changeFiles(value)}
        maxCount={1}
        accept="application/pdf,.pdf"
        uploadLabel="上传真实发票 PDF"
        disabled={saving}
      />
      <Spin spinning={recognizing} tip="正在识别发票...">
        {recognized ? (
          <Descriptions
            title="票面识别结果"
            bordered
            column={1}
            size="small"
            style={{ marginTop: 20 }}
          >
            <Descriptions.Item label="发票号码">
              {recognized.invoiceNo}
            </Descriptions.Item>
            <Descriptions.Item label="开票日期">
              {recognized.invoiceDate}
            </Descriptions.Item>
            <Descriptions.Item label="购买方">
              {recognized.buyerName}
            </Descriptions.Item>
            <Descriptions.Item label="销售方">
              {recognized.sellerName}
            </Descriptions.Item>
            <Descriptions.Item label="开票内容">
              {recognized.invoiceContent}
            </Descriptions.Item>
            <Descriptions.Item label="价税合计">
              {formatMoney(recognized.totalAmount, currency)}
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Spin>
    </Drawer>
  );
}

IssuedInvoiceUploadDrawer.displayName = "已开具发票上传抽屉";
