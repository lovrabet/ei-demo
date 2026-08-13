/**
 * title: 客户 360
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Select,
  Space,
  Spin,
  Statistic,
  Tag,
  Timeline,
  Typography,
  message,
} from "antd";
import {
  EditOutlined,
  MailOutlined,
  PhoneOutlined,
  PlusOutlined,
  SearchOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import PageScaffold from "@/components/page-scaffold/PageScaffold";
import ProjectTabs from "@/components/project-tabs";
import { formatDateValue } from "@/features/cpo-application-detail/format";
import { getCustomer360, manageCustomer360 } from "@/features/crm-domain/api";
import type {
  Customer360Response,
  CustomerContact,
  CustomerReceipt,
} from "@/features/crm-domain/types";
import styles from "./index.module.css";

const { Text, Title } = Typography;

const STAGE_LABELS: Record<string, string> = {
  DISCOVERY: "需求发现",
  QUALIFICATION: "机会确认",
  PROPOSAL: "方案报价",
  NEGOTIATION: "商务谈判",
  CONTRACT: "合同阶段",
  WON: "已赢单",
  DELIVERY: "交付中",
  LOST: "已失单",
};

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  PENDING: "待签署",
  IN_PROGRESS: "签署中",
  SIGNED: "已签署",
  COMPLETED: "已完成",
  CANCELLED: "已作废",
};

function money(value?: number, currency = "CNY") {
  const prefix = currency === "CNY" ? "¥" : `${currency} `;
  return `${prefix}${Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function receiptDateLabel(receipt: CustomerReceipt) {
  if (!receipt.receivedDate) return "到账日期待补";
  if (receipt.datePrecision === "month") {
    const [year, month] = String(receipt.receivedDate).slice(0, 7).split("-");
    return year && month ? `${year}年${Number(month)}月` : receipt.receivedDate;
  }
  return formatDateValue(receipt.receivedDate) || "到账日期待补";
}

export default function Customer360Page() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const companyId = Number(searchParams.get("companyId")) || undefined;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [data, setData] = useState<Customer360Response>();
  const [companyOpen, setCompanyOpen] = useState(false);
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingContact, setEditingContact] = useState<CustomerContact>();
  const [companyForm] = Form.useForm();
  const [contactForm] = Form.useForm();
  const [followForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getCustomer360({ companyId, keyword });
      setData(response);
      if (
        response.selectedCustomer?.id &&
        companyId !== response.selectedCustomer.id
      ) {
        setSearchParams(
          { companyId: String(response.selectedCustomer.id) },
          { replace: true },
        );
      }
    } catch (requestError) {
      const next =
        requestError instanceof Error
          ? requestError.message
          : "加载客户 360 失败";
      setError(next);
      message.error(next);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [companyId, keyword]);

  const contactById = useMemo(
    () => new Map((data?.contacts || []).map((item) => [item.id, item])),
    [data?.contacts],
  );
  const opportunityById = useMemo(
    () => new Map((data?.opportunities || []).map((item) => [item.id, item])),
    [data?.opportunities],
  );

  const openCompany = () => {
    if (!data?.selectedCustomer) return;
    const company = data.selectedCustomer;
    companyForm.setFieldsValue({
      name: company.name,
      uscc: company.uscc,
      legalRep: company.legal_rep,
      industry: company.industry,
      regAddress: company.reg_address,
      businessScope: company.business_scope,
      statusCode: company.status_code,
    });
    setCreatingCompany(false);
    setCompanyOpen(true);
  };

  const openNewCompany = () => {
    companyForm.resetFields();
    companyForm.setFieldsValue({ statusCode: "LEAD" });
    setCreatingCompany(true);
    setCompanyOpen(true);
  };

  const openContact = (contact?: CustomerContact) => {
    setEditingContact(contact);
    contactForm.resetFields();
    if (contact) {
      contactForm.setFieldsValue({
        name: contact.name,
        title: contact.title,
        phone: contact.phone,
        email: contact.email,
        wechat: contact.wechat,
        dept: contact.dept,
        isPrimary: Boolean(contact.is_primary),
        remarks: contact.remarks,
      });
    }
    setContactOpen(true);
  };

  const saveCompany = async () => {
    if (!creatingCompany && !data?.selectedCustomer) return;
    const company = await companyForm.validateFields();
    setSaving(true);
    try {
      const result = await manageCustomer360({
        action: creatingCompany ? "create_company" : "update_company",
        companyId: creatingCompany ? undefined : data?.selectedCustomer?.id,
        company,
      });
      message.success(creatingCompany ? "客户已创建" : "客户信息已更新");
      setCompanyOpen(false);
      if (creatingCompany && result.companyId) {
        setKeyword("");
        setKeywordInput("");
        setSearchParams({ companyId: String(result.companyId) });
      } else {
        await load();
      }
    } catch (requestError) {
      message.error(
        requestError instanceof Error ? requestError.message : "保存失败",
      );
    } finally {
      setSaving(false);
    }
  };

  const saveContact = async () => {
    if (!data?.selectedCustomer) return;
    const contact = await contactForm.validateFields();
    setSaving(true);
    try {
      await manageCustomer360({
        action: "save_contact",
        companyId: data.selectedCustomer.id,
        contact: { id: editingContact?.id, ...contact },
      });
      message.success(editingContact ? "联系人已更新" : "联系人已添加");
      setContactOpen(false);
      await load();
    } catch (requestError) {
      message.error(
        requestError instanceof Error ? requestError.message : "保存失败",
      );
    } finally {
      setSaving(false);
    }
  };

  const saveFollowUp = async () => {
    const values = await followForm.validateFields();
    setSaving(true);
    try {
      await manageCustomer360({
        action: "create_follow_up",
        opportunityId: values.opportunityId,
        followUp: values,
      });
      message.success("跟进记录已添加");
      setFollowOpen(false);
      followForm.resetFields();
      await load();
    } catch (requestError) {
      message.error(
        requestError instanceof Error ? requestError.message : "保存失败",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageScaffold
      title="客户 360"
      description="客户资料、联系人、商机、跟进、收款合同与回款信息在同一工作台维护。"
      variant="list"
      density="compact"
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          message="客户数据加载失败"
          description={error}
        />
      ) : null}
      <div className={styles.workspace}>
        <aside className={styles.customerRail}>
          <div className={styles.railSearch}>
            <Input
              value={keywordInput}
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索客户"
              onChange={(event) => setKeywordInput(event.target.value)}
              onPressEnter={() => setKeyword(keywordInput.trim())}
            />
            <Button onClick={() => setKeyword(keywordInput.trim())}>
              查询
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              aria-label="新建客户"
              onClick={openNewCompany}
            />
          </div>
          {loading && !data ? (
            <div className={styles.railLoading}>
              <Spin />
            </div>
          ) : (
            <div className={styles.customerList}>
              {(data?.customers || []).map((customer) => (
                <button
                  type="button"
                  key={customer.id}
                  className={
                    customer.id === data?.selectedCustomer?.id
                      ? styles.customerActive
                      : undefined
                  }
                  onClick={() =>
                    setSearchParams({ companyId: String(customer.id) })
                  }
                >
                  <span className={styles.customerName}>{customer.name}</span>
                  <Tag bordered={false}>{customer.statusLabel}</Tag>
                  <small>
                    商机 {customer.opportunityCount} · 合同{" "}
                    {customer.contractCount}
                  </small>
                  <strong>{money(customer.contractAmount)}</strong>
                </button>
              ))}
              {!data?.customers.length ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无客户"
                />
              ) : null}
            </div>
          )}
        </aside>

        <main className={styles.customerMain}>
          {data?.selectedCustomer ? (
            <>
              <Card
                className={styles.profileCard}
                extra={
                  <Button
                    type="link"
                    icon={<EditOutlined />}
                    onClick={openCompany}
                  >
                    编辑客户
                  </Button>
                }
              >
                <div className={styles.profileHeading}>
                  <div>
                    <Text type="secondary">客户档案</Text>
                    <Title level={3}>{data.selectedCustomer.name}</Title>
                    <Space wrap>
                      <Tag color="blue">
                        {data.selectedCustomer.statusLabel}
                      </Tag>
                      {data.selectedCustomer.industry ? (
                        <Tag>{data.selectedCustomer.industry}</Tag>
                      ) : null}
                    </Space>
                  </div>
                  <div className={styles.statistics}>
                    <Statistic
                      title="商机"
                      value={data.summary.opportunityCount || 0}
                    />
                    <Statistic
                      title="收款合同"
                      value={data.summary.contractCount || 0}
                    />
                    <Statistic
                      title="合同金额"
                      value={data.summary.contractAmount || 0}
                      prefix="¥"
                      precision={2}
                    />
                    <Statistic
                      title="已收款"
                      value={data.summary.receivedAmount || 0}
                      prefix="¥"
                      precision={2}
                    />
                  </div>
                </div>
                <Descriptions
                  size="small"
                  column={2}
                  className={styles.profileDescriptions}
                >
                  <Descriptions.Item label="统一信用代码">
                    {data.selectedCustomer.uscc}
                  </Descriptions.Item>
                  <Descriptions.Item label="法定代表人">
                    {data.selectedCustomer.legal_rep || "待补"}
                  </Descriptions.Item>
                  <Descriptions.Item label="注册地址">
                    {data.selectedCustomer.reg_address || "待补"}
                  </Descriptions.Item>
                  <Descriptions.Item label="经营范围">
                    {data.selectedCustomer.business_scope || "待补"}
                  </Descriptions.Item>
                </Descriptions>
              </Card>

              <Card className={styles.businessCard}>
                <ProjectTabs
                  items={[
                    {
                      key: "opportunities",
                      label: `商机 ${data.opportunities.length}`,
                      children: data.opportunities.length ? (
                        <List
                          dataSource={data.opportunities}
                          renderItem={(opportunity) => (
                            <List.Item>
                              <List.Item.Meta
                                title={opportunity.name}
                                description={`${STAGE_LABELS[opportunity.stage] || opportunity.stage} · 预计 ${money(opportunity.amount, opportunity.currency)}`}
                              />
                              <Text type="secondary">
                                {opportunity.probability ?? 0}%
                              </Text>
                            </List.Item>
                          )}
                        />
                      ) : (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description="暂无商机"
                        />
                      ),
                    },
                    {
                      key: "contracts",
                      label: `收款合同 ${data.contracts.length}`,
                      children: data.contracts.length ? (
                        <List
                          dataSource={data.contracts}
                          renderItem={(contract) => (
                            <List.Item
                              actions={[
                                <Button
                                  key="detail"
                                  type="link"
                                  onClick={() => navigate(contract.detailPath)}
                                >
                                  详情
                                </Button>,
                              ]}
                            >
                              <List.Item.Meta
                                title={
                                  contract.title ||
                                  contract.contract_no ||
                                  "关联对象标题缺失"
                                }
                                description={`${contract.contract_no} · ${money(contract.amount, contract.currency)}`}
                              />
                              <Tag>
                                {CONTRACT_STATUS_LABELS[contract.sign_status] ||
                                  contract.sign_status}
                              </Tag>
                            </List.Item>
                          )}
                        />
                      ) : (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description="暂无收款合同"
                        />
                      ),
                    },
                    {
                      key: "plans",
                      label: `收款计划 ${data.plans.length}`,
                      children: data.plans.length ? (
                        <List
                          dataSource={data.plans}
                          renderItem={(plan) => (
                            <List.Item>
                              <List.Item.Meta
                                title={plan.phase_name}
                                description={`${formatDateValue(plan.planned_receipt_date) || "日期待补"} · ${plan.trigger_condition || "触发条件待补"}`}
                              />
                              <div className={styles.amountStack}>
                                <strong>
                                  {money(
                                    plan.planned_amount || 0,
                                    plan.currency,
                                  )}
                                </strong>
                                <small>{plan.status}</small>
                              </div>
                            </List.Item>
                          )}
                        />
                      ) : (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description="暂无收款计划"
                        />
                      ),
                    },
                    {
                      key: "receipts",
                      label: `回款记录 ${data.receipts.length}`,
                      children: data.receipts.length ? (
                        <List
                          dataSource={data.receipts}
                          renderItem={(receipt) => (
                            <List.Item>
                              <List.Item.Meta
                                title={receipt.title}
                                description={`${receipt.receiptNo} · ${receiptDateLabel(receipt)}`}
                              />
                              <div className={styles.amountStack}>
                                <strong>
                                  {money(
                                    receipt.allocatedAmount,
                                    receipt.currency,
                                  )}
                                </strong>
                                {receipt.dataQualityStatus ===
                                "needs_completion" ? (
                                  <Tag color="warning">资料待补</Tag>
                                ) : (
                                  <Tag color="success">已到账</Tag>
                                )}
                              </div>
                            </List.Item>
                          )}
                        />
                      ) : (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description="暂无回款记录"
                        />
                      ),
                    },
                  ]}
                />
              </Card>
            </>
          ) : (
            <Card className={styles.emptyMain}>
              <Empty description="请选择客户" />
            </Card>
          )}
        </main>

        <aside className={styles.relatedRail}>
          <Card
            title="联系人"
            size="small"
            extra={
              <Button
                type="link"
                size="small"
                icon={<PlusOutlined />}
                disabled={!data?.selectedCustomer}
                onClick={() => openContact()}
              >
                新增
              </Button>
            }
          >
            {data?.contacts.length ? (
              <div className={styles.contactList}>
                {data.contacts.map((contact) => (
                  <button
                    type="button"
                    key={contact.id}
                    onClick={() => openContact(contact)}
                  >
                    <span>
                      <UserOutlined /> {contact.name}{" "}
                      {contact.is_primary ? (
                        <Tag color="blue">主联系人</Tag>
                      ) : null}
                    </span>
                    <small>
                      {[contact.dept, contact.title]
                        .filter(Boolean)
                        .join(" · ") || "职位信息待补"}
                    </small>
                    {contact.phone ? (
                      <small>
                        <PhoneOutlined /> {contact.phone}
                      </small>
                    ) : null}
                    {contact.email ? (
                      <small>
                        <MailOutlined /> {contact.email}
                      </small>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无联系人"
              />
            )}
          </Card>
          <Card
            title="最近跟进"
            size="small"
            extra={
              <Button
                type="link"
                size="small"
                icon={<PlusOutlined />}
                disabled={!data?.opportunities.length}
                onClick={() => setFollowOpen(true)}
              >
                记录跟进
              </Button>
            }
          >
            {data?.followUps.length ? (
              <Timeline
                items={data.followUps.slice(0, 12).map((follow) => ({
                  children: (
                    <div className={styles.followItem}>
                      <strong>
                        {follow.subject || follow.content || "跟进记录"}
                      </strong>
                      <small>
                        {opportunityById.get(follow.opportunity_id)?.name ||
                          "关联机会标题缺失"}
                        {follow.contact_id
                          ? ` · ${contactById.get(follow.contact_id)?.name || "联系人标题缺失"}`
                          : ""}
                      </small>
                      <small>
                        {formatDateValue(follow.followed_at) || "时间待补"}
                      </small>
                      {follow.next_action ? (
                        <span>下一步：{follow.next_action}</span>
                      ) : null}
                    </div>
                  ),
                }))}
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无跟进记录"
              />
            )}
          </Card>
        </aside>
      </div>

      <Modal
        title={creatingCompany ? "新建客户" : "编辑客户信息"}
        open={companyOpen}
        confirmLoading={saving}
        onOk={() => void saveCompany()}
        onCancel={() => setCompanyOpen(false)}
        width={720}
      >
        <Form form={companyForm} layout="vertical">
          <div className={styles.modalGrid}>
            <Form.Item
              name="name"
              label="客户名称"
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="uscc"
              label="统一信用代码"
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item name="legalRep" label="法定代表人">
              <Input />
            </Form.Item>
            <Form.Item name="industry" label="所属行业">
              <Input />
            </Form.Item>
            <Form.Item name="statusCode" label="客户状态">
              <Select
                options={(data?.statuses || []).map((item) => ({
                  value: item.code,
                  label: item.name,
                }))}
              />
            </Form.Item>
            <Form.Item name="regAddress" label="注册地址">
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="businessScope" label="经营范围">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingContact ? "编辑联系人" : "新增联系人"}
        open={contactOpen}
        confirmLoading={saving}
        onOk={() => void saveContact()}
        onCancel={() => setContactOpen(false)}
        width={680}
      >
        <Form form={contactForm} layout="vertical">
          <div className={styles.modalGrid}>
            <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="title" label="职位">
              <Input />
            </Form.Item>
            <Form.Item name="dept" label="部门">
              <Input />
            </Form.Item>
            <Form.Item name="phone" label="电话">
              <Input />
            </Form.Item>
            <Form.Item name="email" label="邮箱">
              <Input />
            </Form.Item>
            <Form.Item name="wechat" label="微信">
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="isPrimary" label="是否主联系人">
            <Select
              options={[
                { value: true, label: "是" },
                { value: false, label: "否" },
              ]}
            />
          </Form.Item>
          <Form.Item name="remarks" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="记录客户跟进"
        open={followOpen}
        confirmLoading={saving}
        onOk={() => void saveFollowUp()}
        onCancel={() => setFollowOpen(false)}
        width={680}
      >
        <Form
          form={followForm}
          layout="vertical"
          initialValues={{ followType: "MEETING" }}
        >
          <Form.Item
            name="opportunityId"
            label="关联商机"
            rules={[{ required: true }]}
          >
            <Select
              options={(data?.opportunities || []).map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
          </Form.Item>
          <div className={styles.modalGrid}>
            <Form.Item name="contactId" label="关联联系人">
              <Select
                allowClear
                options={(data?.contacts || []).map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />
            </Form.Item>
            <Form.Item name="followType" label="跟进方式">
              <Select
                options={[
                  { value: "MEETING", label: "会议" },
                  { value: "CALL", label: "电话" },
                  { value: "VISIT", label: "拜访" },
                ]}
              />
            </Form.Item>
          </div>
          <Form.Item name="subject" label="摘要">
            <Input />
          </Form.Item>
          <Form.Item
            name="content"
            label="跟进纪要"
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="nextAction" label="下一步计划">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </PageScaffold>
  );
}

Customer360Page.displayName = "客户360";
