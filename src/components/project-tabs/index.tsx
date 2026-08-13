import React from "react";
import { Tabs } from "antd";
import type { TabsProps } from "antd";
import styles from "./index.module.css";

export type ProjectTabsProps = TabsProps;

export default function ProjectTabs({
  className,
  animated = false,
  ...props
}: ProjectTabsProps) {
  return (
    <Tabs
      {...props}
      animated={animated}
      className={[styles.tabs, className].filter(Boolean).join(" ")}
    />
  );
}

ProjectTabs.displayName = "ProjectTabs";
