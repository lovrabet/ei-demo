/**
 * title: 审批中心
 * @modified 合并待我审批和我已审批，通过 Tab 切换
 */
import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileDoneOutlined,
} from "@ant-design/icons";
import { Card, Space, Statistic } from "antd";
import ProjectTabs from "@/components/project-tabs";
import { ApprovalTodoList } from "../my-todo";
import { ApprovalDoneList } from "../my-done";
import styles from "./index.module.css";

type ApprovalTab = "todo" | "done";

function normalizeTab(value: string | null): ApprovalTab {
  return value === "done" ? "done" : "todo";
}

const ApprovalCenter: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [todoTotal, setTodoTotal] = useState<number>();
  const [doneTotal, setDoneTotal] = useState<number>();
  const activeTab = normalizeTab(searchParams.get("tab"));
  const approvalTotal =
    todoTotal !== undefined && doneTotal !== undefined
      ? todoTotal + doneTotal
      : undefined;

  const items = useMemo(
    () => [
      {
        key: "todo",
        forceRender: true,
        label: "待我审批",
        children: <ApprovalTodoList embedded onTotalChange={setTodoTotal} />,
      },
      {
        key: "done",
        forceRender: true,
        label: "我已审批",
        children: <ApprovalDoneList embedded onTotalChange={setDoneTotal} />,
      },
    ],
    [],
  );

  const changeTab = (key: string) => {
    setSearchParams({ tab: normalizeTab(key) }, { replace: true });
  };

  return (
    <Card
      className={styles.card}
      title={
        <div className={styles.titleBlock}>
          <Space size={10}>
            <AuditOutlined className={styles.titleIcon} />
            <span>审批中心</span>
          </Space>
          <span className={styles.subtitle}>
            集中处理待办任务，并查看已完成的审批记录
          </span>
        </div>
      }
    >
      <div className={styles.statistics} aria-label="审批统计">
        <div className={styles.statisticCard}>
          <FileDoneOutlined className={styles.totalIcon} />
          <Statistic title="审批总量" value={approvalTotal ?? "--"} />
        </div>
        <div className={styles.statisticCard}>
          <ClockCircleOutlined className={styles.todoIcon} />
          <Statistic title="待我审批" value={todoTotal ?? "--"} />
        </div>
        <div className={styles.statisticCard}>
          <CheckCircleOutlined className={styles.doneIcon} />
          <Statistic title="我已审批" value={doneTotal ?? "--"} />
        </div>
      </div>
      <ProjectTabs
        className={styles.tabs}
        activeKey={activeTab}
        items={items}
        onChange={changeTab}
      />
    </Card>
  );
};

ApprovalCenter.displayName = "审批中心";

export default ApprovalCenter;
