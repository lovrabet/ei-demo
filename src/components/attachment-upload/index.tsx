import React, { useEffect, useMemo, useState } from "react";
import { Button, Tooltip, Upload, message } from "antd";
import type { UploadFile, UploadProps } from "antd";
import {
  InboxOutlined,
  PaperClipOutlined,
  UpOutlined,
} from "@ant-design/icons";
import {
  type AttachmentFileValue,
  normalizeAttachmentUploadFile,
  queryRuntimeFileUrl,
  uploadRuntimeFile,
} from "@/features/attachments/api";
import { $i18n } from "@/i18n";
import styles from "./index.module.css";

type Props = {
  value?: AttachmentFileValue[];
  onChange?: (value: AttachmentFileValue[]) => void;
  disabled?: boolean;
  maxCount?: number;
  accept?: string;
  compact?: boolean;
  uploadLabel?: string;
  actionMode?: boolean;
};

const EMPTY_VALUE: AttachmentFileValue[] = [];

function toUploadFile(file: AttachmentFileValue): UploadFile {
  const uploadFile: UploadFile & { id?: number } = {
    id: file.id,
    uid: String(file.id || file.uid || file.filePath),
    name: file.fileName,
    status: "done",
    response: {
      success: true,
      data: {
        fileName: file.fileName,
        filePath: file.filePath,
        fileType: file.fileType,
        sourceDir: file.sourceDir,
      },
    },
  };
  return uploadFile;
}

const AttachmentUpload: React.FC<Props> = ({
  value,
  onChange,
  disabled,
  maxCount = 5,
  accept,
  compact = false,
  uploadLabel = $i18n.t("attachment.upload", "上传附件"),
  actionMode = false,
}) => {
  const attachmentValue = value || EMPTY_VALUE;
  const controlledFileList = useMemo(
    () => attachmentValue.map(toUploadFile),
    [attachmentValue],
  );
  const [fileList, setFileList] = useState<UploadFile[]>(controlledFileList);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setFileList((prevFileList) => {
      const nextUids = new Set(controlledFileList.map((file) => file.uid));
      const pendingFiles = prevFileList.filter(
        (file) =>
          file.status === "uploading" ||
          (file.status === "error" && !nextUids.has(file.uid)),
      );
      return [...controlledFileList, ...pendingFiles];
    });
  }, [controlledFileList]);

  const emitChange = (nextFileList: UploadFile[]) => {
    const nextValue = nextFileList
      .filter((file) => file.status === "done")
      .map((file) => normalizeAttachmentUploadFile(file as any))
      .filter((file): file is AttachmentFileValue => Boolean(file));
    onChange?.(nextValue);
  };

  const handleChange: UploadProps["onChange"] = (info) => {
    setFileList(info.fileList);
    if (compact && maxCount === 1 && info.file.status === "done") {
      setExpanded(false);
    }
    if (
      info.file.status === "done" ||
      info.file.status === "removed" ||
      info.file.status === "error"
    ) {
      emitChange(info.fileList.filter((file) => file.status !== "removed"));
    }
  };

  const customRequest: UploadProps["customRequest"] = async (options) => {
    try {
      const file = options.file as File;
      const result = await uploadRuntimeFile(file);
      options.onSuccess?.(
        {
          success: true,
          data: {
            fileName: result.fileName,
            filePath: result.filePath,
            fileType: result.fileType,
            sourceDir: result.sourceDir,
          },
        },
        options.file as any,
      );
    } catch (error: any) {
      options.onError?.(error);
    }
  };

  const handlePreview = async (file: UploadFile) => {
    const normalized = normalizeAttachmentUploadFile(file as any);
    if (!normalized?.filePath) return;
    try {
      const url = await queryRuntimeFileUrl(normalized.filePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error: any) {
      message.error(
        $i18n.t("attachment.openFailed", {
          reason: error?.message || String(error),
        }),
      );
    }
  };

  const uploadProps: UploadProps = {
    accept,
    customRequest,
    disabled,
    fileList,
    maxCount,
    multiple: maxCount > 1,
    onChange: handleChange,
    onPreview: handlePreview,
  };

  if (actionMode) {
    const currentFile = fileList.find((file) => file.status === "done");
    const actionLabel = currentFile
      ? $i18n.t("attachment.replace", "更换附件")
      : uploadLabel;

    return (
      <div className={styles.actionUpload}>
        <Tooltip title={actionLabel}>
          <Upload
            {...uploadProps}
            className={styles.inlineUploadAction}
            showUploadList={false}
          >
            <Button
              type="text"
              size="small"
              icon={<PaperClipOutlined />}
              aria-label={actionLabel}
            />
          </Upload>
        </Tooltip>
        {currentFile ? (
          <button
            type="button"
            className={styles.inlineFile}
            title={currentFile.name}
            onClick={() => handlePreview(currentFile)}
          >
            <PaperClipOutlined />
            <span>{currentFile.name}</span>
          </button>
        ) : null}
      </div>
    );
  }

  if (compact) {
    const hasFiles = fileList.length > 0;
    const triggerLabel =
      hasFiles && maxCount === 1
        ? $i18n.t("attachment.replaceInvoice", "更换发票附件")
        : uploadLabel;

    return (
      <div className={styles.compactUpload}>
        {!expanded && hasFiles ? (
          <Upload
            {...uploadProps}
            className={styles.compactFileList}
            openFileDialogOnClick={false}
          >
            <span className={styles.hiddenUploadTrigger} aria-hidden="true" />
          </Upload>
        ) : null}

        {expanded ? (
          <div className={styles.compactPanel}>
            <div className={styles.compactPanelHeader}>
              <Button
                type="text"
                size="small"
                icon={<UpOutlined />}
                onClick={() => setExpanded(false)}
              >
                {$i18n.t("attachment.collapse", "收起")}
              </Button>
            </div>
            <Upload.Dragger {...uploadProps} className={styles.compactDragger}>
              <InboxOutlined className={styles.compactIcon} />
              <span className={styles.compactHint}>
                {$i18n.t("attachment.dropHint", "点击选择或拖拽文件到这里")}
              </span>
              <span className={styles.compactMeta}>
                {$i18n.t("attachment.maxFiles", { count: maxCount })}
              </span>
            </Upload.Dragger>
          </div>
        ) : disabled ? null : (
          <Button
            type="link"
            size="small"
            className={styles.compactTrigger}
            icon={<PaperClipOutlined />}
            aria-expanded={false}
            onClick={() => setExpanded(true)}
          >
            {triggerLabel}
          </Button>
        )}
      </div>
    );
  }

  return (
    <Upload.Dragger {...uploadProps}>
      <InboxOutlined style={{ fontSize: 26, color: "#8c8c8c" }} />
      <div style={{ marginTop: 8, color: "#262626" }}>
        {$i18n.t("attachment.dropHint", "点击选择或拖拽文件到这里")}
      </div>
      <div style={{ marginTop: 4, color: "#8c8c8c", fontSize: 12 }}>
        {$i18n.t("attachment.maxFiles", { count: maxCount })}
      </div>
    </Upload.Dragger>
  );
};

export default AttachmentUpload;
