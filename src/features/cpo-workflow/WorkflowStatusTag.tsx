import React from "react";
import { Tag } from "antd";
import {
  getApplicationFlowStatus,
  type ApplicationFlowStatusInput,
} from "./application-status";

type ApplicationFlowStatusTagProps = {
  value: ApplicationFlowStatusInput;
};

/** legacy 申请流程状态标签（平台单据走列表页 platformFlowStatusMeta）。 */
export const ApplicationFlowStatusTag: React.FC<
  ApplicationFlowStatusTagProps
> = ({ value }) => {
  const status = getApplicationFlowStatus(value);
  return <Tag color={status.color}>{status.label}</Tag>;
};

ApplicationFlowStatusTag.displayName = "申请流程状态标签";
