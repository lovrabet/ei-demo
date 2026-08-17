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
import styles from "./index.module.css";

const { Title, Paragraph, Text } = Typography;

const quickEntries = [
  {
    title: "工作台",
    description: "查看待办、申请和经营概览",
    path: "/workbench",
    icon: <ApartmentOutlined />,
  },
  {
    title: "审批中心",
    description: "统一处理平台 Flow 待办与已办",
    path: "/approval-center",
    icon: <AuditOutlined />,
  },
  {
    title: "申请单汇总",
    description: "按状态检索各类业务单据",
    path: "/application-list",
    icon: <FileSearchOutlined />,
  },
  {
    title: "新建报销",
    description: "体验发票识别与规则校验",
    path: "/expense-form",
    icon: <FileDoneOutlined />,
  },
];

const capabilities = [
  {
    key: "expense",
    title: "费用报销",
    description:
      "识别票面信息，匹配金额、时限与费用类别规则，标记异常并拦截重复报销。",
    path: "/expense-form",
    action: "发起报销",
    icon: <FileDoneOutlined />,
    className: styles.capabilityExpense,
  },
  {
    key: "contract",
    title: "合同审查",
    description:
      "覆盖主体授权、价税资金、交付验收、知识产权和违约解除等风险维度。",
    path: "/contracts",
    action: "进入合同工作台",
    icon: <SafetyCertificateOutlined />,
    className: styles.capabilityContract,
  },
  {
    key: "invoice",
    title: "发票查重与登记",
    description: "定位冲突单据，统一管理进销项发票、开票申请和归档状态。",
    path: "/invoice-center",
    action: "查看发票中心",
    icon: <InboxOutlined />,
    className: styles.capabilityInvoice,
  },
  {
    key: "salary",
    title: "工资发放",
    description: "解析工资表，校验月份与合计，并按主体拆分生成付款申请。",
    path: "/salary-payment-form",
    action: "新建工资付款",
    icon: <BankOutlined />,
    className: styles.capabilitySalary,
  },
  {
    key: "customer",
    title: "客户 360 与应收",
    description: "整合机会、合同、收款和跟进信息，辅助判断催收优先级。",
    path: "/customer-360",
    action: "查看客户视图",
    icon: <TeamOutlined />,
    className: styles.capabilityCustomer,
  },
  {
    key: "workflow",
    title: "平台原生审批流转",
    description:
      "单据提交后进入平台 Flow，由流程驱动节点处理、状态回写、批量审批和飞书通知。",
    path: "/approval-center",
    action: "处理审批",
    icon: <AuditOutlined />,
    className: styles.capabilityWorkflow,
  },
];

const architectureLayers = [
  {
    title: "业务前端",
    meta: "React 18 + TypeScript + Vite 7",
    description: "负责业务申请、工作台、审批中心和各类业务视图。",
    icon: <FileTextOutlined />,
  },
  {
    title: "Lovrabet 数据与业务层",
    meta: "44 个数据模型 + BFF",
    description:
      "Instant API 连接数据，ENDPOINT 编排业务，HOOK 在读写侧执行守卫。",
    icon: <ApartmentOutlined />,
  },
  {
    title: "平台 Flow 与 AI Agent",
    meta: "流程驱动 + AI 全程参与",
    description: "统一审批流转，支持规则核验、风险识别、批量处理与消息通知。",
    icon: <RobotOutlined />,
  },
];

const boundaries = [
  "BFF 创建的部分单据仍在迁移到平台原生 Flow，标准页面创建的记录已接入平台审批流。",
  "当前通过 cpoDatasetMap 与 cpoDal 管理数据集映射，后续将替换为平台统一 DAL。",
  "行级权限与写入管控目前依赖 Instant API Hooks，后续将收敛到平台 API 访问策略。",
];

function HomePage() {
  return (
    <main className={styles.homepage}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroCopy}>
          <Text className={styles.eyebrow}>Lovrabet 企业智能应用样板</Text>
          <Title id="home-title" level={1} className={styles.heroTitle}>
            AI 原生的企业采购与财务审批样板
          </Title>
          <Paragraph className={styles.heroText}>
            把规则、流程与 AI 放进每一张业务单据，覆盖申请、审查、审批和归档。
          </Paragraph>
          <div className={styles.heroActions}>
            <Link to="/workbench">
              <Button type="primary" size="large" icon={<ApartmentOutlined />}>
                进入工作台
              </Button>
            </Link>
            <Button
              size="large"
              icon={<RobotOutlined />}
              href="https://app-4d050189.app.lovrabet.com/chat"
              target="_blank"
              rel="noopener noreferrer"
            >
              Agent 数字员工
            </Button>
          </div>
        </div>

        <figure className={styles.heroVisual}>
          <img
            src="/enterprise-workflow-hero.jpg"
            alt="合同、发票与审批印章组成的企业流程工作台"
            width="1448"
            height="1086"
            fetchPriority="high"
          />
          <figcaption>
            <RobotOutlined aria-hidden="true" />
            规则系统强制，流程系统驱动，AI 全程参与
          </figcaption>
        </figure>
      </section>

      <nav className={styles.quickEntries} aria-label="常用业务入口">
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
            AI 深入六个高频业务场景
          </Title>
          <Paragraph>
            不是在系统旁边增加一个问答框，而是在数据读写、规则核验和审批流转中直接参与。
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
          <Text className={styles.sectionKicker}>默认架构</Text>
          <Title id="architecture-title" level={2}>
            守卫在数据层，流程在平台层
          </Title>
          <Paragraph>
            即使绕过前端界面，业务规则仍由 BFF 在数据读写侧执行。审批状态由平台
            Flow 统一驱动和回写。
          </Paragraph>
          <div className={styles.factRow}>
            <div>
              <strong>26</strong>
              <span>COMMON</span>
            </div>
            <div>
              <strong>35</strong>
              <span>ENDPOINT</span>
            </div>
            <div>
              <strong>122</strong>
              <span>HOOK</span>
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
            当前边界
          </Title>
          <Paragraph>
            这是持续演进的样板应用。以下能力已明确列入 README 的后续工作。
          </Paragraph>
        </div>
        <ol className={styles.boundaryList}>
          {boundaries.map((boundary) => (
            <li key={boundary}>{boundary}</li>
          ))}
        </ol>
      </section>

      <footer className={styles.footer}>
        <span>所有业务数据均为演示用虚构数据。</span>
        <span>基于 Lovrabet 平台构建，采用 MIT 开源协议。</span>
      </footer>
    </main>
  );
}

export default HomePage;
