/**
 * title: 销项发票申请
 */
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Card,
  Form,
  Input,
  Select,
  DatePicker,
  Button,
  Space,
  message,
  Skeleton,
  Divider,
  Tooltip,
} from "antd";
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { lovrabetClient } from "@/api/client";
import { CURRENT_APP_MODEL_KEYS } from "@/api/model-keys";
import {
  getCrmCustomer,
  getLocalPartner,
  type CrmCustomer,
  type LocalPartner,
} from "@/api/crm";
import AgentFormGuide from "@/components/agent-form-guide";
import AttachmentUpload from "@/components/attachment-upload";
import FormFooter from "@/components/form-footer";
import FormLayout, { FormRow } from "@/components/form-layout";
import MoneyInput from "@/components/money-input";
import PartySelector from "@/components/party-selector";
import {
  firstAttachmentFilePath,
  listAttachmentValues,
  syncAttachmentRecords,
} from "@/features/attachments/api";
import { collectCpoFormValues } from "@/features/cpo-workflow/form-submit";
import {
  CPO_FORM_CANCEL_PATH,
  isWorkflowReadonly,
} from "@/features/cpo-workflow/routes";
import {
  CURRENT_ACTOR_SCRIPT,
  prefillApplicantFields,
  type CurrentActor,
} from "@/features/current-actor/api";
import {
  FALLBACK_INTERNAL_LEGAL_ENTITY,
  listInternalLegalEntities,
  selectDefaultInternalLegalEntity,
  type InternalLegalEntityOption,
} from "@/features/internal-legal-entities/api";

const INVOICE_CODE = "fc11e2d760b94b2ca2ccf0485ed40ca8";
const CONTRACT_CODE = "53869993f80f45ae8ef6cdf051d8e355";
const PAYMENT_CODE = "7da208a5059b4b13896d7c7ae29c8492";
const INVOICE_LINK_CODE = "9dd0d102219145ddbb67d1c247a84fb9";
const ATTACHMENTS_FIELD = "_attachments";
const PAYMENT_ALLOCATIONS_FIELD = "_payment_allocations";

type InvoiceRequestType =
  "customer_invoice" | "service_provider_invoice" | "other";

type InvoiceFormValues = {
  invoice_title?: string;
  request_type?: InvoiceRequestType;
  invoice_direction?: "incoming" | "outgoing";
  invoice_purpose?:
    | "reimbursement"
    | "procurement"
    | "contract_payment"
    | "customer_billing"
    | "other";
  partner_id?: number;
  partner_source?: "crm_customer" | "business_partner" | "manual";
  partner_name_snapshot?: string;
  contract_id?: number;
  crm_contract_id?: number;
  seller_name?: string;
  buyer_name?: string;
  buyer_tax_no?: string;
  buyer_address_phone?: string;
  buyer_bank_account?: string;
  amount?: number;
  tax_rate?: number;
  tax_amount?: number;
  total_amount?: number;
  currency?: string;
  invoice_region?: string;
  invoice_type?: string;
  invoice_medium?: string;
  invoice_content?: string;
  invoice_no?: string;
  invoice_date?: any;
  category?: string;
  file_path?: string;
  receiver_name?: string;
  receiver_phone?: string;
  receiver_email?: string;
  payment_condition_snapshot?: string;
  remark?: string;
  applicant_name_snapshot?: string;
  applicant_user_id?: string;
  [ATTACHMENTS_FIELD]?: any[];
  [PAYMENT_ALLOCATIONS_FIELD]?: InvoicePaymentAllocation[];
};

type InvoicePaymentAllocation = {
  payment_id?: number;
  amount_used?: number;
};

type ContractOption = {
  id: number;
  name: string;
  amount?: number;
  currency?: string;
  partnerId?: number;
  type?: string;
  status?: string;
};

type PaymentOption = {
  id: number;
  title: string;
  amount: number;
  currency: string;
  status: string;
  availableAmount: number;
  phaseNo?: number;
  phaseName?: string;
};

type ReceivableSummary = {
  planCount: number;
  unknownAmountCount: number;
  plannedAmount: number;
  receivedAmount: number;
  remainingAmount: number;
  currency: string;
};

const TAX_RATE_OPTIONS = [
  { value: 0, label: "0%" },
  { value: 0.01, label: "1%" },
  { value: 0.03, label: "3%" },
  { value: 0.06, label: "6%" },
  { value: 0.09, label: "9%" },
  { value: 0.13, label: "13%" },
];

function roundMoney(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.round(numberValue * 100) / 100;
}

function getPartnerName(
  partner: CrmCustomer | LocalPartner | null | undefined,
) {
  return partner?.name || "";
}

function getPartnerTaxNo(
  partner: CrmCustomer | LocalPartner | null | undefined,
) {
  if (!partner) return "";
  if ("uscc" in partner) return partner.uscc || "";
  return partner.unified_credit_code || "";
}

function getPartnerAddressPhone(
  partner: CrmCustomer | LocalPartner | null | undefined,
) {
  if (!partner || "uscc" in partner) return "";
  return [partner.address, partner.contact_phone].filter(Boolean).join(" ");
}

function getPartnerBankAccount(
  partner: CrmCustomer | LocalPartner | null | undefined,
) {
  if (!partner || "uscc" in partner) return "";
  return [partner.bank_name, partner.bank_account].filter(Boolean).join(" ");
}

function buildContractLabel(contract: ContractOption) {
  const amount =
    contract.amount != null
      ? `${contract.currency || "CNY"} ${Number(contract.amount).toLocaleString()}`
      : "";
  const suffix = [amount, contract.status].filter(Boolean).join(" / ");
  return suffix ? `${contract.name}（${suffix}）` : contract.name;
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  submitted: "审批中",
  reviewed: "已审核",
  bank_pending: "待银行处理",
  paid_confirmed: "已支付",
  payment_failed: "支付失败",
};

function buildPaymentLabel(payment: PaymentOption) {
  const phase = payment.phaseNo
    ? `第 ${payment.phaseNo} 期${payment.phaseName ? ` · ${payment.phaseName}` : ""}`
    : "";
  const amount = `${payment.currency || "CNY"} ${Number(payment.amount || 0).toLocaleString()}`;
  const available = `可覆盖 ${payment.currency || "CNY"} ${Number(payment.availableAmount || 0).toLocaleString()}`;
  return [
    phase,
    payment.title,
    amount,
    available,
    PAYMENT_STATUS_LABELS[payment.status] || payment.status,
  ]
    .filter(Boolean)
    .join(" · ");
}

const InvoiceForm: React.FC = () => {
  const [params] = useSearchParams();
  const editId = params.get("id");
  const mode = params.get("mode");
  const navigate = useNavigate();
  const location = useLocation();
  const isIncomingArchive = location.pathname === "/invoice-archive-form";
  const [form] = Form.useForm<InvoiceFormValues>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordStatus, setRecordStatus] = useState<string>();
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [contractLoading, setContractLoading] = useState(false);
  const [payments, setPayments] = useState<PaymentOption[]>([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [receivableSummary, setReceivableSummary] =
    useState<ReceivableSummary>();
  const [internalEntities, setInternalEntities] = useState<
    InternalLegalEntityOption[]
  >([FALLBACK_INTERNAL_LEGAL_ENTITY]);
  const isEdit = !!editId;
  const readOnly = isWorkflowReadonly(recordStatus, mode);
  const invoiceDirection = Form.useWatch("invoice_direction", form);
  const partnerId = Form.useWatch("partner_id", form);
  const contractId = Form.useWatch("contract_id", form);
  const crmContractId = Form.useWatch("crm_contract_id", form);
  const selectedContractId = isIncomingArchive ? contractId : crmContractId;
  const paymentAllocations =
    Form.useWatch(PAYMENT_ALLOCATIONS_FIELD, form) || [];
  const baseAmount = Form.useWatch("amount", form);
  const taxRate = Form.useWatch("tax_rate", form);
  const defaultInternalEntity = useMemo(
    () => selectDefaultInternalLegalEntity(internalEntities),
    [internalEntities],
  );
  const availableContracts = useMemo(() => {
    const selectedPartnerId = Number(partnerId);
    if (!selectedPartnerId) return [];
    return contracts.filter(
      (contract) => contract.partnerId === selectedPartnerId,
    );
  }, [contracts, partnerId]);

  useEffect(() => {
    // 同库合并后改为服务端级联：按当前交易对手过滤合同，
    // 替代原先拉 200 条全量再前端过滤（availableContracts 行为不变）
    const selectedPartnerId = Number(partnerId);
    if (!selectedPartnerId) {
      setContracts([]);
      return;
    }
    setContractLoading(true);
    const model = isIncomingArchive
      ? lovrabetClient.models[`dataset_${CONTRACT_CODE}`]
      : lovrabetClient.models[CURRENT_APP_MODEL_KEYS.receivableContract];
    model
      .filter({
        where: isIncomingArchive
          ? {
              status: { $in: ["submitted", "reviewed", "signed"] },
              partner_id: { $eq: selectedPartnerId },
            }
          : {
              sign_status: {
                $in: [
                  "submitted",
                  "reviewed",
                  "signed",
                  "PENDING",
                  "IN_PROGRESS",
                  "SIGNED",
                  "COMPLETED",
                ],
              },
              company_id: { $eq: selectedPartnerId },
            },
        currentPage: 1,
        pageSize: 200,
        orderBy: [{ updated_at: "desc" }],
      })
      .then((response: any) => {
        setContracts(
          (response.tableData || []).map((contract: any) => ({
            id: Number(contract.id),
            name:
              contract.contract_name ||
              contract.title ||
              contract.contract_no ||
              "合同名称缺失",
            amount: contract.amount,
            currency: contract.currency,
            partnerId:
              (isIncomingArchive ? contract.partner_id : contract.company_id) ==
              null
                ? undefined
                : Number(
                    isIncomingArchive
                      ? contract.partner_id
                      : contract.company_id,
                  ),
            type: isIncomingArchive ? contract.contract_type : "service",
            status: isIncomingArchive ? contract.status : contract.sign_status,
          })),
        );
      })
      .catch((error: any) =>
        message.error(`加载合同失败：${error?.message || error}`),
      )
      .finally(() => setContractLoading(false));
  }, [isIncomingArchive, partnerId]);

  useEffect(() => {
    if (isIncomingArchive || !crmContractId) {
      setReceivableSummary(undefined);
      return;
    }
    let cancelled = false;
    lovrabetClient.models[CURRENT_APP_MODEL_KEYS.receivablePlan]
      .filter({
        where: { contract_id: { $eq: Number(crmContractId) } },
        currentPage: 1,
        pageSize: 500,
      })
      .then((response: any) => {
        const plans = Array.isArray(response?.tableData)
          ? response.tableData.filter(
              (plan: any) =>
                !["CANCELLED", "NOT_REQUIRED"].includes(
                  String(plan.status || "").toUpperCase(),
                ),
            )
          : [];
        const knownPlans = plans.filter(
          (plan: any) =>
            plan.planned_amount !== null &&
            plan.planned_amount !== undefined &&
            Number.isFinite(Number(plan.planned_amount)),
        );
        const plannedAmount = roundMoney(
          knownPlans.reduce(
            (sum: number, plan: any) =>
              sum + Number(plan.planned_amount || 0),
            0,
          ),
        );
        const receivedAmount = roundMoney(
          plans.reduce(
            (sum: number, plan: any) =>
              sum + Number(plan.received_amount || 0),
            0,
          ),
        );
        if (!cancelled) {
          setReceivableSummary({
            planCount: plans.length,
            unknownAmountCount: plans.length - knownPlans.length,
            plannedAmount,
            receivedAmount,
            remainingAmount: Math.max(
              roundMoney(plannedAmount - receivedAmount),
              0,
            ),
            currency:
              String(plans[0]?.currency || "") ||
              contracts.find((item) => item.id === Number(crmContractId))
                ?.currency ||
              "CNY",
          });
        }
      })
      .catch(() => {
        if (!cancelled) setReceivableSummary(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [contracts, crmContractId, isIncomingArchive]);

  useEffect(() => {
    if (!editId) return;
    setLoading(true);
    const recordModel = isIncomingArchive
      ? lovrabetClient.models[`dataset_${INVOICE_CODE}`]
      : lovrabetClient.models.invoiceApplication;
    recordModel
      .getOne({ id: Number(editId) })
      .then(async (record: any) => {
        if (!record?.id) {
          message.error("未找到该发票记录");
          return;
        }
        const recordIsIncoming = isIncomingArchive;
        const [attachments, linkResponse, relationResponse] = await Promise.all(
          [
            listAttachmentValues({
              bizType: recordIsIncoming ? "invoice" : "invoice_application",
              bizId: Number(record.id),
              attachmentType: recordIsIncoming
                ? "invoice"
                : "invoice_application_material",
            }),
            recordIsIncoming
              ? lovrabetClient.models[`dataset_${INVOICE_LINK_CODE}`].filter({
                  where: {
                    invoice_id: { $eq: Number(record.id) },
                    biz_type: { $eq: "payment" },
                    relation_type: { $eq: "payment_coverage" },
                  },
                  currentPage: 1,
                  pageSize: 200,
                  orderBy: [{ id: "asc" }],
                })
              : Promise.resolve({ tableData: [] }),
            recordIsIncoming
              ? Promise.resolve({ tableData: [] })
              : lovrabetClient.models.bizRelation.filter({
                  where: {
                    source_biz_type: { $eq: "invoice_application" },
                    source_biz_id: { $eq: Number(record.id) },
                    target_biz_type: { $eq: "crm_contract" },
                    relation_type: { $eq: "bills_crm_contract" },
                    relation_status: { $eq: "active" },
                  },
                  currentPage: 1,
                  pageSize: 1,
                }),
          ],
        );
        const crmContractRelation = relationResponse.tableData?.[0];
        form.setFieldsValue({
          ...record,
          invoice_title: recordIsIncoming
            ? record.invoice_title
            : record.application_title,
          request_type: record.request_type || "customer_invoice",
          partner_id:
            (recordIsIncoming ? record.partner_id : record.crm_company_id) ==
            null
              ? undefined
              : Number(
                  recordIsIncoming ? record.partner_id : record.crm_company_id,
                ),
          partner_name_snapshot: recordIsIncoming
            ? record.partner_name_snapshot
            : record.customer_name_snapshot,
          contract_id:
            record.contract_id == null ? undefined : Number(record.contract_id),
          crm_contract_id: recordIsIncoming
            ? undefined
            : record.crm_contract_id || crmContractRelation?.target_biz_id
              ? Number(
                  record.crm_contract_id || crmContractRelation.target_biz_id,
                )
              : undefined,
          amount: recordIsIncoming ? record.amount : record.requested_amount,
          tax_amount: recordIsIncoming
            ? record.tax_amount
            : record.requested_tax_amount,
          total_amount: recordIsIncoming
            ? record.total_amount
            : record.requested_total_amount,
          tax_rate: Number(record.tax_rate ?? 0),
          invoice_date: record.invoice_date ? dayjs(record.invoice_date) : null,
          [ATTACHMENTS_FIELD]:
            attachments.length || !record.file_path
              ? attachments
              : [
                  {
                    fileName:
                      String(record.file_path).split("/").pop() ||
                      record.file_path,
                    filePath: record.file_path,
                  },
                ],
          [PAYMENT_ALLOCATIONS_FIELD]: (linkResponse.tableData || []).map(
            (link: any) => ({
              payment_id: Number(link.biz_id),
              amount_used: Number(link.amount_used || 0),
            }),
          ),
        });
        setRecordStatus(record.status);
      })
      .catch((error: any) =>
        message.error(`加载失败：${error?.message || error}`),
      )
      .finally(() => setLoading(false));
  }, [editId, form, isIncomingArchive, mode, navigate]);

  useEffect(() => {
    lovrabetClient.bff
      .execute<CurrentActor>({
        scriptName: CURRENT_ACTOR_SCRIPT,
        params: {},
      })
      .then((actor) => prefillApplicantFields(form, actor))
      .catch(() => undefined);
  }, [form]);

  useEffect(() => {
    let cancelled = false;
    listInternalLegalEntities()
      .then((entities) => {
        if (!cancelled) {
          setInternalEntities(entities);
        }
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) {
          setInternalEntities([FALLBACK_INTERNAL_LEGAL_ENTITY]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isEdit) return;
    const entityName = defaultInternalEntity.entityName;
    if (
      !isIncomingArchive &&
      entityName &&
      !form.getFieldValue("seller_name")
    ) {
      form.setFieldValue("seller_name", entityName);
    }
    if (isIncomingArchive && entityName && !form.getFieldValue("buyer_name")) {
      form.setFieldValue("buyer_name", entityName);
    }
  }, [defaultInternalEntity.entityName, form, isEdit, isIncomingArchive]);

  useEffect(() => {
    if (isEdit) return;
    form.setFieldsValue({
      request_type: isIncomingArchive
        ? "service_provider_invoice"
        : "customer_invoice",
      invoice_direction: isIncomingArchive ? "incoming" : "outgoing",
      invoice_purpose: isIncomingArchive
        ? form.getFieldValue("invoice_purpose") || "procurement"
        : "customer_billing",
      partner_source: "manual",
      [PAYMENT_ALLOCATIONS_FIELD]: [],
    });
  }, [form, isEdit, isIncomingArchive]);

  useEffect(() => {
    const amount = roundMoney(baseAmount);
    const rate = Number(taxRate);
    const normalizedRate = Number.isFinite(rate) ? rate : 0;
    const taxAmount = roundMoney(amount * normalizedRate);
    const totalAmount = roundMoney(amount + taxAmount);
    if (
      form.getFieldValue("tax_amount") !== taxAmount ||
      form.getFieldValue("total_amount") !== totalAmount
    ) {
      form.setFieldsValue({
        tax_amount: taxAmount,
        total_amount: totalAmount,
      });
    }
  }, [baseAmount, form, taxRate]);

  useEffect(() => {
    if (!selectedContractId) return;
    const contract = contracts.find(
      (item) => item.id === Number(selectedContractId),
    );
    if (!contract) return;
    const nextValues: Partial<InvoiceFormValues> = {};
    if (!form.getFieldValue("invoice_title")) {
      nextValues.invoice_title = `${contract.name}开票申请`;
    }
    if (!form.getFieldValue("amount") && contract.amount != null) {
      nextValues.amount = Number(contract.amount);
    }
    if (!form.getFieldValue("currency") && contract.currency) {
      nextValues.currency = contract.currency;
    }
    if (!form.getFieldValue("partner_id") && contract.partnerId) {
      nextValues.partner_id = contract.partnerId;
      nextValues.partner_source = isIncomingArchive
        ? "business_partner"
        : "crm_customer";
    }
    if (Object.keys(nextValues).length) {
      form.setFieldsValue(nextValues);
    }
  }, [contracts, form, isIncomingArchive, selectedContractId]);

  useEffect(() => {
    if (!isIncomingArchive || !contractId || contractLoading) return;
    const selectedContract = contracts.find(
      (contract) => contract.id === Number(contractId),
    );
    if (!selectedContract) return;
    if (selectedContract.partnerId !== Number(partnerId)) {
      form.setFieldsValue({
        contract_id: undefined,
        [PAYMENT_ALLOCATIONS_FIELD]: [],
      });
      setPayments([]);
    }
  }, [
    contractId,
    contractLoading,
    contracts,
    form,
    isIncomingArchive,
    partnerId,
  ]);

  useEffect(() => {
    if (!contractId || invoiceDirection !== "incoming") {
      setPayments([]);
      form.setFieldValue(PAYMENT_ALLOCATIONS_FIELD, []);
      return;
    }
    let cancelled = false;
    setPaymentLoading(true);
    lovrabetClient.models[`dataset_${PAYMENT_CODE}`]
      .filter({
        where: {
          contract_id: { $eq: Number(contractId) },
        },
        currentPage: 1,
        pageSize: 200,
        orderBy: [{ payment_phase_no: "asc" }, { created_at: "asc" }],
      })
      .then(async (response: any) => {
        if (cancelled) return;
        const paymentRows = (response.tableData || []).filter(
          (payment: any) =>
            !["cancelled", "rejected"].includes(String(payment.status)),
        );
        const linkResponse = paymentRows.length
          ? await lovrabetClient.models[`dataset_${INVOICE_LINK_CODE}`].filter({
              where: {
                biz_type: { $eq: "payment" },
                biz_id: {
                  $in: paymentRows.map((payment: any) => Number(payment.id)),
                },
              },
              currentPage: 1,
              pageSize: 1000,
            })
          : { tableData: [] };
        if (cancelled) return;
        const allocatedByPayment = new Map<number, number>();
        for (const link of linkResponse.tableData || []) {
          if (
            editId &&
            Number(link.invoice_id) === Number(editId) &&
            String(link.relation_type) === "payment_coverage"
          ) {
            continue;
          }
          const paymentId = Number(link.biz_id);
          allocatedByPayment.set(
            paymentId,
            (allocatedByPayment.get(paymentId) || 0) +
              Number(link.amount_used || 0),
          );
        }
        const currentAllocationIds = new Set(
          (form.getFieldValue(PAYMENT_ALLOCATIONS_FIELD) || []).map(
            (allocation: InvoicePaymentAllocation) =>
              Number(allocation.payment_id),
          ),
        );
        const nextPayments = paymentRows
          .filter(
            (payment: any) =>
              Number(payment.amount || 0) -
                (allocatedByPayment.get(Number(payment.id)) || 0) >
                0.001 || currentAllocationIds.has(Number(payment.id)),
          )
          .map((payment: any) => ({
            id: Number(payment.id),
            title: payment.title || payment.payment_phase_name || "付款记录",
            amount: Number(payment.amount || 0),
            currency: payment.currency || "CNY",
            status: payment.status || "draft",
            availableAmount: Math.max(
              Number(payment.amount || 0) -
                (allocatedByPayment.get(Number(payment.id)) || 0),
              0,
            ),
            phaseNo:
              payment.payment_phase_no == null
                ? undefined
                : Number(payment.payment_phase_no),
            phaseName: payment.payment_phase_name || "",
          }));
        setPayments(nextPayments);
        const allowedIds = new Set(
          nextPayments.map((payment: PaymentOption) => payment.id),
        );
        const currentAllocations =
          form.getFieldValue(PAYMENT_ALLOCATIONS_FIELD) || [];
        form.setFieldValue(
          PAYMENT_ALLOCATIONS_FIELD,
          currentAllocations.filter((allocation: InvoicePaymentAllocation) =>
            allowedIds.has(Number(allocation.payment_id)),
          ),
        );
      })
      .catch((error: any) =>
        message.error(`加载合同付款记录失败：${error?.message || error}`),
      )
      .finally(() => {
        if (!cancelled) setPaymentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contractId, editId, form, invoiceDirection]);

  useEffect(() => {
    if (!partnerId) {
      form.setFieldsValue({
        partner_source: "manual",
        partner_name_snapshot: "",
      });
      return;
    }
    let cancelled = false;
    const useCrm = !isIncomingArchive;
    const loader = useCrm ? getCrmCustomer : getLocalPartner;
    loader(partnerId)
      .then((partner) => {
        if (cancelled || !partner) return;
        const name = getPartnerName(partner);
        const nextValues: Partial<InvoiceFormValues> = {
          partner_source: useCrm ? "crm_customer" : "business_partner",
          partner_name_snapshot: name,
        };
        if (useCrm) {
          nextValues.buyer_name = name;
          nextValues.buyer_tax_no =
            getPartnerTaxNo(partner) || form.getFieldValue("buyer_tax_no");
        } else {
          nextValues.seller_name = name;
          nextValues.buyer_address_phone =
            getPartnerAddressPhone(partner) ||
            form.getFieldValue("buyer_address_phone");
          nextValues.buyer_bank_account =
            getPartnerBankAccount(partner) ||
            form.getFieldValue("buyer_bank_account");
        }
        form.setFieldsValue(nextValues);
      })
      .catch((error: any) =>
        message.error(`加载对方主体失败：${error?.message || error}`),
      );
    return () => {
      cancelled = true;
    };
  }, [form, isIncomingArchive, partnerId]);

  const onSave = async (action: "draft" | "submit" | "archive") => {
    if (readOnly) {
      message.warning("当前单据不可编辑");
      return;
    }
    let values: InvoiceFormValues;
    try {
      values = await collectCpoFormValues(
        form,
        action === "draft" ? "draft" : "submit",
      );
    } catch {
      return;
    }
    setSaving(true);
    try {
      const invoiceTitle =
        values.invoice_title?.trim() ||
        (isIncomingArchive
          ? [values.seller_name, values.invoice_no].filter(Boolean).join(" - ")
          : "");
      const invoicePayload: any = {
        invoice_title: invoiceTitle,
        request_type: isIncomingArchive
          ? "service_provider_invoice"
          : "customer_invoice",
        invoice_direction: isIncomingArchive ? "incoming" : "outgoing",
        invoice_purpose: isIncomingArchive
          ? values.invoice_purpose || "procurement"
          : "customer_billing",
        partner_id: values.partner_id ?? null,
        partner_source: values.partner_source || "manual",
        partner_name_snapshot: values.partner_name_snapshot ?? "",
        contract_id: isIncomingArchive ? (values.contract_id ?? null) : null,
        seller_name: values.seller_name ?? "",
        buyer_name: values.buyer_name ?? "",
        buyer_tax_no: values.buyer_tax_no ?? "",
        buyer_address_phone: values.buyer_address_phone ?? "",
        buyer_bank_account: values.buyer_bank_account ?? "",
        amount: values.amount ?? 0,
        tax_rate: values.tax_rate ?? 0,
        tax_amount: values.tax_amount ?? 0,
        total_amount: values.total_amount ?? 0,
        currency: values.currency || "CNY",
        invoice_region: values.invoice_region || "mainland_china",
        invoice_type: values.invoice_type || "vat_normal",
        invoice_medium: values.invoice_medium || "electronic",
        invoice_content: values.invoice_content ?? "",
        invoice_no: values.invoice_no ?? "",
        invoice_date: values.invoice_date
          ? dayjs(values.invoice_date).format("YYYY-MM-DD")
          : null,
        category: values.category ?? "",
        file_path: firstAttachmentFilePath(values[ATTACHMENTS_FIELD]) || "",
        receiver_name: values.receiver_name ?? "",
        receiver_phone: values.receiver_phone ?? "",
        receiver_email: values.receiver_email ?? "",
        is_mainland_compliant:
          values.invoice_region === "mainland_china" ? 1 : 0,
        remark: values.remark ?? "",
      };

      const selectedCrmContract = contracts.find(
        (contract) => contract.id === Number(values.crm_contract_id),
      );
      const applicationPayload = {
        application_title: invoiceTitle,
        request_type: "customer_invoice",
        crm_company_id: values.partner_id ?? null,
        customer_name_snapshot:
          values.partner_name_snapshot ?? values.buyer_name ?? "",
        crm_contract_id: values.crm_contract_id ?? null,
        contract_title_snapshot: selectedCrmContract?.name || "",
        seller_name: values.seller_name ?? "",
        buyer_name: values.buyer_name ?? "",
        buyer_tax_no: values.buyer_tax_no ?? "",
        buyer_address_phone: values.buyer_address_phone ?? "",
        buyer_bank_account: values.buyer_bank_account ?? "",
        requested_amount: values.amount ?? 0,
        requested_tax_amount: values.tax_amount ?? 0,
        requested_total_amount: values.total_amount ?? 0,
        currency: values.currency || "CNY",
        tax_rate: values.tax_rate ?? 0,
        invoice_type: values.invoice_type || "vat_normal",
        invoice_content: values.invoice_content ?? "",
        invoice_medium: values.invoice_medium || "electronic",
        receiver_name: values.receiver_name ?? "",
        receiver_phone: values.receiver_phone ?? "",
        receiver_email: values.receiver_email ?? "",
        payment_condition_snapshot:
          values.payment_condition_snapshot?.trim() || "",
        remark: values.remark ?? "",
      };
      const applicationBizType = isIncomingArchive
        ? "invoice"
        : "invoice_application";

      const saved = await lovrabetClient.bff.execute<{ bizId: number }>({
        scriptName: "cpoSaveDraft",
        params: {
          bizType: applicationBizType,
          bizId: isEdit ? Number(editId) : undefined,
          values: isIncomingArchive ? invoicePayload : applicationPayload,
          submit: action === "submit",
          ...(isIncomingArchive
            ? {
                paymentAllocations: values[PAYMENT_ALLOCATIONS_FIELD] || [],
              }
            : {}),
          ...(!isIncomingArchive
            ? {
                relations: values.crm_contract_id
                  ? [
                      {
                        relationType: "bills_crm_contract",
                        targetBizType: "crm_contract",
                        targetBizId: Number(values.crm_contract_id),
                      },
                    ]
                  : [],
              }
            : {}),
        },
      });
      const id = saved.bizId;
      const attachments = await syncAttachmentRecords({
        bizType: applicationBizType,
        bizId: id,
        attachmentType: isIncomingArchive
          ? "invoice"
          : "invoice_application_material",
        files: values[ATTACHMENTS_FIELD],
        uploadedBy: values.applicant_name_snapshot,
      });
      form.setFieldValue(ATTACHMENTS_FIELD, attachments);
      if (action === "submit") {
        message.success("已提交审核");
      } else if (action === "archive") {
        await lovrabetClient.bff.execute({
          scriptName: "cpoArchiveIncomingInvoice",
          params: { invoiceId: id },
        });
        message.success("进项发票已归档");
      } else {
        message.success(isEdit ? "草稿已更新" : "草稿已保存");
      }
      navigate("/invoice-center");
    } catch (error: any) {
      if (error?.errorFields) return;
      const actionLabel =
        action === "submit" ? "提交" : action === "archive" ? "归档" : "保存";
      message.error(`${actionLabel}失败：${error?.message || error}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton active paragraph={{ rows: 12 }} />;

  return (
    <Card
      style={{ maxWidth: 880, margin: "0 auto" }}
      title={
        <Space>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(-1)}
          />
          {isIncomingArchive
            ? readOnly
              ? "查看进项发票"
              : isEdit
                ? "编辑进项发票归档"
                : "录入进项发票"
            : readOnly
              ? "查看销项发票申请"
              : isEdit
                ? "编辑销项发票申请"
                : "申请开具销项发票"}
        </Space>
      }
    >
      {!readOnly ? (
        <AgentFormGuide
          skillCode="cpo-invoice-application"
          skillName="发票与开票申请助手"
          prompt={
            isIncomingArchive
              ? "请根据我上传的发票文件完成进项发票归档"
              : "请根据客户合同和开票材料创建并提交开票申请"
          }
          description={
            isIncomingArchive
              ? "上传发票文件后，Agent 可识别票面信息、核验业务关联并完成进项发票归档。"
              : "提供客户合同和开票材料后，Agent 可核对业务信息、整理附件并完成开票申请。"
          }
        />
      ) : null}
      <Form
        form={form}
        layout="vertical"
        disabled={saving || readOnly}
        requiredMark
        initialValues={{
          request_type: isIncomingArchive
            ? "service_provider_invoice"
            : "customer_invoice",
          invoice_direction: isIncomingArchive ? "incoming" : "outgoing",
          invoice_purpose: isIncomingArchive
            ? "procurement"
            : "customer_billing",
          partner_source: "manual",
          amount: 0,
          tax_rate: 0.06,
          tax_amount: 0,
          total_amount: 0,
          currency: "CNY",
          invoice_region: "mainland_china",
          invoice_type: "vat_normal",
          invoice_medium: "electronic",
          [PAYMENT_ALLOCATIONS_FIELD]: [],
        }}
      >
        <FormLayout>
          {isIncomingArchive ? (
            <Form.Item name="invoice_title" hidden>
              <Input />
            </Form.Item>
          ) : (
            <Form.Item
              label="申请标题"
              name="invoice_title"
              rules={[{ required: true, message: "请输入申请标题" }]}
            >
              <Input
                placeholder="例如：XX 项目首期开票申请"
                maxLength={120}
                showCount
              />
            </Form.Item>
          )}

          <PartySelector
            form={form}
            bizType="invoice"
            typeName="request_type"
            partnerName="partner_id"
            partnerLabel={
              isIncomingArchive ? "供应商 / 服务商（可选）" : "客户"
            }
            partnerRequired={!isIncomingArchive}
            hideType
            isSalesType={() => !isIncomingArchive}
          >
            <Select
              options={[
                isIncomingArchive
                  ? { value: "service_provider_invoice", label: "进项发票归档" }
                  : { value: "customer_invoice", label: "销项发票申请" },
              ]}
            />
          </PartySelector>
          <Form.Item name="invoice_direction" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="partner_source" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="partner_name_snapshot" hidden>
            <Input />
          </Form.Item>

          <Form.Item
            label={
              isIncomingArchive
                ? "关联采购合同（可选）"
                : "关联销售合同（可选）"
            }
            name={isIncomingArchive ? "contract_id" : "crm_contract_id"}
          >
            <Select
              allowClear
              showSearch
              loading={contractLoading}
              disabled={!partnerId}
              optionFilterProp="label"
              placeholder={
                !partnerId
                  ? isIncomingArchive
                    ? "选择供应商后可关联付款合同"
                    : "选择客户后可关联收款合同"
                  : isIncomingArchive
                    ? "选择该供应商的付款合同"
                    : "选择该客户的收款合同"
              }
              options={availableContracts.map((contract) => ({
                value: contract.id,
                label: buildContractLabel(contract),
              }))}
            />
          </Form.Item>

          {!isIncomingArchive && crmContractId ? (
            <Alert
              showIcon
              type={
                receivableSummary?.planCount &&
                receivableSummary.remainingAmount <= 0 &&
                receivableSummary.unknownAmountCount === 0
                  ? "success"
                  : "info"
              }
              message={
                receivableSummary?.planCount
                  ? `合同收款：已收 ${receivableSummary.currency} ${receivableSummary.receivedAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`
                  : "当前合同尚未维护可核验的收款计划"
              }
              description={
                receivableSummary?.planCount
                  ? receivableSummary.unknownAmountCount
                    ? `${receivableSummary.unknownAmountCount} 个期次金额未明确；已知计划 ${receivableSummary.currency} ${receivableSummary.plannedAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}。是否允许先票后款仍以合同约定和审批意见为准。`
                    : `计划收款 ${receivableSummary.currency} ${receivableSummary.plannedAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}，待收 ${receivableSummary.currency} ${receivableSummary.remainingAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}。是否允许先票后款仍以合同约定和审批意见为准。`
                  : "系统不会因尚未收款而禁止开票申请，但申请人需要填写下方的收款与开票条件。"
              }
              style={{ marginBottom: 16 }}
            />
          ) : null}

          {isIncomingArchive ? (
            <Form.Item
              label="发票用途"
              name="invoice_purpose"
              rules={[{ required: true, message: "请选择发票用途" }]}
            >
              <Select
                options={[
                  { value: "procurement", label: "采购 / 供应商" },
                  { value: "contract_payment", label: "合同付款核销" },
                  { value: "other", label: "其他" },
                ]}
              />
            </Form.Item>
          ) : (
            <Form.Item name="invoice_purpose" hidden>
              <Input />
            </Form.Item>
          )}

          {isIncomingArchive && invoiceDirection === "incoming" ? (
            <Form.List name={PAYMENT_ALLOCATIONS_FIELD}>
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field, index) => {
                    const { key, name, ...restField } = field;
                    const currentPaymentId = Number(
                      paymentAllocations[index]?.payment_id,
                    );
                    const selectedPaymentIds = new Set(
                      paymentAllocations
                        .map((allocation) => Number(allocation?.payment_id))
                        .filter(Boolean),
                    );
                    return (
                      <FormRow
                        key={key}
                        template="minmax(0, 1fr) minmax(180px, 240px) 40px"
                      >
                        <Form.Item
                          {...restField}
                          label={index === 0 ? "关联付款（可选）" : "付款记录"}
                          name={[name, "payment_id"]}
                          rules={[
                            { required: true, message: "请选择付款记录" },
                          ]}
                        >
                          <Select
                            showSearch
                            loading={paymentLoading}
                            disabled={!contractId}
                            optionFilterProp="label"
                            placeholder={
                              contractId
                                ? "选择该合同下的付款记录"
                                : "请先选择合同"
                            }
                            options={payments.map((payment) => ({
                              value: payment.id,
                              label: buildPaymentLabel(payment),
                              disabled:
                                payment.id !== currentPaymentId &&
                                selectedPaymentIds.has(payment.id),
                            }))}
                          />
                        </Form.Item>
                        <Form.Item
                          {...restField}
                          label="本票覆盖金额"
                          name={[name, "amount_used"]}
                          rules={[
                            { required: true, message: "请输入覆盖金额" },
                            {
                              type: "number",
                              min: 0.01,
                              message: "覆盖金额必须大于 0",
                            },
                          ]}
                        >
                          <MoneyInput min={0.01} minWidth={180} />
                        </Form.Item>
                        <Form.Item label=" ">
                          <Tooltip title="移除付款关联">
                            <Button
                              type="text"
                              danger
                              aria-label="移除付款关联"
                              icon={<DeleteOutlined />}
                              onClick={() => remove(name)}
                            />
                          </Tooltip>
                        </Form.Item>
                      </FormRow>
                    );
                  })}
                  <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    disabled={!contractId || paymentLoading}
                    onClick={() =>
                      add({ payment_id: undefined, amount_used: undefined })
                    }
                    block
                  >
                    关联该合同下的付款
                  </Button>
                  <div
                    style={{
                      marginTop: 6,
                      color: "rgba(0, 0, 0, 0.45)",
                      fontSize: 13,
                    }}
                  >
                    一张发票可覆盖多笔付款；每笔付款也可由多张发票共同覆盖，系统按填写金额核销。
                  </div>
                </>
              )}
            </Form.List>
          ) : null}

          <Divider style={{ margin: "8px 0 4px" }} />

          <FormRow columns={2}>
            <Form.Item
              label="销售方"
              name="seller_name"
              rules={[{ required: true, message: "请输入销售方" }]}
            >
              <Input placeholder="开票方或服务提供方名称" />
            </Form.Item>
            <Form.Item
              label="购买方"
              name="buyer_name"
              rules={[{ required: true, message: "请输入购买方" }]}
            >
              <Input placeholder="发票抬头或付款方名称" />
            </Form.Item>
          </FormRow>

          <FormRow columns={1}>
            <Form.Item label="购买方税号" name="buyer_tax_no">
              <Input placeholder="统一社会信用代码 / Tax ID" />
            </Form.Item>
          </FormRow>
          <Form.Item label="购买方地址电话" name="buyer_address_phone">
            <Input placeholder="专票需要时填写地址和电话" />
          </Form.Item>
          <Form.Item label="购买方开户行及账号" name="buyer_bank_account">
            <Input placeholder="专票需要时填写开户行和银行账号" />
          </Form.Item>

          <Divider style={{ margin: "8px 0 4px" }} />

          <FormRow template="repeat(4, minmax(150px, 1fr))">
            <Form.Item label="币种" name="currency">
              <Select
                options={[
                  { value: "CNY", label: "CNY" },
                  { value: "USD", label: "USD" },
                  { value: "HKD", label: "HKD" },
                ]}
              />
            </Form.Item>
            <Form.Item
              label="金额（不含税）"
              name="amount"
              rules={[
                { required: true, message: "请输入金额" },
                { type: "number", min: 0.01, message: "金额必须大于 0" },
              ]}
            >
              <MoneyInput min={0.01} minWidth={160} />
            </Form.Item>
            <Form.Item label="税率" name="tax_rate">
              <Select options={TAX_RATE_OPTIONS} />
            </Form.Item>
            <Form.Item label="税额" name="tax_amount">
              <MoneyInput min={0} minWidth={160} disabled />
            </Form.Item>
          </FormRow>

          <FormRow template="minmax(260px, 420px)">
            <Form.Item
              label="价税合计"
              name="total_amount"
              rules={[{ required: true, message: "请输入价税合计" }]}
            >
              <MoneyInput min={0} disabled />
            </Form.Item>
          </FormRow>

          <Form.Item
            label="开票内容"
            name="invoice_content"
            rules={[{ required: true, message: "请输入开票内容" }]}
          >
            <Input
              placeholder="例如：技术服务费 / 软件服务费 / 云资源服务"
              maxLength={300}
              showCount
            />
          </Form.Item>

          <FormRow columns={isIncomingArchive ? 3 : 2}>
            {isIncomingArchive ? (
              <Form.Item label="发票区域" name="invoice_region">
                <Select
                  options={[
                    { value: "mainland_china", label: "中国大陆" },
                    { value: "overseas", label: "海外" },
                    { value: "unknown", label: "未知" },
                  ]}
                />
              </Form.Item>
            ) : null}
            <Form.Item label="发票类型" name="invoice_type">
              <Select
                options={
                  isIncomingArchive
                    ? [
                        { value: "vat_special", label: "增值税专用发票" },
                        { value: "vat_normal", label: "增值税普通发票" },
                        { value: "e_ticket", label: "电子行程单" },
                        { value: "receipt", label: "收据 / Receipt" },
                        { value: "other", label: "其他" },
                      ]
                    : [
                        { value: "vat_special", label: "增值税专用发票" },
                        { value: "vat_normal", label: "增值税普通发票" },
                        { value: "other", label: "其他" },
                      ]
                }
              />
            </Form.Item>
            <Form.Item label="交付形式" name="invoice_medium">
              <Select
                options={[
                  { value: "electronic", label: "电子" },
                  { value: "paper", label: "纸质" },
                  { value: "other", label: "其他" },
                ]}
              />
            </Form.Item>
          </FormRow>

          {isIncomingArchive ? (
            <>
              <FormRow columns={2}>
                <Form.Item
                  label="发票号码"
                  name="invoice_no"
                  rules={[{ required: true, message: "请输入发票号码" }]}
                >
                  <Input placeholder="请输入发票号码" />
                </Form.Item>
                <Form.Item
                  label="开票日期"
                  name="invoice_date"
                  rules={[{ required: true, message: "请选择开票日期" }]}
                >
                  <DatePicker style={{ width: "100%" }} />
                </Form.Item>
              </FormRow>

              <Form.Item label="类目" name="category">
                <Input placeholder="如：软件服务、云资源、咨询服务" />
              </Form.Item>
            </>
          ) : null}

          <Divider style={{ margin: "8px 0 4px" }} />

          {isIncomingArchive ? null : (
            <FormRow columns={3}>
              <Form.Item label="收票人" name="receiver_name">
                <Input />
              </Form.Item>
              <Form.Item label="收票手机号" name="receiver_phone">
                <Input />
              </Form.Item>
              <Form.Item label="收票邮箱" name="receiver_email">
                <Input />
              </Form.Item>
            </FormRow>
          )}

          {isIncomingArchive ? null : (
            <Form.Item
              label="收款与开票条件"
              name="payment_condition_snapshot"
              extra="说明合同是否约定先款后票、先票后款，或本次开票对应的收款条件。"
            >
              <Input.TextArea
                rows={2}
                maxLength={500}
                placeholder="例如：合同签署后先开票，客户收到发票后 15 个工作日内付款"
              />
            </Form.Item>
          )}

          <Form.Item
            label={isIncomingArchive ? "发票文件" : "开票材料（可选）"}
            name={ATTACHMENTS_FIELD}
            rules={
              isIncomingArchive
                ? [{ required: true, message: "请上传发票文件" }]
                : undefined
            }
          >
            <AttachmentUpload
              disabled={readOnly}
              maxCount={20}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
            />
          </Form.Item>

          <Form.Item label="备注说明" name="remark">
            <Input.TextArea
              rows={3}
              placeholder={
                isIncomingArchive
                  ? "填写发票来源、线下沟通情况或其他补充说明"
                  : "填写开票背景、特殊要求或其他补充说明"
              }
              maxLength={1000}
              showCount
            />
          </Form.Item>

          <Form.Item
            label={isIncomingArchive ? "登记人" : "申请人"}
            name="applicant_name_snapshot"
          >
            <Input disabled />
          </Form.Item>
          <Form.Item name="applicant_user_id" hidden>
            <Input />
          </Form.Item>
        </FormLayout>
      </Form>

      {readOnly ? null : (
        <FormFooter
          mode={isIncomingArchive ? "single" : "workflow"}
          onCancel={() => navigate(CPO_FORM_CANCEL_PATH)}
          onSaveDraft={() => onSave(isIncomingArchive ? "archive" : "draft")}
          onSaveAndSubmit={
            isIncomingArchive ? undefined : () => onSave("submit")
          }
          saving={saving}
          singleActionLabel="保存归档"
          hint={
            isIncomingArchive
              ? "保存后直接进入发票台账，不发起审批。"
              : "提交后进入开票审批流，审批通过后可补录实际票号和附件。"
          }
        />
      )}
    </Card>
  );
};

InvoiceForm.displayName = "InvoiceForm";

export default InvoiceForm;
