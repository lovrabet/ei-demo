/**
 * Title: 企业采购与财务审批样板
 */
import { Button, Tag, Typography } from "antd";
import {
  ApartmentOutlined,
  ArrowRightOutlined,
  AuditOutlined,
  BankOutlined,
  FileDoneOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  InboxOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import { $i18n } from "@/i18n";
import styles from "./index.module.css";

const { Title, Paragraph, Text } = Typography;

const t = (key: string, fallbackText: string) => $i18n.t(key, fallbackText);

const quickEntries = [
  {
    title: t("nav.workbench", "工作台"),
    description: t("home.quick.workbenchDesc", "查看待办、申请和经营概览"),
    path: "/workbench",
    icon: <ApartmentOutlined />,
  },
  {
    title: t("nav.approvalCenter", "审批中心"),
    description: t("home.quick.approvalCenterDesc", "统一处理平台 Flow 待办与已办"),
    path: "/approval-center",
    icon: <AuditOutlined />,
  },
  {
    title: t("nav.applicationList", "申请单汇总"),
    description: t("home.quick.applicationListDesc", "按状态检索各类业务单据"),
    path: "/application-list",
    icon: <FileSearchOutlined />,
  },
  {
    title: t("nav.expenseForm", "新建报销"),
    description: t("home.quick.expenseFormDesc", "体验发票识别与规则校验"),
    path: "/expense-form",
    icon: <FileDoneOutlined />,
  },
];

const capabilities = [
  {
    key: "expense",
    title: t("home.capability.expense.title", "费用报销"),
    description: t(
      "home.capability.expense.desc",
      "识别票面信息，匹配金额、时限与费用类别规则，标记异常并拦截重复报销。",
    ),
    path: "/expense-form",
    action: t("home.capability.expense.action", "发起报销"),
    icon: <FileDoneOutlined />,
    className: styles.capabilityExpense,
  },
  {
    key: "contract",
    title: t("home.capability.contract.title", "合同审查"),
    description: t(
      "home.capability.contract.desc",
      "覆盖主体授权、价税资金、交付验收、知识产权和违约解除等风险维度。",
    ),
    path: "/contracts",
    action: t("home.capability.contract.action", "进入合同工作台"),
    icon: <SafetyCertificateOutlined />,
    className: styles.capabilityContract,
  },
  {
    key: "invoice",
    title: t("home.capability.invoice.title", "发票查重与登记"),
    description: t(
      "home.capability.invoice.desc",
      "定位冲突单据，统一管理进销项发票、开票申请和归档状态。",
    ),
    path: "/invoice-center",
    action: t("home.capability.invoice.action", "查看发票中心"),
    icon: <InboxOutlined />,
    className: styles.capabilityInvoice,
  },
  {
    key: "salary",
    title: t("home.capability.salary.title", "工资发放"),
    description: t(
      "home.capability.salary.desc",
      "解析工资表，校验月份与合计，并按主体拆分生成付款申请。",
    ),
    path: "/salary-payment-form",
    action: t("nav.salaryPaymentForm", "新建工资付款"),
    icon: <BankOutlined />,
    className: styles.capabilitySalary,
  },
  {
    key: "customer",
    title: t("home.capability.customer.title", "客户 360 与应收"),
    description: t(
      "home.capability.customer.desc",
      "整合机会、合同、收款和跟进信息，辅助判断催收优先级。",
    ),
    path: "/customer-360",
    action: t("home.capability.customer.action", "查看客户视图"),
    icon: <TeamOutlined />,
    className: styles.capabilityCustomer,
  },
  {
    key: "workflow",
    title: t("home.capability.workflow.title", "平台原生审批流转"),
    description: t(
      "home.capability.workflow.desc",
      "单据提交后进入平台 Flow，由流程驱动节点处理、状态回写、批量审批和飞书通知。",
    ),
    path: "/approval-center",
    action: t("home.capability.workflow.action", "处理审批"),
    icon: <AuditOutlined />,
    className: styles.capabilityWorkflow,
  },
];

const architectureLayers = [
  {
    title: t("home.layer.frontend.title", "业务前端"),
    meta: "React 18 + TypeScript + Vite 7",
    description: t(
      "home.layer.frontend.desc",
      "负责业务申请、工作台、审批中心和各类业务视图。",
    ),
    icon: <FileTextOutlined />,
  },
  {
    title: t("home.layer.data.title", "Lovrabet 数据与业务层"),
    meta: t("home.layer.data.meta", "42 个数据模型 + BFF"),
    description: t(
      "home.layer.data.desc",
      "Instant API 连接数据，ENDPOINT 编排业务，Policy 统一路由与拦截。",
    ),
    icon: <ApartmentOutlined />,
  },
  {
    title: t("home.layer.flow.title", "平台 Flow 与 AI Agent"),
    meta: t("home.layer.flow.meta", "流程驱动 + AI 全程参与"),
    description: t(
      "home.layer.flow.desc",
      "统一审批流转，支持规则核验、风险识别、批量处理与消息通知。",
    ),
    icon: <RobotOutlined />,
  },
];

const boundaries = [
  t(
    "home.boundary.flow",
    "所有审批类单据统一由平台原生 Flow 发起、流转和回写，不再维护自研审批状态机。",
  ),
  t(
    "home.boundary.dal",
    "数据表与 Custom SQL 统一由平台 DAL 按物理表名和唯一资源名解析，业务代码不再维护资源 UUID 映射。",
  ),
  t(
    "home.boundary.policy",
    "行级读取与写入管控统一由 Instant API Policy 路由、拒绝规则和平台角色执行。",
  ),
];

function HomePage() {
  return (
    <main className={styles.homepage}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroCopy}>
          <Text className={styles.eyebrow}>
            {t("home.eyebrow", "Lovrabet 企业智能应用样板")}
          </Text>
          <Title id="home-title" level={1} className={styles.heroTitle}>
            {t("home.heroTitle", "AI 原生的企业采购与财务审批样板")}
          </Title>
          <Paragraph className={styles.heroText}>
            {t(
              "home.heroText",
              "把规则、流程与 AI 放进每一张业务单据，覆盖申请、审查、审批和归档。",
            )}
          </Paragraph>
          <div className={styles.heroActions}>
            <Link to="/workbench">
              <Button type="primary" size="large" icon={<ApartmentOutlined />}>
                {t("home.enterWorkbench", "进入工作台")}
              </Button>
            </Link>
            <Button
              size="large"
              icon={<RobotOutlined />}
              href="https://app-4d050189.app.lovrabet.com/chat"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("home.agentDigitalEmployee", "Agent 数字员工")}
            </Button>
          </div>
        </div>

        <figure className={styles.heroVisual}>
          <img
            src="/enterprise-workflow-hero.jpg"
            alt={t(
              "home.heroImageAlt",
              "合同、发票与审批印章组成的企业流程工作台",
            )}
            width="1448"
            height="1086"
            fetchPriority="high"
          />
          <figcaption>
            <RobotOutlined aria-hidden="true" />
            {t("home.heroCaption", "规则系统强制，流程系统驱动，AI 全程参与")}
          </figcaption>
        </figure>
      </section>

      <nav
        className={styles.quickEntries}
        aria-label={t("home.quickEntriesAria", "常用业务入口")}
      >
        {quickEntries.map((entry) => (
          <Link key={entry.path} to={entry.path} className={styles.quickEntry}>
            <span className={styles.entryIcon}>{entry.icon}</span>
            <span>
              <strong>{entry.title}</strong>
              <small>{entry.description}</small>
            </span>
            <ArrowRightOutlined className={styles.entryArrow} />
          </Link>
        ))}
      </nav>

      <section className={styles.section} aria-labelledby="capability-title">
        <header className={styles.sectionHeader}>
          <Title id="capability-title" level={2}>
            {t("home.capabilityTitle", "AI 深入六个高频业务场景")}
          </Title>
          <Paragraph>
            {t(
              "home.capabilitySubtitle",
              "不是在系统旁边增加一个问答框，而是在数据读写、规则核验和审批流转中直接参与。",
            )}
          </Paragraph>
        </header>

        <div className={styles.capabilityGrid}>
          {capabilities.map((capability) => (
            <article
              key={capability.key}
              className={`${styles.capabilityCard} ${capability.className}`}
            >
              <span className={styles.capabilityIcon}>{capability.icon}</span>
              <div>
                <Title level={3}>{capability.title}</Title>
                <Paragraph>{capability.description}</Paragraph>
              </div>
              <Link to={capability.path} className={styles.textLink}>
                {capability.action} <ArrowRightOutlined />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section
        className={styles.architectureSection}
        aria-labelledby="architecture-title"
      >
        <div className={styles.architectureIntro}>
          <Text className={styles.sectionKicker}>
            {t("home.architectureKicker", "默认架构")}
          </Text>
          <Title id="architecture-title" level={2}>
            {t("home.architectureTitle", "守卫在数据层，流程在平台层")}
          </Title>
          <Paragraph>
            {t(
              "home.architectureDesc",
              "即使绕过前端界面，业务规则仍由 BFF 在数据读写侧执行。审批状态由平台 Flow 统一驱动和回写。",
            )}
          </Paragraph>
          <div className={styles.factRow}>
            <div>
              <strong>27</strong>
              <span>COMMON</span>
            </div>
            <div>
              <strong>43</strong>
              <span>ENDPOINT</span>
            </div>
            <div>
              <strong>16</strong>
              <span>POLICY</span>
            </div>
          </div>
        </div>

        <div className={styles.architectureStack}>
          {architectureLayers.map((layer) => (
            <article key={layer.title} className={styles.architectureLayer}>
              <span className={styles.layerIcon}>{layer.icon}</span>
              <div>
                <div className={styles.layerHeading}>
                  <strong>{layer.title}</strong>
                  <Tag>{layer.meta}</Tag>
                </div>
                <p>{layer.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        className={styles.boundarySection}
        aria-labelledby="boundary-title"
      >
        <div>
          <FileSearchOutlined className={styles.boundaryIcon} />
          <Title id="boundary-title" level={2}>
            {t("home.boundaryTitle", "标准实现边界")}
          </Title>
          <Paragraph>
            {t(
              "home.boundaryDesc",
              "本项目只展示当前推荐的标准实现，同时保留以下明确的工程边界。",
            )}
          </Paragraph>
        </div>
        <ol className={styles.boundaryList}>
          {boundaries.map((boundary) => (
            <li key={boundary}>{boundary}</li>
          ))}
        </ol>
      </section>

      <footer className={styles.footer}>
        <span>
          {t("home.footer.disclaimer", "所有业务数据均为演示用虚构数据。")}
        </span>
        <span>
          {t("home.footer.license", "基于 Lovrabet 平台构建，采用 MIT 开源协议。")}
        </span>
      </footer>
    </main>
  );
}

export default HomePage;
