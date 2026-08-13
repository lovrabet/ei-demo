/**
 * title: 收款合同详情
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Timeline,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ArrowLeftOutlined,
  EditOutlined,
  PlusOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import { lovrabetClient } from "@/api/client";
import PageScaffold from "@/components/page-scaffold/PageScaffold";
import { queryRuntimeFileUrl } from "@/features/attachments/api";
import PlatformFlowPanel from "@/features/platform-flow/PlatformFlowPanel";
import { formatDateValue } from "@/features/cpo-application-detail/format";
import {
  advanceApplicationWorkflow,
  getApplicationDetail,
} from "@/features/cpo-application-detail/api";
import type {
  ApplicationDetailResponse,
  WorkflowAvailableAction,
} from "@/features/cpo-application-detail/types";
import OutgoingInvoiceDrawer from "@/features/crm-domain/OutgoingInvoiceDrawer";
import ReceivablePlanDrawer from "@/features/crm-domain/ReceivablePlanDrawer";
import { getReceivableContractDetail } from "@/features/crm-domain/api";
import type {
  CustomerReceipt,
  ReceivableContractDetailResponse,
  ReceivablePlan,
} from "@/features/crm-domain/types";
import styles from "./detail.module.css";

const { Text, Title } = Typography;

function money(value?: number | null, currency = "CNY") {
  if (value === null || value === undefined) return "待补全";
  const prefix = currency === "CNY" ? "¥" : `${currency} `;
  return `${prefix}${Number(value).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function statusColor(status: string) {
  if (["RECEIVED", "COMPLETED", "SIGNED"].includes(status)) return "success";
  if (["CANCELLED", "NOT_REQUIRED"].includes(status)) return "default";
  if (["PARTIALLY_RECEIVED", "IN_PROGRESS"].includes(status))
    return "processing";
  if (["DRAFT", "PENDING"].includes(status)) return "warning";
  return "blue";
}

function receiptDateLabel(receipt: CustomerReceipt) {
  if (!receipt.receivedDate) return "到账日期待补";
  if (receipt.datePrecision === "month") {
    const month = String(receipt.receivedDate).slice(0, 7);
    const [year, value] = month.split("-");
    return year && value ? `${year}年${Number(value)}月` : month;
  }
  return formatDateValue(receipt.receivedDate) || "到账日期待补";
}

export default function ReceivableContractDetailPage() {
  const navigate = useNavigate();
  const params = useParams();
  const contractId = Number(params.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<ReceivableContractDetailResponse>();
  const [workflowDetail, setWorkflowDetail] =
    useState<ApplicationDetailResponse>();
  const [planDrawerOpen, setPlanDrawerOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ReceivablePlan>();
  const [invoiceDrawerOpen, setInvoiceDrawerOpen] = useState(false);
  const [receiptAllocationForm] = Form.useForm<{
    receivablePlanId: number;
    amount: number;
  }>();
  const [allocatingReceipt, setAllocatingReceipt] = useState<CustomerReceipt>();
  const [allocatingReceiptSaving, setAllocatingReceiptSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState<WorkflowAvailableAction>();
  const [actionComment, setActionComment] = useState("");
  const [acting, setActing] = useState(false);

  const openAttachment = async (filePath: string) => {
    try {
      const fileUrl = await queryRuntimeFileUrl(filePath);
      window.open(fileUrl, "_blank", "noopener,noreferrer");
    } catch (openError) {
      message.error(
        openError instanceof Error ? openError.message : "附件打开失败",
      );
    }
  };

  const load = async (background = false) => {
    if (!contractId) {
      setError("收款合同参数无效");
      setLoading(false);
      return;
    }
    if (!background) setLoading(true);
    setError("");
    try {
      const [detail, workflow] = await Promise.all([
        getReceivableContractDetail(contractId),
        getApplicationDetail("crm_contract", contractId).catch(() => undefined),
      ]);
      setData(detail);
      setWorkflowDetail(workflow);
    } catch (requestError) {
      const next =
        requestError instanceof Error
          ? requestError.message
          : "加载收款合同详情失败";
      setError(next);
      message.error(next);
    } finally {
      if (!background) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [contractId]);

  const openPlanDrawer = useCallback((plan?: ReceivablePlan) => {
    setEditingPlan(plan);
    setPlanDrawerOpen(true);
  }, []);

  const closePlanDrawer = () => {
    setPlanDrawerOpen(false);
    setEditingPlan(undefined);
  };

  const normalizedStatus = String(
    data?.contract.sign_status || "",
  ).toLowerCase();
  const workflowManaged = Number(data?.contract.workflow_managed) === 1;
  const commercialLocked =
    workflowManaged && ["submitted", "reviewed"].includes(normalizedStatus);
  const canCreateInvoice =
    !workflowManaged || ["signed", "completed"].includes(normalizedStatus);

  const openReceiptAllocation = (receipt: CustomerReceipt) => {
    const legacyAllocation = receipt.allocations?.find(
      (allocation) => !allocation.planId,
    );
    setAllocatingReceipt(receipt);
    receiptAllocationForm.setFieldsValue({
      amount:
        legacyAllocation?.amount || receipt.allocatedAmount || receipt.amount,
    });
  };

  const saveReceiptAllocation = async () => {
    if (!allocatingReceipt) return;
    const values = await receiptAllocationForm.validateFields();
    const legacyAllocation = allocatingReceipt.allocations?.find(
      (allocation) => !allocation.planId,
    );
    setAllocatingReceiptSaving(true);
    try {
      await lovrabetClient.bff.execute({
        scriptName: "cpoManageReceivableSettlement",
        params: {
          op: "allocateReceipt",
          crmContractId: contractId,
          receivablePlanId: values.receivablePlanId,
          receiptId: allocatingReceipt.id,
          amount: values.amount,
          ...(legacyAllocation?.id
            ? { sourceAllocationId: legacyAllocation.id }
            : {}),
        },
      });
      message.success("回款已核销到收款期次");
      setAllocatingReceipt(undefined);
      receiptAllocationForm.resetFields();
      await load(true);
    } catch (allocationError) {
      message.error(
        allocationError instanceof Error
          ? allocationError.message
          : "回款核销失败",
      );
    } finally {
      setAllocatingReceiptSaving(false);
    }
  };

  const performWorkflowAction = async () => {
    if (!pendingAction || !workflowDetail) return;
    if (pendingAction.commentRequired && !actionComment.trim()) {
      message.warning("请填写处理意见");
      return;
    }
    setActing(true);
    try {
      await advanceApplicationWorkflow({
        bizType: "crm_contract",
        bizId: contractId,
        taskId: workflowDetail.currentTask?.id,
        action: pendingAction.action,
        comment: actionComment.trim(),
      });
      message.success(`${pendingAction.label}成功`);
      setPendingAction(undefined);
      setActionComment("");
      await load(true);
    } catch (actionError) {
      message.error(
        actionError instanceof Error ? actionError.message : "流程处理失败",
      );
    } finally {
      setActing(false);
    }
  };

  const columns = useMemo<ColumnsType<ReceivablePlan>>(
    () => [
      {
        title: "期次",
        width: 130,
        render: (_, row) => (
          <div className={styles.stackCell}>
            <strong>{row.phase_name}</strong>
            <small>第 {row.phase_no} 期</small>
          </div>
        ),
      },
      {
        title: "计划收款",
        width: 150,
        render: (_, row) => money(row.planned_amount, row.currency),
      },
      {
        title: "计划日期",
        width: 130,
        render: (_, row) =>
          formatDateValue(row.planned_receipt_date) || "待补全",
      },
      {
        title: "状态",
        width: 120,
        render: (_, row) => (
          <Space size={4} wrap>
            <Tag color={statusColor(row.status)}>{row.statusLabel}</Tag>
            {row.data_quality_status === "NEEDS_COMPLETION" ? (
              <Tag color="warning">资料待补</Tag>
            ) : null}
          </Space>
        ),
      },
      {
        title: "计划开票",
        width: 190,
        render: (_, row) => (
          <div className={styles.stackCell}>
            <span>已开票 {money(row.invoiced_amount, row.currency)}</span>
          </div>
        ),
      },
      {
        title: "触发条件",
        dataIndex: "trigger_condition",
        ellipsis: true,
        render: (value) => value || "待补全",
      },
      {
        title: "操作",
        width: 86,
        fixed: "right",
        render: (_, row) => (
          <Button
            type="link"
            size="small"
            disabled={commercialLocked}
            onClick={() => openPlanDrawer(row)}
          >
            编辑
          </Button>
        ),
      },
    ],
    [commercialLocked, openPlanDrawer],
  );

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spin size="large" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <PageScaffold title="收款合同详情" variant="detail">
        <Alert
          type="error"
          showIcon
          message="无法加载合同"
          description={error}
        />
      </PageScaffold>
    );
  }

  const { contract, summary } = data;
  const receiptPercent = contract.amount
    ? Math.min(
        Math.round((summary.receivedAmount / contract.amount) * 100),
        100,
      )
    : 0;

  const platformPiid = workflowDetail?.biz?.process_instance_id
    ? String(workflowDetail.biz.process_instance_id)
    : "";

  return (
    <PageScaffold
      title={
        <div className={styles.pageTitle}>
          <Text type="secondary">收款合同</Text>
          <Title level={2}>{contract.title}</Title>
          <Space wrap>
            <Tag color="blue">我方提供服务 · 向客户收款</Tag>
            <Tag color={statusColor(contract.sign_status)}>
              {contract.signStatusLabel}
            </Tag>
            <Text type="secondary">{contract.contract_no}</Text>
          </Space>
        </div>
      }
      description="合同、客户、收款计划与销项发票统一维护。"
      variant="detail"
      headerExtra={
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/contracts")}
          >
            返回合同工作台
          </Button>
          <Button
            icon={<TeamOutlined />}
            onClick={() =>
              navigate(`/customer-360?companyId=${contract.company_id}`)
            }
          >
            客户 360
          </Button>
          <Button
            disabled={commercialLocked}
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openPlanDrawer()}
          >
            新增收款计划
          </Button>
          {workflowManaged &&
          ["draft", "rejected"].includes(normalizedStatus) ? (
            <Button
              icon={<EditOutlined />}
              onClick={() => navigate(`/sales-contract-form?id=${contract.id}`)}
            >
              编辑合同
            </Button>
          ) : null}
        </Space>
      }
    >
      {summary.needsCompletionCount ? (
        <Alert
          type="warning"
          showIcon
          message={`${summary.needsCompletionCount} 个历史期次待补全`}
          description="系统只按历史合同的期数生成了占位计划，没有推测金额、日期或触发条件。"
        />
      ) : null}

      <section className={styles.summaryGrid}>
        <Card size="small">
          <Text type="secondary">合同金额</Text>
          <strong>{money(contract.amount, contract.currency)}</strong>
          <small>{contract.companyName}</small>
        </Card>
        <Card size="small">
          <Text type="secondary">计划收款</Text>
          <strong>{money(summary.plannedAmount, contract.currency)}</strong>
          <small>{summary.planCount} 个有效期次</small>
        </Card>
        <Card size="small">
          <Text type="secondary">已开票</Text>
          <strong>{money(summary.invoiceAmount, contract.currency)}</strong>
          <small>{summary.invoiceCount} 张销项发票</small>
        </Card>
        <Card size="small">
          <Text type="secondary">已收款</Text>
          <strong>{money(summary.receivedAmount, contract.currency)}</strong>
          <Progress percent={receiptPercent} size="small" showInfo={false} />
        </Card>
      </section>

      <div className={styles.twoColumns}>
        <Card title="合同信息" extra={<EditOutlined />}>
          <Descriptions column={2} size="small">
            <Descriptions.Item label="客户">
              <Button
                type="link"
                className={styles.inlineLink}
                onClick={() =>
                  navigate(`/customer-360?companyId=${contract.company_id}`)
                }
              >
                {contract.companyName}
              </Button>
            </Descriptions.Item>
            <Descriptions.Item label="来源商机">
              {contract.opportunityName || "未关联商机"}
            </Descriptions.Item>
            <Descriptions.Item label="签署日期">
              {formatDateValue(contract.signed_date) || "待补"}
            </Descriptions.Item>
            <Descriptions.Item label="合同期限">
              {formatDateValue(contract.start_date) || "待补"} 至{" "}
              {formatDateValue(contract.end_date) || "待补"}
            </Descriptions.Item>
          </Descriptions>
        </Card>
        <Card title="客户联系人">
          {data.contacts.length ? (
            <div className={styles.contactList}>
              {data.contacts.map((contact) => (
                <div key={contact.id}>
                  <strong>{contact.name}</strong>
                  {contact.is_primary ? <Tag color="blue">主联系人</Tag> : null}
                  <small>
                    {[contact.dept, contact.title, contact.phone, contact.email]
                      .filter(Boolean)
                      .join(" · ") || "联系信息待补"}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无联系人"
            />
          )}
        </Card>
      </div>

      <Card title="合同附件">
        {data.attachments.length ? (
          <div className={styles.invoiceList}>
            {data.attachments.map((attachment) => (
              <button
                type="button"
                key={attachment.id}
                disabled={!attachment.filePath}
                onClick={() => void openAttachment(attachment.filePath)}
              >
                <span>{attachment.fileName}</span>
                <small>
                  {[
                    attachment.uploadedBy,
                    formatDateValue(attachment.createdAt),
                  ]
                    .filter(Boolean)
                    .join(" · ") || "附件信息待补"}
                </small>
              </button>
            ))}
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无合同附件"
          />
        )}
      </Card>

      <Card
        title="收款计划"
        extra={
          <Button
            type="link"
            icon={<PlusOutlined />}
            disabled={commercialLocked}
            onClick={() => openPlanDrawer()}
          >
            新增期次
          </Button>
        }
      >
        <Table<ReceivablePlan>
          rowKey="id"
          columns={columns}
          dataSource={data.plans}
          pagination={false}
          scroll={{ x: 980 }}
          locale={{ emptyText: "尚未配置收款计划" }}
        />
      </Card>

      <Card title={`回款记录 ${data.receipts.length}`}>
        {data.receipts.length ? (
          <div className={styles.receiptList}>
            {data.receipts.map((receipt) => (
              <article key={receipt.id} className={styles.receiptItem}>
                <div>
                  <strong>{receipt.title}</strong>
                  <Tag color="success">已到账</Tag>
                  {receipt.dataQualityStatus === "needs_completion" ? (
                    <Tag color="warning">资料待补</Tag>
                  ) : null}
                </div>
                <span>{receipt.receiptNo}</span>
                <strong>
                  {money(receipt.allocatedAmount, receipt.currency)}
                </strong>
                <small>
                  {[receiptDateLabel(receipt), receipt.bankReference]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
                {receipt.remark ? <small>{receipt.remark}</small> : null}
                <Button
                  type="link"
                  size="small"
                  onClick={() => openReceiptAllocation(receipt)}
                >
                  核销到收款期次
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="尚未登记回款"
          />
        )}
      </Card>

      <Card
        title="关联销项发票"
        extra={
          <Button
            type="link"
            icon={<PlusOutlined />}
            disabled={!canCreateInvoice}
            onClick={() => setInvoiceDrawerOpen(true)}
          >
            快速新增
          </Button>
        }
      >
        {data.invoices.length ? (
          <div className={styles.invoiceList}>
            {data.invoices.map((invoice) => (
              <button
                type="button"
                key={invoice.id}
                onClick={() => navigate(invoice.detailPath)}
              >
                <span>{invoice.title}</span>
                <small>
                  {money(invoice.amount, contract.currency)} ·{" "}
                  {formatDateValue(invoice.invoiceDate) || "开票日期待补"}
                </small>
              </button>
            ))}
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="尚未关联销项发票"
          />
        )}
      </Card>

      <OutgoingInvoiceDrawer
        open={invoiceDrawerOpen}
        contract={contract}
        company={data.company}
        plans={data.plans}
        onClose={() => setInvoiceDrawerOpen(false)}
        onSaved={() => load(true)}
      />

      <Modal
        open={Boolean(allocatingReceipt)}
        title="回款核销到收款期次"
        okText="确认核销"
        confirmLoading={allocatingReceiptSaving}
        onOk={() => void saveReceiptAllocation()}
        onCancel={() => {
          if (allocatingReceiptSaving) return;
          setAllocatingReceipt(undefined);
          receiptAllocationForm.resetFields();
        }}
      >
        <Alert
          type="info"
          showIcon
          message={allocatingReceipt?.title || "客户回款"}
          description="回款与开票分别核销；这里仅确认该笔到账对应哪个合同收款期次。"
          style={{ marginBottom: 16 }}
        />
        <Form form={receiptAllocationForm} layout="vertical">
          <Form.Item
            name="receivablePlanId"
            label="收款期次"
            rules={[{ required: true, message: "请选择收款期次" }]}
          >
            <Select
              options={data.plans
                .filter(
                  (plan) =>
                    !["received", "not_required", "cancelled"].includes(
                      String(plan.status).toLowerCase(),
                    ),
                )
                .map((plan) => ({
                  value: plan.id,
                  label: `${plan.phase_name || `第${plan.phase_no}期收款`} · ${money(plan.planned_amount, plan.currency)}`,
                }))}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label="本期核销金额"
            rules={[
              { required: true, message: "请输入核销金额" },
              { type: "number", min: 0.01, message: "金额必须大于 0" },
            ]}
          >
            <InputNumber min={0.01} precision={2} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>

      {!platformPiid ? (
        <Card
          title="审批与签署"
          extra={
            <Tag
              color={
                data.workflow.status === "completed" ? "success" : "processing"
              }
            >
              {data.workflow.statusLabel}
            </Tag>
          }
        >
          {data.workflow.actions.length ? (
            <Timeline
              items={data.workflow.actions.map((action) => ({
                color: action.action === "sign" ? "green" : "blue",
                children: (
                  <div className={styles.stackCell}>
                    <strong>{action.actionLabel}</strong>
                    <span>{action.actorName}</span>
                    <small>
                      {[formatDateValue(action.createdAt), action.comment]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </div>
                ),
              }))}
            />
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无审批记录"
            />
          )}
          {workflowDetail?.availableActions?.length ? (
            <Space wrap>
              {workflowDetail.availableActions.map((action) => (
                <Button
                  key={action.action}
                  type={action.danger ? "default" : "primary"}
                  danger={action.danger}
                  onClick={() => {
                    setActionComment("");
                    setPendingAction(action);
                  }}
                >
                  {action.label}
                </Button>
              ))}
            </Space>
          ) : null}
        </Card>
      ) : null}

      {platformPiid ? (
        <PlatformFlowPanel
          processInstanceId={platformPiid}
          flowStatus={String(workflowDetail?.biz?.flow_status || "")}
          instanceStatus={String(workflowDetail?.biz?.instance_status || "")}
          runningNode={String(workflowDetail?.biz?.running_node || "")}
          onChanged={() => load(true)}
        />
      ) : null}

      <Modal
        open={Boolean(pendingAction)}
        title={pendingAction?.label || "流程处理"}
        okText="确认"
        cancelText="取消"
        confirmLoading={acting}
        okButtonProps={{ danger: pendingAction?.danger }}
        onOk={() => void performWorkflowAction()}
        onCancel={() => !acting && setPendingAction(undefined)}
      >
        <Input.TextArea
          rows={4}
          value={actionComment}
          onChange={(event) => setActionComment(event.target.value)}
          placeholder={
            pendingAction?.commentRequired
              ? "请填写处理意见"
              : "处理意见（可选）"
          }
        />
      </Modal>

      <ReceivablePlanDrawer
        open={planDrawerOpen}
        contractId={contract.id}
        contractTitle={contract.title}
        companyName={contract.companyName}
        contractCurrency={contract.currency}
        plans={data.plans}
        plan={editingPlan}
        onClose={closePlanDrawer}
        onSaved={() => load(true)}
      />
    </PageScaffold>
  );
}

ReceivableContractDetailPage.displayName = "销售合同详情";
