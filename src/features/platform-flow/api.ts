/**
 * Lovrabet 平台原生审批流（Flowable）运行态 API。
 *
 * 前端经 apiRequest 直连 runtime.lovrabet.com（credentials: include），
 * 不经过 BFF —— BFF 沙箱（GraalVM）无 http/fetch，无法桥接平台接口。
 *
 * 业务单据 CREATE 被平台拦截自动发起审批（SmartDataDispatcher），
 * 审批状态由平台回写到主单的 flow_status / instance_status / running_node 等字段。
 */
import { apiRequest } from "@/utils/api";
import { lovrabetClient } from "@/api/client";

export const PLATFORM_APP_CODE = "app-4d050189";

/** 平台流程绑定的数据集 → 业务类型（与 scripts/migrate_flows.py BINDINGS 对齐） */
export const PLATFORM_DATASET_BIZ_TYPE: Record<string, string> = {
  "7851365c96244a1896e834daec447ddb": "expense",
  "7da208a5059b4b13896d7c7ae29c8492": "payment",
  "53869993f80f45ae8ef6cdf051d8e355": "contract",
  "28494f18f334400c893576b6e168d3f6": "travel",
  "235e11a9cb7945c8926b4d31fe64843f": "salary_payment",
  "ae51202c44e140828ba87e4571094d1a": "invoice",
  "804e3a5ed3224074be329b9ed4799cc3": "crm_contract",
};

export type PlatformTaskRecord = {
  /** 平台任务 ID（approve/reject 时作为 taskId） */
  id: string;
  /** 节点名称，如 "报销审核" */
  name: string;
  taskDefinitionKey?: string;
  assignee?: string;
  assigneeName?: string;
  processInstanceId: string;
  flowCode?: string;
  flowName?: string;
  datasetCode?: string;
  pageId?: number;
  dataId?: number;
  detailUrl?: string;
  taskStatus?: string;
  processStatus?: string;
  initiatorUserId?: string;
  initiatorUsername?: string;
  createTime?: number;
  processStartTime?: number;
  endTime?: number;
};

export type PlatformPaging = {
  currentPage: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

type PagedResponse<T> = {
  success: boolean;
  errorMsg?: string;
  data?: { records?: T[] } & Partial<PlatformPaging>;
};

async function fetchTasks<T>(path: string): Promise<{
  records: T[];
  paging: PlatformPaging;
}> {
  const res = (await apiRequest(path)) as PagedResponse<T>;
  if (!res?.success) {
    throw new Error(res?.errorMsg || "平台审批接口调用失败");
  }
  const data = res.data || {};
  return {
    records: data.records || [],
    paging: {
      currentPage: data.currentPage || 1,
      pageSize: data.pageSize || 20,
      totalCount: data.totalCount || 0,
      totalPages: data.totalPages || 0,
    },
  };
}

/** 我的平台待办任务 */
export function fetchPlatformTodo(currentPage = 1, pageSize = 20) {
  return fetchTasks<PlatformTaskRecord>(
    `/api/approve/todo?appCode=${PLATFORM_APP_CODE}&currentPage=${currentPage}&pageSize=${pageSize}`,
  );
}

/** 我已完成的平台审批任务 */
export function fetchPlatformDone(currentPage = 1, pageSize = 20) {
  return fetchTasks<PlatformTaskRecord>(
    `/api/approve/task/completed?appCode=${PLATFORM_APP_CODE}&currentPage=${currentPage}&pageSize=${pageSize}`,
  );
}

/** 平台审批动作（通过 / 驳回） */
export async function approvePlatformTask(params: {
  taskId: string;
  approved: boolean;
  comment?: string;
}): Promise<void> {
  const res = (await apiRequest("/api/flow/approve", {
    method: "POST",
    body: JSON.stringify({
      taskId: params.taskId,
      approved: params.approved,
      comment: params.comment || "",
      variables: {},
    }),
  })) as { success: boolean; errorMsg?: string };
  if (!res?.success) {
    throw new Error(res?.errorMsg || "审批操作失败");
  }
}

export type PlatformTimelineTask = {
  taskId?: string | null;
  assignee?: string;
  assigneeName?: string;
  startTime?: number;
  endTime?: number;
  status?: string;
  approvalResult?: string | null;
  cancelReason?: string | null;
  comments?: {
    userId?: string;
    name?: string;
    type?: string;
    fullMessage?: string;
    time?: number;
  }[];
};

export type PlatformTimelineStep = {
  order: number;
  nodeKey: string;
  nodeName: string;
  nodeType: string;
  status?: string;
  approvalResult?: string | null;
  startTime?: number;
  endTime?: number;
  tasks?: PlatformTimelineTask[];
};

export type PlatformTimeline = {
  processInstanceId: string;
  flowCode?: string;
  flowName?: string;
  datasetCode?: string;
  dataId?: number;
  startUserId?: string;
  startUserName?: string;
  startTime?: number;
  endTime?: number;
  status?: string;
  cancelReason?: string | null;
  steps?: PlatformTimelineStep[];
};

/** 流程实例时间线（用于单据详情页审批进度展示） */
export async function fetchPlatformTimeline(
  processInstanceId: string,
): Promise<PlatformTimeline> {
  const res = (await apiRequest(
    `/api/flow/${encodeURIComponent(processInstanceId)}/timeline`,
  )) as { success: boolean; errorMsg?: string; data?: PlatformTimeline };
  if (!res?.success || !res.data) {
    throw new Error(res?.errorMsg || "获取审批时间线失败");
  }
  return res.data;
}

/** 平台任务的业务摘要补全字段（各主表的标题/金额/申请人列） */
export const PLATFORM_BIZ_SUMMARY_FIELDS: Record<
  string,
  { title: string; amount: string; applicant: string }
> = {
  expense: {
    title: "title",
    amount: "total_cny_amount",
    applicant: "applicant_name_snapshot",
  },
  payment: {
    title: "title",
    amount: "amount",
    applicant: "applicant_name_snapshot",
  },
  contract: {
    title: "contract_name",
    amount: "amount",
    applicant: "applicant_name_snapshot",
  },
  travel: {
    title: "title",
    amount: "estimated_amount",
    applicant: "applicant_name_snapshot",
  },
  salary_payment: {
    title: "title",
    amount: "amount",
    applicant: "applicant_name_snapshot",
  },
  invoice: {
    title: "application_title",
    amount: "requested_total_amount",
    applicant: "applicant_name_snapshot",
  },
  crm_contract: {
    title: "title",
    amount: "amount",
    applicant: "applicant_name_snapshot",
  },
};

/** 补全了业务摘要的平台任务行（待办页/工作台共用） */
export type PlatformTaskSummary = {
  key: string;
  bizType: string;
  bizId: number;
  /** 当前审批节点名称 */
  nodeName: string;
  flowName: string;
  title: string;
  applicantName: string;
  amount?: number;
  createdAt: number;
  platformTaskId: string;
  processInstanceId: string;
};

/** 业务摘要（BFF 已归一化为 title/amount/applicant/flowStatus/instanceStatus） */
type BizSummary = {
  id: number;
  title: string;
  amount: number;
  applicant: string;
  flowStatus?: string;
  instanceStatus?: string;
};

/**
 * 批量回查业务摘要：聚合所有 (datasetCode, dataId) 后调一次 cpoBizSummaryBatch BFF，
 * 由 BFF 在服务端并行查各主表 —— 浏览器只有 1 次请求，不再逐数据集 filter。
 */
async function batchFetchBizSummaries(
  records: PlatformTaskRecord[],
): Promise<Map<string, BizSummary>> {
  const refsByDataset = new Map<string, Set<number>>();
  for (const r of records) {
    const bizType = PLATFORM_DATASET_BIZ_TYPE[r.datasetCode || ""] || "";
    const bizId = Number(r.dataId) || 0;
    if (!bizType || !r.datasetCode || !bizId) continue;
    if (!PLATFORM_BIZ_SUMMARY_FIELDS[bizType]) continue;
    const ids = refsByDataset.get(r.datasetCode) || new Set<number>();
    ids.add(bizId);
    refsByDataset.set(r.datasetCode, ids);
  }
  const result = new Map<string, BizSummary>();
  if (refsByDataset.size === 0) return result;
  try {
    const resp = await lovrabetClient.bff.execute<{
      summaries?: Record<string, BizSummary>;
    }>({
      scriptName: "cpoBizSummaryBatch",
      params: {
        refs: [...refsByDataset.entries()].map(([datasetCode, ids]) => ({
          datasetCode,
          ids: [...ids],
        })),
      },
    });
    for (const [key, value] of Object.entries(resp?.summaries || {})) {
      result.set(key, value);
    }
  } catch {
    // 摘要补全失败时保留平台基础信息
  }
  return result;
}

/** 平台任务记录 → 展示行（批量回查主表补全标题/金额/申请人） */
export async function summarizePlatformTasks(
  records: PlatformTaskRecord[],
): Promise<PlatformTaskSummary[]> {
  const summaries = await batchFetchBizSummaries(records);
  return records.map((r) => {
    const bizType = PLATFORM_DATASET_BIZ_TYPE[r.datasetCode || ""] || "";
    const bizId = Number(r.dataId) || 0;
    const base: PlatformTaskSummary = {
      key: `platform-${r.id}`,
      bizType,
      bizId,
      nodeName: r.name || "审批",
      flowName: r.flowName || "",
      title: r.flowName ? `${r.flowName} #${bizId}` : `#${bizId}`,
      applicantName: r.initiatorUsername || "",
      createdAt: Number(r.createTime || r.processStartTime) || 0,
      platformTaskId: r.id,
      processInstanceId: r.processInstanceId,
    };
    const rec = summaries.get(`${r.datasetCode}:${bizId}`);
    if (!rec) return base;
    return {
      ...base,
      title: rec.title || base.title,
      applicantName: rec.applicant || base.applicantName || "-",
      amount: Number(rec.amount) || undefined,
    };
  });
}

/** 加载我的平台待办（含业务摘要，按创建时间倒序） */
export async function loadPlatformTodoSummaries(): Promise<
  PlatformTaskSummary[]
> {
  const { records } = await fetchPlatformTodo(1, 100);
  const rows = await summarizePlatformTasks(records);
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

/** 平台"我发起的"流程实例记录 */
export type PlatformSubmittedRecord = {
  processInstanceId: string;
  flowCode?: string;
  flowName?: string;
  datasetCode?: string;
  pageId?: number;
  dataId?: number;
  startTime?: number;
  endTime?: number;
  /** RUNNING / COMPLETED / CANCELLED（注意：驳回的实例也是 COMPLETED，要看业务表 flow_status） */
  status?: string;
  cancelReason?: string | null;
  currentNodeNames?: string[];
  currentNodes?: {
    nodeKey: string;
    nodeName: string;
    nodeType: string;
    status: string;
    approvers?: { userId: string; userName: string }[];
  }[];
  detailUrl?: string;
};

/** 我发起的平台流程实例（服务端分页） */
export function fetchPlatformSubmitted(currentPage = 1, pageSize = 20) {
  return fetchTasks<PlatformSubmittedRecord>(
    `/api/flow/process/submitted?appCode=${PLATFORM_APP_CODE}&currentPage=${currentPage}&pageSize=${pageSize}`,
  );
}

/** 撤销（取消）运行中的流程实例 —— 平台侧相当于 legacy 的"作废" */
export async function cancelPlatformProcess(params: {
  processInstanceId: string;
  reason?: string;
}): Promise<void> {
  const res = (await apiRequest("/api/flow/process/cancel", {
    method: "POST",
    body: JSON.stringify({
      appCode: PLATFORM_APP_CODE,
      processInstanceId: params.processInstanceId,
      reason: params.reason || "申请人撤销",
    }),
  })) as { success: boolean; errorMsg?: string };
  if (!res?.success) {
    throw new Error(res?.errorMsg || "撤销流程失败");
  }
}

/** 批量回查业务摘要（一次 BFF 调用；供我提交的等非任务型记录使用） */
export async function fetchBizSummaries(
  records: { datasetCode?: string; dataId?: number }[],
): Promise<Map<string, BizSummary>> {
  return batchFetchBizSummaries(records as PlatformTaskRecord[]);
}

let appUsersCache: Map<string, string> | null = null;

/**
 * 应用成员 userId → username 映射（平台 /api/user/query-user-app-relation）。
 * 用于把流程回写的审批人 userId 解析成姓名；模块级缓存一次拉取。
 */
export async function fetchAppUsersMap(): Promise<Map<string, string>> {
  if (appUsersCache) return appUsersCache;
  try {
    const res = (await apiRequest("/api/user/query-user-app-relation", {
      method: "POST",
      body: JSON.stringify({ appCode: PLATFORM_APP_CODE, status: "ENABLE" }),
    })) as {
      success: boolean;
      errorMsg?: string;
      data?: { userId?: string | number; username?: string }[];
    };
    const rows = Array.isArray(res?.data) ? res.data : [];
    const map = new Map<string, string>();
    for (const row of rows) {
      const id = String(row.userId ?? "").trim();
      const name = String(row.username ?? "").trim();
      if (id && name) map.set(id, name);
    }
    appUsersCache = map;
    return map;
  } catch {
    appUsersCache = new Map();
    return appUsersCache;
  }
}

/** 平台流程状态 → 展示文案/颜色 */export function platformInstanceStatusMeta(status?: string): {
  label: string;
  color: string;
} {
  switch ((status || "").toUpperCase()) {
    case "RUNNING":
      return { label: "审批中", color: "processing" };
    case "COMPLETED":
      return { label: "已完成", color: "success" };
    case "CANCELLED":
      return { label: "已撤销", color: "default" };
    default:
      return { label: status || "-", color: "default" };
  }
}

export function platformFlowStatusMeta(status?: string): {
  label: string;
  color: string;
} {
  switch ((status || "").toUpperCase()) {
    case "SUBMITTED":
      return { label: "审批中", color: "processing" };
    case "COMPLETED":
      return { label: "已通过", color: "success" };
    case "REJECTED":
      return { label: "已驳回", color: "error" };
    case "CANCELLED":
      return { label: "已撤销", color: "default" };
    default:
      return { label: status || "-", color: "default" };
  }
}
