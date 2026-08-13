import React from "react";
import { Empty, Table } from "antd";
import type { TableProps } from "antd";
import ProjectTabs from "@/components/project-tabs";

export type ApplicationScopeTab = "active" | "completed" | "voided";

export type ApplicationScopeTabItem = {
  key: ApplicationScopeTab;
  label: React.ReactNode;
  emptyDescription: string;
};

type ApplicationScopeTabsProps<Row extends object> = {
  activeKey: ApplicationScopeTab;
  onChange: (key: ApplicationScopeTab) => void;
  afterTabs?: React.ReactNode;
  tableProps: TableProps<Row>;
  tabs: ApplicationScopeTabItem[];
};

export default function ApplicationScopeTabs<Row extends object>({
  activeKey,
  onChange,
  afterTabs,
  tableProps,
  tabs,
}: ApplicationScopeTabsProps<Row>) {
  const renderTable = (emptyDescription: string) => (
    <Table<Row>
      {...tableProps}
      locale={{
        ...tableProps.locale,
        emptyText: <Empty description={emptyDescription} />,
      }}
    />
  );

  return (
    <ProjectTabs
      activeKey={activeKey}
      onChange={(key) => onChange(key as ApplicationScopeTab)}
      items={tabs.map((tab) => ({
        key: tab.key,
        label: tab.label,
        children: (
          <>
            {afterTabs}
            {renderTable(tab.emptyDescription)}
          </>
        ),
      }))}
    />
  );
}
