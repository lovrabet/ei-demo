import { LOVRABET_APP_CODE } from "@/api/api";
import { lovrabetClient } from "@/api/client";

const RUNTIME_API_HOST = "https://runtime.lovrabet.com";

export type AttachmentBizType =
  | "expense"
  | "contract"
  | "crm_contract"
  | "payment"
  | "salary_payment"
  | "partner"
  | "travel"
  | "invoice"
  | "credential";

export type AttachmentType =
  | "invoice"
  | "contract_file"
  | "credential"
  | "bank_receipt"
  | "approval_material"
  | "payroll_sheet"
  | "other";

export type AttachmentFileValue = {
  id?: number;
  uid?: string;
  fileName: string;
  filePath: string;
  fileType?: string;
  sourceDir?: string;
  uploadedBy?: string;
};

export type AttachmentRecord = {
  id: number;
  file_name: string;
  file_path: string;
  file_type?: string | null;
  source_dir?: string | null;
  uploaded_by?: string | null;
};

type UploadRuntimeResponse = {
  success?: boolean;
  data?: {
    fileName?: string;
    filePath?: string;
    fileType?: string;
    sourceDir?: string;
  };
  errorMsg?: string;
  msg?: string;
};

type UploadLikeFile = {
  uid?: string;
  name?: string;
  type?: string;
  response?: UploadRuntimeResponse;
  fileName?: string;
  filePath?: string;
  fileType?: string;
  sourceDir?: string;
  id?: number;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function readWindow(): any {
  return typeof window === "undefined" ? undefined : window;
}

export function getRuntimeAppCode(): string {
  const runtimeCode = readWindow()?.__GLOBAL__?.appInfo?.appCode;
  const code =
    runtimeCode == null || String(runtimeCode).trim() === ""
      ? LOVRABET_APP_CODE
      : String(runtimeCode).trim();

  if (!code) {
    throw new Error("未获取到 appCode，无法上传文件");
  }

  return code;
}

export function getRuntimeApiHost(): string {
  return trimTrailingSlash(RUNTIME_API_HOST);
}

export async function uploadRuntimeFile(
  file: File,
): Promise<AttachmentFileValue> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("appCode", getRuntimeAppCode());

  const result = (await fetch(
    `${getRuntimeApiHost()}/api/common/uploadFile`,
    {
      method: "POST",
      credentials: "include",
      body: formData,
    },
  ).then((res) => res.json())) as UploadRuntimeResponse;

  if (!result?.success) {
    throw new Error(result?.errorMsg || result?.msg || "文件上传失败");
  }

  const normalized = normalizeAttachmentUploadFile({
    uid: file.name,
    name: file.name,
    type: file.type,
    response: result,
  });

  if (!normalized) {
    throw new Error("文件上传成功但未返回文件路径");
  }

  return normalized;
}

export async function queryRuntimeFileUrl(filePath: string): Promise<string> {
  if (!filePath) throw new Error("未获取到文件路径");

  const result = await fetch(
    `${getRuntimeApiHost()}/api/common/queryFileUrl`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath }),
    },
  ).then((res) => res.json());

  const fileUrl = result?.data?.fileUrl;
  if (!fileUrl)
    throw new Error(result?.errorMsg || result?.msg || "未获取到文件地址");
  return fileUrl;
}

export function normalizeAttachmentUploadFile(
  file: UploadLikeFile,
): AttachmentFileValue | null {
  const data = file.response?.data || file;
  const filePath = data.filePath;
  if (!filePath) return null;

  return {
    ...(file.id ? { id: Number(file.id) } : {}),
    fileName:
      data.fileName || file.name || filePath.split("/").pop() || filePath,
    filePath,
    ...(data.fileType || file.type
      ? { fileType: data.fileType || file.type }
      : {}),
    ...(data.sourceDir ? { sourceDir: data.sourceDir } : {}),
    ...(file.uid ? { uid: file.uid } : {}),
  };
}

export function attachmentRecordToValue(
  record: AttachmentRecord,
): AttachmentFileValue {
  return {
    id: Number(record.id),
    fileName: record.file_name,
    filePath: record.file_path,
    ...(record.file_type ? { fileType: record.file_type } : {}),
    ...(record.source_dir ? { sourceDir: record.source_dir } : {}),
    ...(record.uploaded_by ? { uploadedBy: record.uploaded_by } : {}),
  };
}

function formatDateTime(value: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    value.getFullYear(),
    "-",
    pad(value.getMonth() + 1),
    "-",
    pad(value.getDate()),
    " ",
    pad(value.getHours()),
    ":",
    pad(value.getMinutes()),
    ":",
    pad(value.getSeconds()),
  ].join("");
}

export function buildAttachmentCreatePayload(params: {
  bizType: AttachmentBizType;
  bizId: number;
  attachmentType: AttachmentType;
  file: AttachmentFileValue;
  uploadedBy?: string;
  now?: Date;
}) {
  const payload: Record<string, any> = {
    biz_type: params.bizType,
    biz_id: params.bizId,
    attachment_type: params.attachmentType,
    file_name: params.file.fileName,
    file_path: params.file.filePath,
    created_at: formatDateTime(params.now || new Date()),
  };

  if (params.file.fileType) payload.file_type = params.file.fileType;
  if (params.file.sourceDir) payload.source_dir = params.file.sourceDir;
  if (params.uploadedBy || params.file.uploadedBy) {
    payload.uploaded_by = params.uploadedBy || params.file.uploadedBy;
  }

  return payload;
}

export function buildAttachmentSyncPlan(params: {
  existingRecords: AttachmentRecord[];
  nextFiles: AttachmentFileValue[];
}) {
  const nextIds = new Set(
    params.nextFiles
      .map((file) => (file.id ? Number(file.id) : undefined))
      .filter((id): id is number => Number.isFinite(id)),
  );

  return {
    filesToCreate: params.nextFiles.filter((file) => !file.id && file.filePath),
    idsToDelete: params.existingRecords
      .map((record) => Number(record.id))
      .filter((id) => Number.isFinite(id) && !nextIds.has(id)),
  };
}

export async function listAttachmentRecords(params: {
  bizType: AttachmentBizType;
  bizId: number;
  attachmentType?: AttachmentType;
}): Promise<AttachmentRecord[]> {
  const where: Record<string, any> = {
    biz_type: { $eq: params.bizType },
    biz_id: { $eq: params.bizId },
  };
  if (params.attachmentType) {
    where.attachment_type = { $eq: params.attachmentType };
  }

  const result = await lovrabetClient.models.attachment.filter({
    where,
    select: [
      "id",
      "file_name",
      "file_path",
      "file_type",
      "source_dir",
      "uploaded_by",
    ],
    orderBy: [{ id: "asc" }],
    currentPage: 1,
    pageSize: 200,
  });

  return (result.tableData || []) as AttachmentRecord[];
}

export async function listAttachmentValues(params: {
  bizType: AttachmentBizType;
  bizId: number;
  attachmentType?: AttachmentType;
}) {
  const records = await listAttachmentRecords(params);
  return records.map(attachmentRecordToValue);
}

export async function syncAttachmentRecords(params: {
  bizType: AttachmentBizType;
  bizId: number;
  attachmentType: AttachmentType;
  files?: AttachmentFileValue[];
  uploadedBy?: string;
}) {
  const files = params.files || [];
  const existingRecords = await listAttachmentRecords({
    bizType: params.bizType,
    bizId: params.bizId,
    attachmentType: params.attachmentType,
  });
  const plan = buildAttachmentSyncPlan({ existingRecords, nextFiles: files });

  if (plan.idsToDelete.length) {
    await Promise.all(
      plan.idsToDelete.map((id) =>
        lovrabetClient.bff.execute({
          scriptName: "cpoApplicantFlowAction",
          params: {
            bizType: params.bizType,
            bizId: params.bizId,
            action: "delete_attachment",
            attachmentId: id,
          },
        }),
      ),
    );
  }

  const createdValues: AttachmentFileValue[] = [];
  for (const file of plan.filesToCreate) {
    const id = await lovrabetClient.models.attachment.create(
      buildAttachmentCreatePayload({
        bizType: params.bizType,
        bizId: params.bizId,
        attachmentType: params.attachmentType,
        file,
        uploadedBy: params.uploadedBy,
      }),
    );
    createdValues.push({ ...file, id: Number(id) });
  }

  const createdByPath = new Map(
    createdValues.map((file) => [file.filePath, file] as const),
  );

  return files.map((file) => {
    if (file.id) return file;
    return createdByPath.get(file.filePath) || file;
  });
}

export function firstAttachmentFilePath(files?: AttachmentFileValue[]) {
  return files?.find((file) => file.filePath)?.filePath;
}
