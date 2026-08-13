import React from "react";
import type { ReactNode } from "react";
import { Typography } from "antd";
import styles from "./PageScaffold.module.css";

type PageScaffoldVariant = "form" | "detail" | "list" | "compare";
type PageScaffoldDensity = "default" | "compact";

interface PageScaffoldProps {
  title: ReactNode;
  description?: ReactNode;
  notice?: ReactNode;
  footer?: ReactNode;
  headerExtra?: ReactNode;
  maxWidth?: number | string;
  variant?: PageScaffoldVariant;
  density?: PageScaffoldDensity;
  children: ReactNode;
}

const DEFAULT_MAX_WIDTH: Record<PageScaffoldVariant, string> = {
  form: "100%",
  detail: "100%",
  list: "100%",
  compare: "100%",
};

export default function PageScaffold({
  title,
  description,
  notice,
  footer,
  headerExtra,
  maxWidth,
  variant = "form",
  density = "default",
  children,
}: PageScaffoldProps) {
  const resolvedMaxWidth =
    typeof maxWidth === "number"
      ? `${maxWidth}px`
      : maxWidth || DEFAULT_MAX_WIDTH[variant];
  const rootStyle = {
    ["--page-scaffold-max-width" as string]: resolvedMaxWidth,
  } as React.CSSProperties;

  const titleNode = React.isValidElement(title) ? (
    title
  ) : (
    <Typography.Title level={3} className={styles.title}>
      {title}
    </Typography.Title>
  );

  const descriptionNode = description ? (
    React.isValidElement(description) ? (
      description
    ) : (
      <Typography.Paragraph type="secondary" className={styles.description}>
        {description}
      </Typography.Paragraph>
    )
  ) : null;

  return (
    <div className={styles.root} style={rootStyle}>
      <div
        className={[
          styles.inner,
          variant === "list" ? styles.variantList : "",
          density === "compact" ? styles.densityCompact : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className={styles.header}>
          <div className={styles.heading}>
            {titleNode}
            {descriptionNode}
          </div>
          {headerExtra ? <div>{headerExtra}</div> : null}
        </div>
        {notice ? <div className={styles.notice}>{notice}</div> : null}
        <div className={styles.content}>{children}</div>
        {footer}
      </div>
    </div>
  );
}
