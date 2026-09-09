import React from "react";
import { Alert, Button } from "antd";
import { ArrowRightOutlined, RobotOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { $i18n } from "@/i18n";
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
      message={$i18n.t(
        "agentFormGuide.manualEntryNotice",
        "当前页面是传统的人工录入方式",
      )}
      description={
        <span>
          {$i18n
            .t(
              "agentFormGuide.recommendSkill",
              "推荐使用 Agent 数字员工的「{skillName}」。{description}",
            )
            .replace("{skillName}", skillName)
            .replace("{description}", description)}
        </span>
      }
      action={
        <Button
          type="primary"
          onClick={openAgentSkill}
          icon={<ArrowRightOutlined />}
        >
          {$i18n.t("agentFormGuide.invokeSkill", "调用此 Skill")}
        </Button>
      }
    />
  );
}
