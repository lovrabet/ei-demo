import React from "react";
import { Alert, Button } from "antd";
import { ArrowRightOutlined, RobotOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import styles from "./index.module.css";

type Props = {
  skillCode: string;
  skillName: string;
  prompt: string;
  description: string;
};

/**
 * 在传统人工表单顶部提供对应 Agent Skill 的推荐入口。
 */
export default function AgentFormGuide({
  skillCode,
  skillName,
  prompt,
  description,
}: Props) {
  const navigate = useNavigate();

  const openAgentSkill = () => {
    navigate("/chat", {
      state: {
        query: `/${skillCode} ${prompt}`,
      },
    });
  };

  return (
    <Alert
      className={styles.guide}
      type="info"
      showIcon
      icon={<RobotOutlined />}
      message="当前页面是传统的人工录入方式"
      description={
        <span>
          推荐使用 Agent 数字员工的「{skillName}」。{description}
        </span>
      }
      action={
        <Button
          type="primary"
          onClick={openAgentSkill}
          icon={<ArrowRightOutlined />}
        >
          调用此 Skill
        </Button>
      }
    />
  );
}
