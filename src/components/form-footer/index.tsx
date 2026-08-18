import React from "react";
import { Button, Space } from "antd";
import {
  SaveOutlined,
  SendOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import styles from "./index.module.css";

type Mode = "workflow" | "single";

type Props = {
  mode?: Mode;
  onCancel: () => void;
  /** 仅 single 模式使用，例如进项发票归档。 */
  onSaveDraft?: () => void;
  /** workflow 模式直接创建单据并触发平台 Flow。 */
  onSaveAndSubmit?: () => void;
  saving: boolean;
  hint?: string;
  singleActionLabel?: string;
};

/**
 * FormFooter: sticky 底部操作栏。
 * workflow 模式 = 取消 + 提交申请（主单 CREATE 后由平台 Flow 自动发起）
 * single 模式   = 取消 + 保存（无提交按钮）
 */
const FormFooter: React.FC<Props> = ({
  mode = "workflow",
  onCancel,
  onSaveDraft,
  onSaveAndSubmit,
  saving,
  hint,
  singleActionLabel = "保存",
}) => {
  return (
    <div className={styles.footer}>
      <div className={styles.footerLeft}>
        <FileTextOutlined />
        <span>
          {hint ||
            (mode === "workflow"
              ? "提交后进入审核流，审批人将在审批中心的待我审批中看到。"
              : "保存后立即生效。")}
        </span>
      </div>
      <Space size={8} className={styles.footerActions}>
        <Button onClick={onCancel} disabled={saving}>
          取消
        </Button>
        {mode === "workflow" && onSaveAndSubmit && (
          <Button
            type="primary"
            onClick={onSaveAndSubmit}
            loading={saving}
            disabled={saving}
            icon={<SendOutlined />}
          >
            {saving ? "提交中" : "提交申请"}
          </Button>
        )}
        {mode === "single" && (
          <Button
            type="primary"
            onClick={onSaveDraft}
            loading={saving}
            disabled={saving}
            icon={<SaveOutlined />}
          >
            {saving ? "保存中" : singleActionLabel}
          </Button>
        )}
      </Space>
    </div>
  );
};

export default FormFooter;
