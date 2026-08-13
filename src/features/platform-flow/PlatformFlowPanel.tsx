/**
 * 平台原生审批流面板（单据 360 详情页用）。
 *
 * 主单带 process_instance_id 时挂载：展示平台 Flowable 流程时间线，
 * 当前用户有待办任务时提供 通过/驳回 操作（直连 runtime /api/flow/approve）。
 * legacy 自建状态机的审批 UI 对平台单据为空，由本面板接管。
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  Button,
  Input,
  Modal,
  Space,
  Spin,
  Steps,
  Tag,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  StopOutlined,
} from "@ant-design/icons";
import {
  approvePlatformTask,
  fetchPlatformTimeline,
  fetchPlatformTodo,
  platformFlowStatusMeta,
  type PlatformTaskRecord,
  type PlatformTimeline,
} from "./api";
import { formatDateValue } from "@/features/cpo-application-detail/format";

type Props = {
  processInstanceId: string;
  /** 主单上的平台回写字段（用于状态展示） */
  flowStatus?: string;
  instanceStatus?: string;
  runningNode?: string;
  /** 审批动作完成后回调（父级重载单据） */
  onChanged?: () => Promise<void> | void;
};

function stepStatus(stepStatus?: string, approvalResult?: string | null) {
  const s = (stepStatus || "").toUpperCase();
  if (s === "RUNNING" || s === "PENDING") return "process" as const;
  if ((approvalResult || "").toUpperCase() === "REJECTED") return "error" as const;
  if (s === "COMPLETED") return "finish" as const;
  if (s === "CANCELLED") return "wait" as const;
  return "wait" as const;
}

function describeStep(step: PlatformTimeline["steps"] extends (infer S)[] ? S : never): string {
  const parts: string[] = [];
  const task = step.tasks?.find((t) => t.assigneeName || t.assignee);
  if (task?.assigneeName) parts.push(`处理人：${task.assigneeName}`);
  const comment = step.tasks
    ?.flatMap((t) => t.comments || [])
    .map((c) => c.fullMessage)
    .filter(Boolean)
    .join("；");
  if (comment) parts.push(comment);
  if (step.endTime) parts.push(formatDateValue(step.endTime, true));
  else if (step.startTime) parts.push(formatDateValue(step.startTime, true));
  return parts.join(" · ");
}

export const PlatformFlowPanel: React.FC<Props> = ({
  processInstanceId,
  flowStatus,
  onChanged,
}) => {
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState<PlatformTimeline | null>(null);
  const [myTask, setMyTask] = useState<PlatformTaskRecord | null>(null);
  const [actionModal, setActionModal] = useState<{
    approved: boolean;
  } | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tl, todo] = await Promise.all([
        fetchPlatformTimeline(processInstanceId),
        fetchPlatformTodo(1, 100).catch(() => ({
          records: [] as PlatformTaskRecord[],
          paging: {
            currentPage: 1,
            pageSize: 100,
            totalCount: 0,
            totalPages: 0,
          },
        })),
      ]);
      setTimeline(tl);
      setMyTask(
        todo.records.find(
          (r) => r.processInstanceId === processInstanceId,
        ) || null,
      );
    } catch (e: any) {
      message.error(`加载审批进度失败：${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }, [processInstanceId]);

  useEffect(() => {
    load();
  }, [load]);

  const submitAction = async () => {
    if (!actionModal || !myTask) return;
    setSubmitting(true);
    try {
      await approvePlatformTask({
        taskId: myTask.id,
        approved: actionModal.approved,
        comment: comment.trim(),
      });
      message.success(actionModal.approved ? "已通过" : "已驳回");
      setActionModal(null);
      setComment("");
      await onChanged?.();
      await load();
    } catch (e: any) {
      message.error(`审批操作失败：${e?.message || e}`);
    } finally {
      setSubmitting(false);
    }
  };

  const statusMeta = platformFlowStatusMeta(flowStatus || timeline?.status);
  const steps = (timeline?.steps || []).filter(
    (s) => s.nodeType !== "START" && s.nodeType !== "END",
  );
  const terminalStep = (timeline?.steps || []).find(
    (s) => s.nodeType === "END",
  );

  return (
    <section
      id="platform-flow"
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: "16px 20px",
        marginBottom: 16,
      }}
      aria-label="平台审批流程"
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Space size={8}>
          <span style={{ fontWeight: 600 }}>审批流程</span>
          <Tag color="geekblue">平台审批</Tag>
          {timeline?.flowName ? <Tag>{timeline.flowName}</Tag> : null}
        </Space>
        <Space size={8}>
          <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
          {timeline?.cancelReason ? (
            <Tag icon={<StopOutlined />}>{timeline.cancelReason}</Tag>
          ) : null}
        </Space>
      </div>

      <Spin spinning={loading}>
        {steps.length ? (
          <Steps
            direction="vertical"
            size="small"
            current={steps.findIndex(
              (s) => (s.status || "").toUpperCase() === "RUNNING",
            )}
            items={[
              ...steps.map((s) => ({
                title: (
                  <Space size={8}>
                    <span>{s.nodeName}</span>
                    {(s.approvalResult || "").toUpperCase() === "APPROVED" ? (
                      <CheckCircleOutlined style={{ color: "#34c759" }} />
                    ) : null}
                    {(s.approvalResult || "").toUpperCase() === "REJECTED" ? (
                      <CloseCircleOutlined style={{ color: "#ff3b30" }} />
                    ) : null}
                  </Space>
                ),
                status: stepStatus(s.status, s.approvalResult),
                description: describeStep(s),
              })),
              ...(terminalStep &&
              (timeline?.status || "").toUpperCase() !== "RUNNING"
                ? [
                    {
                      title:
                        (terminalStep as any).result === "REJECTED" ||
                        (terminalStep.nodeName || "").includes("驳回")
                          ? "流程已驳回"
                          : (timeline?.status || "").toUpperCase() ===
                              "CANCELLED"
                            ? "流程已撤销"
                            : "流程已完成",
                      status: stepStatus(
                        terminalStep.status,
                        (terminalStep as any).result,
                      ),
                      description: terminalStep.endTime
                        ? formatDateValue(terminalStep.endTime, true)
                        : "",
                    },
                  ]
                : []),
            ]}
          />
        ) : (
          <div style={{ color: "#86868b", padding: "8px 0" }}>
            {loading ? "加载中…" : "暂无审批节点信息"}
          </div>
        )}
      </Spin>

      {myTask ? (
        <div style={{ marginTop: 12 }}>
          <Space>
            <Tag color="processing">当前节点：{myTask.name}</Tag>
            <Button
              type="primary"
              onClick={() => setActionModal({ approved: true })}
            >
              通过
            </Button>
            <Button danger onClick={() => setActionModal({ approved: false })}>
              驳回
            </Button>
          </Space>
        </div>
      ) : null}

      <Modal
        title={actionModal?.approved ? "通过审批" : "驳回审批"}
        open={!!actionModal}
        onCancel={() => {
          setActionModal(null);
          setComment("");
        }}
        onOk={submitAction}
        confirmLoading={submitting}
        okText="确认"
        cancelText="取消"
      >
        <Input.TextArea
          rows={3}
          placeholder="审批意见（可选）"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </Modal>
    </section>
  );
};

export default PlatformFlowPanel;
