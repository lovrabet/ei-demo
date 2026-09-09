/**
 * title: 法务协议
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AutoComplete,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  EditOutlined,
  FileAddOutlined,
  FileProtectOutlined,
  FileWordOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SaveOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import PageScaffold from "@/components/page-scaffold/PageScaffold";
import MoneyInput from "@/components/money-input";
import {
  buildDefaultLegalAgreementDraft,
  detailToLegalAgreementDraft,
  getLegalAgreementDetail,
  listLegalAgreementRecords,
  listLegalCustomerOptions,
  saveLegalAgreementDraft,
} from "@/features/legal-agreements/api";
import {
  FALLBACK_INTERNAL_LEGAL_ENTITY,
  findInternalLegalEntityByCode,
  findInternalLegalEntityByName,
  internalLegalEntityToSelectOption,
  listInternalLegalEntities,
  selectDefaultInternalLegalEntity,
  type InternalLegalEntityOption,
} from "@/features/internal-legal-entities/api";
import {
  buildLegalAgreementSnapshot,
  renderLegalAgreementHtml,
} from "@/features/legal-agreements/document";
import {
  legalAgreementFormValuesToDraft,
  type LegalAgreementFormValues,
} from "@/features/legal-agreements/form";
import { printLegalAgreementHtml } from "@/features/legal-agreements/print";
import { exportLegalAgreementWord } from "@/features/legal-agreements/export-word";
import type {
  LegalAgreementDraft,
  LegalAgreementDetail,
  LegalAgreementPartyRecord,
  LegalAgreementRecord,
  LegalDocumentRecord,
  LegalStatusLogRecord,
  LegalCustomerOption,
} from "@/features/legal-agreements/types";
import {
  formatLegalAgreementStatus,
  formatLegalAgreementType,
  getLegalAgreementLoadErrorDescription,
  legalAgreementMatchesKeyword,
} from "@/features/legal-agreements/view";
import { formatDateText, formatDateTimeText } from "@/utils/format";
import { $i18n } from "@/i18n";
import styles from "./index.module.css";

const { Text } = Typography;

const t = (
  key: string,
  fallbackText: string,
  options?: Record<string, string | number>,
) =>
  options
    ? $i18n.t({ id: key, dm: fallbackText }, options)
    : $i18n.t(key, fallbackText);

const PARTY_ROLE_LABEL: Record<string, string> = {
  OUR_SIDE: t("legalAgreements.partyRole.ourSide", "我方"),
  COUNTERPARTY: t("legalAgreements.partyRole.counterparty", "合作方"),
  THIRD_PARTY: t("legalAgreements.partyRole.thirdParty", "第三方"),
};

const PARTY_SOURCE_LABEL: Record<string, string> = {
  INTERNAL_COMPANY: t("legalAgreements.partySource.internal", "内部公司"),
  CRM_COMPANY: t("legalAgreements.partySource.crm", "客户档案"),
  MANUAL: t("legalAgreements.partySource.manual", "手动输入"),
};

function buildPreviewHtml(draft: LegalAgreementDraft, agreementNo = "DRAFT") {
  return renderLegalAgreementHtml(
    buildLegalAgreementSnapshot({
      agreementNo,
      generatedAt: new Date().toISOString(),
      draft,
    }),
  );
}

function draftToFormValues(
  draft: LegalAgreementDraft,
  internalEntities: InternalLegalEntityOption[] = [
    FALLBACK_INTERNAL_LEGAL_ENTITY,
  ],
): LegalAgreementFormValues {
  const { parties: _parties, ...values } = draft;
  const counterparty = getCounterparty(draft);
  const ourSide = getOurSide(draft);
  const internalEntity =
    findInternalLegalEntityByName(internalEntities, ourSide?.companyName) ||
    selectDefaultInternalLegalEntity(internalEntities);
  return {
    ...values,
    customerName: counterparty?.companyName,
    customerUscc: counterparty?.uscc,
    customerLegalRep: counterparty?.legalRep,
    customerAddress: counterparty?.address,
    customerContactName: counterparty?.contactName,
    customerContactPhone: counterparty?.contactPhone,
    customerContactEmail: counterparty?.contactEmail,
    internalEntityCode: internalEntity.entityCode,
  };
}

function getCounterparty(draft: LegalAgreementDraft) {
  return (
    draft.parties.find((party) => party.partyRole === "COUNTERPARTY") ||
    draft.parties[1]
  );
}

function getOurSide(draft: LegalAgreementDraft) {
  return (
    draft.parties.find((party) => party.partyRole === "OUR_SIDE") ||
    draft.parties[1]
  );
}

function customerOptionFromCounterparty(
  party?: LegalAgreementDraft["parties"][number],
): LegalCustomerOption | undefined {
  if (!party || party.sourceType !== "CRM_COMPANY" || !party.crmCompanyId) {
    return undefined;
  }
  return {
    source: "CRM_COMPANY",
    sourceId: party.crmCompanyId,
    customerName: party.companyName,
    taxNo: party.uscc,
    legalRep: party.legalRep,
    companyAddress: party.address,
    contactId: party.crmContactId,
    contactName: party.contactName,
    contactPhone: party.contactPhone,
    contactEmail: party.contactEmail,
  };
}

function buildDetailPrintHtml(detail: LegalAgreementDetail) {
  const latestDocument = [...detail.documents].sort(
    (left, right) =>
      (right.document_revision || 0) - (left.document_revision || 0) ||
      Number(right.id || 0) - Number(left.id || 0),
  )[0];
  if (isUsableContractHtml(latestDocument?.rendered_content)) {
    return latestDocument.rendered_content;
  }
  return buildPreviewHtml(
    detailToLegalAgreementDraft(detail),
    detail.agreement.agreement_no,
  );
}

function isUsableContractHtml(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.includes("contract-page")
  );
}

function printHtmlDocument(html: string, title: string) {
  if (!printLegalAgreementHtml(html, title)) {
    message.error(
      t(
        "legalAgreements.popupBlocked",
        "浏览器阻止了打印窗口，请允许弹窗后重试",
      ),
    );
  }
}

async function exportWordDocument(
  html: string,
  title: string,
  agreementNo?: string,
) {
  try {
    await exportLegalAgreementWord({
      html,
      fileName: agreementNo || title,
    });
    message.success(
      t("legalAgreements.wordExportStarted", "Word 文档已开始下载"),
    );
  } catch (error) {
    console.error(error);
    message.error(
      error instanceof Error
        ? error.message
        : t("legalAgreements.wordExportFailed", "Word 导出失败，请稍后重试"),
    );
  }
}

export default function LegalAgreementsPage() {
  const [form] = Form.useForm<LegalAgreementFormValues>();
  const [records, setRecords] = useState<LegalAgreementRecord[]>([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string>();
  const [agreementDetail, setAgreementDetail] =
    useState<LegalAgreementDetail>();
  const [editingDetail, setEditingDetail] = useState<LegalAgreementDetail>();
  const [formRevision, setFormRevision] = useState(0);
  const [customerKeyword, setCustomerKeyword] = useState("");
  const [customerOptions, setCustomerOptions] = useState<LegalCustomerOption[]>(
    [],
  );
  const [selectedCustomer, setSelectedCustomer] =
    useState<LegalCustomerOption>();
  const [customerLoading, setCustomerLoading] = useState(false);
  const [internalEntities, setInternalEntities] = useState<
    InternalLegalEntityOption[]
  >([FALLBACK_INTERNAL_LEGAL_ENTITY]);
  const [internalEntityLoading, setInternalEntityLoading] = useState(false);
  const breachPenaltyType = Form.useWatch("breachPenaltyType", form);
  const defaultInternalEntity = useMemo(
    () => selectDefaultInternalLegalEntity(internalEntities),
    [internalEntities],
  );
  const selectedInternalEntity = useMemo(
    () =>
      findInternalLegalEntityByCode(
        internalEntities,
        form.getFieldValue("internalEntityCode"),
      ) || defaultInternalEntity,
    [defaultInternalEntity, form, formRevision, internalEntities],
  );
  const internalEntityOptions = useMemo(
    () => internalEntities.map(internalLegalEntityToSelectOption),
    [internalEntities],
  );

  const loadRecords = async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const response = await listLegalAgreementRecords(100);
      setRecords(response);
    } catch (error) {
      console.error(error);
      const nextMessage =
        error instanceof Error
          ? error.message
          : t("legalAgreements.loadListFailed", "加载法务协议列表失败");
      setLoadError(nextMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setInternalEntityLoading(true);
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
      })
      .finally(() => {
        if (!cancelled) {
          setInternalEntityLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        setCustomerLoading(true);
        listLegalCustomerOptions(customerKeyword)
          .then((options) => {
            if (!cancelled) {
              setCustomerOptions(options);
            }
          })
          .catch((error) => {
            console.error(error);
            if (!cancelled) {
              setCustomerOptions([]);
            }
          })
          .finally(() => {
            if (!cancelled) {
              setCustomerLoading(false);
            }
          });
      },
      customerKeyword ? 240 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [customerKeyword]);

  const filteredRecords = useMemo(
    () =>
      records.filter((record) => legalAgreementMatchesKeyword(record, keyword)),
    [keyword, records],
  );

  const signedCount = useMemo(
    () =>
      filteredRecords.filter((record) =>
        ["SIGNED", "EFFECTIVE"].includes(record.status),
      ).length,
    [filteredRecords],
  );

  const draftCount = useMemo(
    () => filteredRecords.filter((record) => record.status === "DRAFT").length,
    [filteredRecords],
  );

  const customerNameOptions = useMemo(
    () =>
      customerOptions.map((customer) => ({
        value: customer.customerName,
        customerOption: customer,
        label: (
          <div className={styles.customerOption}>
            <strong>{customer.customerName}</strong>
            <span>
              {[
                customer.contactName
                  ? t(
                      "legalAgreements.contact.contactPrefix",
                      "联系人：{name}",
                      {
                        name: customer.contactName,
                      },
                    )
                  : "",
                customer.contactPhone
                  ? t("legalAgreements.contact.phonePrefix", "手机：{phone}", {
                      phone: customer.contactPhone,
                    })
                  : "",
                customer.contactEmail
                  ? t("legalAgreements.contact.emailPrefix", "邮箱：{email}", {
                      email: customer.contactEmail,
                    })
                  : "",
              ]
                .filter(Boolean)
                .join(" · ") ||
                t("legalAgreements.contact.fallback", "客户档案")}
            </span>
          </div>
        ),
      })),
    [customerOptions],
  );

  const currentDraft = useMemo(
    () =>
      legalAgreementFormValuesToDraft(
        form.getFieldsValue(),
        selectedCustomer,
        selectedInternalEntity,
      ),
    [form, formRevision, selectedCustomer, selectedInternalEntity],
  );

  const previewHtml = useMemo(
    () =>
      buildPreviewHtml(
        currentDraft,
        editingDetail?.agreement.agreement_no || "DRAFT",
      ),
    [currentDraft, editingDetail],
  );
  const detailPreviewHtml = useMemo(
    () => (agreementDetail ? buildDetailPrintHtml(agreementDetail) : ""),
    [agreementDetail],
  );

  const openCreateDrawer = () => {
    const draft = buildDefaultLegalAgreementDraft(defaultInternalEntity);
    setEditingDetail(undefined);
    form.setFieldsValue({
      ...draft,
      customerName: "",
      agreementDate: draft.agreementDate,
      internalEntityCode: defaultInternalEntity.entityCode,
    });
    setSelectedCustomer(undefined);
    setCustomerKeyword("");
    setFormRevision((value) => value + 1);
    setDrawerOpen(true);
  };

  const openEditDrawer = (detail: LegalAgreementDetail) => {
    if (detail.agreement.status !== "DRAFT") {
      message.warning(
        t("legalAgreements.onlyDraftEditable", "只有草稿协议可以修改"),
      );
      return;
    }
    const draft = detailToLegalAgreementDraft(detail);
    const counterparty = getCounterparty(draft);
    setEditingDetail(detail);
    setSelectedCustomer(customerOptionFromCounterparty(counterparty));
    setCustomerKeyword(counterparty?.companyName || "");
    form.setFieldsValue(draftToFormValues(draft, internalEntities));
    setFormRevision((value) => value + 1);
    setDetailOpen(false);
    setDrawerOpen(true);
  };

  const applyCustomerOption = (customer?: LegalCustomerOption) => {
    if (!customer) {
      return;
    }
    setSelectedCustomer(customer);
    form.setFieldsValue({
      customerName: customer.customerName,
      customerUscc: customer.taxNo,
      customerLegalRep: customer.legalRep,
      customerAddress: customer.companyAddress,
      customerContactName: customer.contactName,
      customerContactPhone: customer.contactPhone,
      customerContactEmail: customer.contactEmail,
    });
    setFormRevision((value) => value + 1);
  };

  const openDetailDrawer = async (record: LegalAgreementRecord) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError(undefined);
    setAgreementDetail({
      agreement: record,
      parties: [],
      documents: [],
      statusLogs: [],
    });
    try {
      const detail = await getLegalAgreementDetail(record.id);
      setAgreementDetail(detail);
    } catch (error) {
      console.error(error);
      setDetailError(
        error instanceof Error
          ? error.message
          : t("legalAgreements.loadDetailFailed", "加载协议详情失败"),
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const handleExportWord = async (
    html: string,
    title: string,
    agreementNo?: string,
  ) => {
    setExportingWord(true);
    try {
      await exportWordDocument(html, title, agreementNo);
    } finally {
      setExportingWord(false);
    }
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const draft = legalAgreementFormValuesToDraft(
      values,
      selectedCustomer,
      selectedInternalEntity,
    );
    setSaving(true);
    try {
      await saveLegalAgreementDraft(draft, editingDetail);
      message.success(
        editingDetail
          ? t("legalAgreements.draftUpdated", "法务协议草稿已更新")
          : t("legalAgreements.draftSaved", "法务协议草稿已保存"),
      );
      setDrawerOpen(false);
      setEditingDetail(undefined);
      await loadRecords();
    } catch (error) {
      console.error(error);
      message.error(
        error instanceof Error
          ? error.message
          : t("legalAgreements.saveFailed", "保存法务协议失败"),
      );
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<LegalAgreementRecord> = [
    {
      title: t("legalAgreements.table.agreementNo", "协议编号"),
      dataIndex: "agreement_no",
      width: 190,
      render: (value, record) => (
        <button
          type="button"
          className={styles.agreementNoButton}
          onClick={(event) => {
            event.stopPropagation();
            void openDetailDrawer(record);
          }}
        >
          {value}
        </button>
      ),
    },
    {
      title: t("legalAgreements.table.agreementInfo", "协议信息"),
      dataIndex: "agreement_title",
      width: 320,
      render: (value, record) => (
        <div className={styles.agreementInfo}>
          <strong>{value}</strong>
          <span>
            {record.primary_party_name_snapshot ||
              t("legalAgreements.table.noCounterparty", "未关联合作方")}
            {record.project_name ? ` · ${record.project_name}` : ""}
          </span>
        </div>
      ),
    },
    {
      title: t("legalAgreements.table.type", "类型"),
      dataIndex: "agreement_type",
      width: 120,
      render: (value) => formatLegalAgreementType(value),
    },
    {
      title: t("legalAgreements.table.agreementDate", "协议日期"),
      dataIndex: "agreement_date",
      width: 124,
      render: formatDateText,
    },
    {
      title: t("legalAgreements.table.signedDate", "签署日期"),
      dataIndex: "signed_date",
      width: 124,
      render: formatDateText,
    },
    {
      title: t("legalAgreements.table.status", "状态"),
      dataIndex: "status",
      width: 112,
      render: (value) => {
        const meta = formatLegalAgreementStatus(value);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: t("legalAgreements.table.createdAt", "创建时间"),
      dataIndex: "created_at",
      width: 160,
      render: formatDateTimeText,
    },
  ];

  const partyColumns: ColumnsType<LegalAgreementPartyRecord> = [
    {
      title: t("legalAgreements.partyTable.title", "称谓"),
      dataIndex: "party_title",
      width: 90,
    },
    {
      title: t("legalAgreements.partyTable.role", "角色"),
      dataIndex: "party_role",
      width: 100,
      render: (value) => PARTY_ROLE_LABEL[value] || value,
    },
    {
      title: t("legalAgreements.partyTable.subject", "主体"),
      dataIndex: "company_name_snapshot",
      render: (value, record) => (
        <div className={styles.agreementInfo}>
          <strong>{value}</strong>
          <span>
            {[
              PARTY_SOURCE_LABEL[record.source_type] || record.source_type,
              record.uscc_snapshot
                ? t("legalAgreements.partyTable.uscc", "统一代码：{code}", {
                    code: record.uscc_snapshot,
                  })
                : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      ),
    },
    {
      title: t("legalAgreements.partyTable.contact", "联系人"),
      dataIndex: "contact_name_snapshot",
      width: 220,
      render: (_value, record) =>
        [
          record.contact_name_snapshot,
          record.contact_phone_snapshot,
          record.contact_email_snapshot,
        ]
          .filter(Boolean)
          .join(" / ") || "-",
    },
  ];

  const documentColumns: ColumnsType<LegalDocumentRecord> = [
    {
      title: t("legalAgreements.docTable.no", "文档编号"),
      dataIndex: "document_no",
      width: 220,
    },
    {
      title: t("legalAgreements.docTable.title", "文档标题"),
      dataIndex: "document_title",
    },
    {
      title: t("legalAgreements.docTable.format", "格式"),
      dataIndex: "file_format",
      width: 100,
    },
    {
      title: t("legalAgreements.docTable.generatedAt", "生成时间"),
      dataIndex: "generated_at",
      width: 170,
      render: formatDateTimeText,
    },
  ];

  const statusLogColumns: ColumnsType<LegalStatusLogRecord> = [
    {
      title: t("legalAgreements.logTable.action", "动作"),
      dataIndex: "action_name",
      width: 140,
      render: (value, record) => value || record.action_code,
    },
    {
      title: t("legalAgreements.logTable.status", "状态"),
      dataIndex: "to_status",
      width: 120,
      render: (value) => {
        const meta = formatLegalAgreementStatus(value);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: t("legalAgreements.logTable.note", "备注"),
      dataIndex: "action_note",
      render: (value) => value || "-",
    },
    {
      title: t("legalAgreements.logTable.time", "时间"),
      dataIndex: "created_at",
      width: 170,
      render: formatDateTimeText,
    },
  ];

  const detailAgreement = agreementDetail?.agreement;

  return (
    <PageScaffold
      title={t("legalAgreements.pageTitle", "法务协议")}
      description={t(
        "legalAgreements.pageDescription",
        "管理保密协议等商务法务文档，客户主体来自客户档案，协议保存签署时快照。",
      )}
      variant="list"
      density="compact"
      headerExtra={
        <Space>
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={loadRecords}
          >
            {t("legalAgreements.action.reload", "重新加载数据")}
          </Button>
          <Button
            type="primary"
            icon={<FileAddOutlined />}
            onClick={openCreateDrawer}
          >
            {t("legalAgreements.action.newAgreement", "新建协议")}
          </Button>
        </Space>
      }
    >
      <div className={styles.pageShell}>
        <div className={styles.toolbar}>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t(
              "legalAgreements.searchPlaceholder",
              "搜索编号、标题、合作方、项目或状态",
            )}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <div className={styles.summaryStrip}>
            <div>
              <Text type="secondary">
                {t("legalAgreements.summary.count", "记录数")}
              </Text>
              <strong>{filteredRecords.length}</strong>
            </div>
            <div>
              <Text type="secondary">
                {t("legalAgreements.summary.draft", "草稿")}
              </Text>
              <strong>{draftCount}</strong>
            </div>
            <div>
              <Text type="secondary">
                {t("legalAgreements.summary.signed", "已签署")}
              </Text>
              <strong>{signedCount}</strong>
            </div>
          </div>
        </div>

        {loadError ? (
          <Alert
            type="warning"
            showIcon
            message={loadError}
            description={getLegalAgreementLoadErrorDescription(loadError)}
            action={
              <Button size="small" loading={loading} onClick={loadRecords}>
                {t("legalAgreements.action.retry", "重试")}
              </Button>
            }
          />
        ) : null}

        <div className={styles.tableWrap}>
          <Table<LegalAgreementRecord>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={filteredRecords}
            onRow={(record) => ({
              className: styles.clickableRow,
              onClick: () => {
                void openDetailDrawer(record);
              },
            })}
            scroll={{ x: 1180 }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t("legalAgreements.empty", "暂无法务协议")}
                />
              ),
            }}
          />
        </div>
      </div>

      <Drawer
        width="min(1480px, 98vw)"
        open={drawerOpen}
        title={
          editingDetail
            ? t("legalAgreements.drawer.editTitle", "编辑保密协议草稿")
            : t("legalAgreements.drawer.newTitle", "新建保密协议")
        }
        destroyOnClose
        onClose={() => {
          setDrawerOpen(false);
          setEditingDetail(undefined);
        }}
        extra={
          <Space>
            <Button
              icon={<PrinterOutlined />}
              onClick={() =>
                printHtmlDocument(previewHtml, currentDraft.agreementTitle)
              }
            >
              {t("legalAgreements.action.printPreview", "打印预览")}
            </Button>
            <Button
              icon={<FileWordOutlined />}
              loading={exportingWord}
              onClick={() =>
                void handleExportWord(
                  previewHtml,
                  currentDraft.agreementTitle,
                  editingDetail?.agreement.agreement_no,
                )
              }
            >
              {t("legalAgreements.action.exportWord", "导出 Word")}
            </Button>
            <Button
              onClick={() => {
                setDrawerOpen(false);
                setEditingDetail(undefined);
              }}
            >
              {t("legalAgreements.action.cancel", "取消")}
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSave}
            >
              {t("legalAgreements.action.saveDraft", "保存草稿")}
            </Button>
          </Space>
        }
      >
        <div className={styles.drawerLayout}>
          <section className={styles.formPanel}>
            <div className={styles.panelHeader}>
              <h2>{t("legalAgreements.panel.formTitle", "协议要素")}</h2>
              <Tag icon={<FileProtectOutlined />}>
                {t("legalAgreements.tag.nda", "NDA")}
              </Tag>
            </div>
            <Form
              form={form}
              layout="vertical"
              className={styles.formGrid}
              onValuesChange={() => setFormRevision((value) => value + 1)}
            >
              <Form.Item
                name="customerName"
                label={t("legalAgreements.field.counterparty", "合作方")}
                rules={[
                  {
                    required: true,
                    message: t(
                      "legalAgreements.field.counterpartyRequired",
                      "请选择或填写合作方",
                    ),
                  },
                ]}
                className={styles.wide}
              >
                <AutoComplete
                  allowClear
                  options={customerNameOptions}
                  placeholder={t(
                    "legalAgreements.field.counterpartyPlaceholder",
                    "搜索客户或直接输入",
                  )}
                  notFoundContent={
                    customerLoading ? <Spin size="small" /> : null
                  }
                  onSearch={(value) => {
                    setCustomerKeyword(value);
                    setSelectedCustomer(undefined);
                  }}
                  onSelect={(_value, option) =>
                    applyCustomerOption(
                      (
                        option as {
                          customerOption?: LegalCustomerOption;
                        }
                      ).customerOption,
                    )
                  }
                />
              </Form.Item>
              <Form.Item
                name="internalEntityCode"
                label={t("legalAgreements.field.ourEntity", "我方主体")}
                rules={[
                  {
                    required: true,
                    message: t(
                      "legalAgreements.field.ourEntityRequired",
                      "请选择我方主体",
                    ),
                  },
                ]}
              >
                <Select
                  showSearch
                  loading={internalEntityLoading}
                  optionFilterProp="label"
                  options={internalEntityOptions}
                />
              </Form.Item>
              <Form.Item
                name="customerUscc"
                label={t("legalAgreements.field.uscc", "统一社会信用代码")}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="customerLegalRep"
                label={t("legalAgreements.field.legalRep", "法定代表人")}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="customerAddress"
                label={t("legalAgreements.field.address", "合作方地址")}
                className={styles.wide}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="customerContactName"
                label={t("legalAgreements.field.contactName", "联系人")}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="customerContactPhone"
                label={t("legalAgreements.field.contactPhone", "联系电话")}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="customerContactEmail"
                label={t("legalAgreements.field.contactEmail", "联系邮箱")}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="agreementTitle"
                label={t("legalAgreements.field.title", "协议标题")}
                rules={[
                  {
                    required: true,
                    message: t(
                      "legalAgreements.field.titleRequired",
                      "请填写协议标题",
                    ),
                  },
                ]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="agreementType"
                label={t("legalAgreements.field.type", "协议类型")}
                rules={[
                  {
                    required: true,
                    message: t(
                      "legalAgreements.field.typeRequired",
                      "请选择协议类型",
                    ),
                  },
                ]}
              >
                <Select
                  options={[
                    {
                      label: t("legalAgreements.type.nda", "保密协议"),
                      value: "NDA",
                    },
                    {
                      label: t("legalAgreements.type.dpa", "数据处理协议"),
                      value: "DPA",
                    },
                    {
                      label: t(
                        "legalAgreements.type.serviceAgreement",
                        "服务协议",
                      ),
                      value: "SERVICE_AGREEMENT",
                    },
                    {
                      label: t(
                        "legalAgreements.type.cooperationAgreement",
                        "合作协议",
                      ),
                      value: "COOPERATION_AGREEMENT",
                    },
                    {
                      label: t("legalAgreements.type.other", "其他协议"),
                      value: "OTHER",
                    },
                  ]}
                />
              </Form.Item>
              <Form.Item
                name="projectName"
                label={t("legalAgreements.field.projectName", "项目名称")}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="cooperationMatter"
                label={t("legalAgreements.field.cooperationMatter", "合作事项")}
                className={styles.wide}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="agreementDate"
                label={t("legalAgreements.field.agreementDate", "协议日期")}
              >
                <Input type="date" />
              </Form.Item>
              <Form.Item
                name="signingPlace"
                label={t("legalAgreements.field.signingPlace", "签署地点")}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="confidentialityYears"
                label={t(
                  "legalAgreements.field.confidentialityYears",
                  "保密年限",
                )}
              >
                <InputNumber min={1} max={50} className={styles.fullInput} />
              </Form.Item>
              <Form.Item
                name="returnDestroyDays"
                label={t(
                  "legalAgreements.field.returnDestroyDays",
                  "返还销毁天数",
                )}
              >
                <InputNumber min={1} max={365} className={styles.fullInput} />
              </Form.Item>
              <Form.Item
                name="breachPenaltyType"
                label={t("legalAgreements.field.breachPenalty", "违约责任")}
              >
                <Select
                  onChange={(value) => {
                    form.setFieldsValue({
                      breachPenaltyAmount:
                        value === "FIXED_AMOUNT"
                          ? form.getFieldValue("breachPenaltyAmount")
                          : undefined,
                      breachPenaltyPercent:
                        value === "PERCENT_OF_DEAL"
                          ? form.getFieldValue("breachPenaltyPercent")
                          : undefined,
                    });
                    setFormRevision((next) => next + 1);
                  }}
                  options={[
                    {
                      label: t(
                        "legalAgreements.breachPenalty.actualLoss",
                        "按实际损失",
                      ),
                      value: "ACTUAL_LOSS",
                    },
                    {
                      label: t(
                        "legalAgreements.breachPenalty.fixedAmount",
                        "固定金额",
                      ),
                      value: "FIXED_AMOUNT",
                    },
                    {
                      label: t(
                        "legalAgreements.breachPenalty.percentOfDeal",
                        "合作金额比例",
                      ),
                      value: "PERCENT_OF_DEAL",
                    },
                    {
                      label: t(
                        "legalAgreements.breachPenalty.none",
                        "不约定固定违约金",
                      ),
                      value: "NONE",
                    },
                  ]}
                />
              </Form.Item>
              {breachPenaltyType === "FIXED_AMOUNT" ? (
                <Form.Item
                  name="breachPenaltyAmount"
                  label={t(
                    "legalAgreements.field.breachPenaltyAmount",
                    "固定违约金(元)",
                  )}
                >
                  <MoneyInput min={0} minWidth={260} />
                </Form.Item>
              ) : null}
              {breachPenaltyType === "PERCENT_OF_DEAL" ? (
                <Form.Item
                  name="breachPenaltyPercent"
                  label={t(
                    "legalAgreements.field.breachPenaltyPercent",
                    "合作金额比例(%)",
                  )}
                >
                  <InputNumber
                    min={0}
                    max={1000}
                    precision={2}
                    addonAfter="%"
                    className={styles.fullInput}
                  />
                </Form.Item>
              ) : null}
              <Form.Item
                name="disputeResolutionType"
                label={t("legalAgreements.field.disputeResolution", "争议解决")}
              >
                <Select
                  options={[
                    {
                      label: t("legalAgreements.dispute.litigation", "诉讼"),
                      value: "LITIGATION",
                    },
                    {
                      label: t("legalAgreements.dispute.arbitration", "仲裁"),
                      value: "ARBITRATION",
                    },
                  ]}
                />
              </Form.Item>
              <Form.Item
                name="disputeResolutionOrg"
                label={t(
                  "legalAgreements.field.disputeResolutionOrg",
                  "管辖法院或仲裁机构",
                )}
                className={styles.wide}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="externalNote"
                label={t("legalAgreements.field.externalNote", "对外备注")}
                className={styles.wide}
              >
                <Input.TextArea rows={3} />
              </Form.Item>
              <Form.Item
                name="internalNote"
                label={t("legalAgreements.field.internalNote", "内部备注")}
                className={styles.wide}
              >
                <Input.TextArea rows={3} />
              </Form.Item>
            </Form>
          </section>

          <section className={styles.previewPanel}>
            <div className={styles.panelHeader}>
              <h2>{t("legalAgreements.panel.previewTitle", "文档预览")}</h2>
              <div className={styles.previewActions}>
                <Tag>
                  {getCounterparty(currentDraft)?.companyName ||
                    t("legalAgreements.noCounterparty", "未填写合作方")}
                </Tag>
                <Button
                  size="small"
                  icon={<PrinterOutlined />}
                  onClick={() =>
                    printHtmlDocument(previewHtml, currentDraft.agreementTitle)
                  }
                >
                  {t("legalAgreements.action.print", "打印")}
                </Button>
                <Button
                  size="small"
                  icon={<FileWordOutlined />}
                  loading={exportingWord}
                  onClick={() =>
                    void handleExportWord(
                      previewHtml,
                      currentDraft.agreementTitle,
                      editingDetail?.agreement.agreement_no,
                    )
                  }
                >
                  {t("legalAgreements.action.exportWord", "导出 Word")}
                </Button>
              </div>
            </div>
            <iframe
              title={t("legalAgreements.previewTitle", "协议预览")}
              className={styles.previewFrame}
              srcDoc={previewHtml}
            />
          </section>
        </div>
      </Drawer>

      <Drawer
        width="min(980px, 96vw)"
        open={detailOpen}
        title={
          detailAgreement?.agreement_title ||
          t("legalAgreements.detail.title", "协议详情")
        }
        onClose={() => setDetailOpen(false)}
        extra={
          agreementDetail ? (
            <Space>
              <Button
                icon={<PrinterOutlined />}
                disabled={detailLoading}
                onClick={() =>
                  printHtmlDocument(
                    detailPreviewHtml,
                    agreementDetail.agreement.agreement_title,
                  )
                }
              >
                {t("legalAgreements.action.print", "打印")}
              </Button>
              <Button
                icon={<FileWordOutlined />}
                loading={exportingWord}
                disabled={detailLoading}
                onClick={() =>
                  void handleExportWord(
                    detailPreviewHtml,
                    agreementDetail.agreement.agreement_title,
                    agreementDetail.agreement.agreement_no,
                  )
                }
              >
                {t("legalAgreements.action.exportWord", "导出 Word")}
              </Button>
              {detailAgreement?.status === "DRAFT" ? (
                <Button
                  icon={<EditOutlined />}
                  disabled={detailLoading}
                  onClick={() => openEditDrawer(agreementDetail)}
                >
                  {t("legalAgreements.action.editDraft", "编辑草稿")}
                </Button>
              ) : null}
            </Space>
          ) : null
        }
      >
        <Spin spinning={detailLoading}>
          <div className={styles.detailLayout}>
            {detailError ? (
              <Alert
                type="warning"
                showIcon
                message={detailError}
                description={getLegalAgreementLoadErrorDescription(detailError)}
              />
            ) : null}

            {detailAgreement ? (
              <>
                <section className={styles.detailSection}>
                  <div className={styles.panelHeader}>
                    <h2>{t("legalAgreements.detail.basicInfo", "基础信息")}</h2>
                    <Tag
                      color={
                        formatLegalAgreementStatus(detailAgreement.status).color
                      }
                    >
                      {formatLegalAgreementStatus(detailAgreement.status).label}
                    </Tag>
                  </div>
                  <Descriptions
                    bordered
                    size="small"
                    column={{ xs: 1, sm: 1, md: 2 }}
                    className={styles.detailDescriptions}
                  >
                    <Descriptions.Item
                      label={t(
                        "legalAgreements.detail.agreementNo",
                        "协议编号",
                      )}
                    >
                      {detailAgreement.agreement_no}
                    </Descriptions.Item>
                    <Descriptions.Item
                      label={t(
                        "legalAgreements.detail.agreementType",
                        "协议类型",
                      )}
                    >
                      {formatLegalAgreementType(detailAgreement.agreement_type)}
                    </Descriptions.Item>
                    <Descriptions.Item
                      label={t("legalAgreements.detail.counterparty", "合作方")}
                    >
                      {detailAgreement.primary_party_name_snapshot || "-"}
                    </Descriptions.Item>
                    <Descriptions.Item
                      label={t(
                        "legalAgreements.detail.projectName",
                        "项目名称",
                      )}
                    >
                      {detailAgreement.project_name || "-"}
                    </Descriptions.Item>
                    <Descriptions.Item
                      label={t(
                        "legalAgreements.detail.cooperationMatter",
                        "合作事项",
                      )}
                      span={2}
                    >
                      {detailAgreement.cooperation_matter || "-"}
                    </Descriptions.Item>
                    <Descriptions.Item
                      label={t(
                        "legalAgreements.detail.agreementDate",
                        "协议日期",
                      )}
                    >
                      {formatDateText(detailAgreement.agreement_date)}
                    </Descriptions.Item>
                    <Descriptions.Item
                      label={t("legalAgreements.detail.signedDate", "签署日期")}
                    >
                      {formatDateText(detailAgreement.signed_date)}
                    </Descriptions.Item>
                    <Descriptions.Item
                      label={t(
                        "legalAgreements.detail.confidentialityYears",
                        "保密年限",
                      )}
                    >
                      {detailAgreement.confidentiality_years
                        ? t("legalAgreements.yearUnit", "{count} 年", {
                            count: detailAgreement.confidentiality_years,
                          })
                        : "-"}
                    </Descriptions.Item>
                    <Descriptions.Item
                      label={t(
                        "legalAgreements.detail.returnDestroy",
                        "返还销毁",
                      )}
                    >
                      {detailAgreement.return_destroy_days
                        ? t("legalAgreements.dayUnit", "{count} 天", {
                            count: detailAgreement.return_destroy_days,
                          })
                        : "-"}
                    </Descriptions.Item>
                    <Descriptions.Item
                      label={t(
                        "legalAgreements.detail.disputeResolution",
                        "争议解决",
                      )}
                      span={2}
                    >
                      {[
                        detailAgreement.dispute_resolution_type ===
                        "ARBITRATION"
                          ? t("legalAgreements.dispute.arbitration", "仲裁")
                          : t("legalAgreements.dispute.litigation", "诉讼"),
                        detailAgreement.dispute_resolution_org,
                        detailAgreement.dispute_resolution_place,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "-"}
                    </Descriptions.Item>
                    <Descriptions.Item
                      label={t(
                        "legalAgreements.detail.internalNote",
                        "内部备注",
                      )}
                      span={2}
                    >
                      {detailAgreement.internal_note || "-"}
                    </Descriptions.Item>
                  </Descriptions>
                </section>

                <section className={styles.detailSection}>
                  <div className={styles.panelHeader}>
                    <h2>{t("legalAgreements.detail.preview", "合同预览")}</h2>
                    <Button
                      size="small"
                      icon={<PrinterOutlined />}
                      disabled={detailLoading}
                      onClick={() =>
                        printHtmlDocument(
                          detailPreviewHtml,
                          detailAgreement.agreement_title,
                        )
                      }
                    >
                      {t("legalAgreements.action.print", "打印")}
                    </Button>
                    <Button
                      size="small"
                      icon={<FileWordOutlined />}
                      loading={exportingWord}
                      disabled={detailLoading}
                      onClick={() =>
                        void handleExportWord(
                          detailPreviewHtml,
                          detailAgreement.agreement_title,
                          detailAgreement.agreement_no,
                        )
                      }
                    >
                      {t("legalAgreements.action.exportWord", "导出 Word")}
                    </Button>
                  </div>
                  <iframe
                    title={t("legalAgreements.detail.preview", "合同预览")}
                    className={`${styles.previewFrame} ${styles.detailPreviewFrame}`}
                    srcDoc={detailPreviewHtml}
                  />
                </section>

                <section className={styles.detailSection}>
                  <div className={styles.panelHeader}>
                    <h2>{t("legalAgreements.detail.parties", "签署方")}</h2>
                    <Tag>{agreementDetail?.parties.length || 0}</Tag>
                  </div>
                  <Table<LegalAgreementPartyRecord>
                    rowKey="id"
                    size="small"
                    columns={partyColumns}
                    dataSource={agreementDetail?.parties || []}
                    pagination={false}
                    scroll={{ x: 760 }}
                  />
                </section>

                <section className={styles.detailSection}>
                  <div className={styles.panelHeader}>
                    <h2>{t("legalAgreements.detail.documents", "生成文档")}</h2>
                    <Tag>{agreementDetail?.documents.length || 0}</Tag>
                  </div>
                  <Table<LegalDocumentRecord>
                    rowKey="id"
                    size="small"
                    columns={documentColumns}
                    dataSource={agreementDetail?.documents || []}
                    pagination={false}
                    scroll={{ x: 760 }}
                  />
                </section>

                <section className={styles.detailSection}>
                  <div className={styles.panelHeader}>
                    <h2>{t("legalAgreements.detail.statusLog", "状态日志")}</h2>
                    <Tag>{agreementDetail?.statusLogs.length || 0}</Tag>
                  </div>
                  <Table<LegalStatusLogRecord>
                    rowKey="id"
                    size="small"
                    columns={statusLogColumns}
                    dataSource={agreementDetail?.statusLogs || []}
                    pagination={false}
                    scroll={{ x: 760 }}
                  />
                </section>
              </>
            ) : null}
          </div>
        </Spin>
      </Drawer>
    </PageScaffold>
  );
}
