import React from "react";
import type { CSSProperties, ReactNode } from "react";
import styles from "./index.module.css";

type Density = "default" | "compact";

type FormLayoutProps = {
  children: ReactNode;
  maxWidth?: number | string;
  density?: Density;
  className?: string;
  style?: CSSProperties;
};

type FormSectionProps = {
  children: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

type FormRowProps = {
  children: ReactNode;
  columns?: 1 | 2 | 3 | 4;
  template?: string;
  density?: Density;
  className?: string;
  style?: CSSProperties;
};

function toCssLength(value: number | string | undefined, fallback: string) {
  if (typeof value === "number") return `${value}px`;
  return value || fallback;
}

function joinClassNames(...classNames: Array<string | undefined | false>) {
  return classNames.filter(Boolean).join(" ");
}

export default function FormLayout({
  children,
  maxWidth = 720,
  density = "default",
  className,
  style,
}: FormLayoutProps) {
  const rootStyle = {
    ["--form-layout-max-width" as string]: toCssLength(maxWidth, "720px"),
    ...style,
  } as CSSProperties;

  return (
    <div
      className={joinClassNames(
        styles.root,
        density === "compact" && styles.compact,
        className,
      )}
      style={rootStyle}
    >
      {children}
    </div>
  );
}

export function FormSection({
  children,
  title,
  description,
  className,
  style,
}: FormSectionProps) {
  return (
    <section
      className={joinClassNames(styles.section, className)}
      style={style}
    >
      {title || description ? (
        <div className={styles.sectionHeader}>
          {title ? <h3 className={styles.sectionTitle}>{title}</h3> : null}
          {description ? (
            <div className={styles.sectionDescription}>{description}</div>
          ) : null}
        </div>
      ) : null}
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

export function FormRow({
  children,
  columns = 2,
  template,
  density = "default",
  className,
  style,
}: FormRowProps) {
  const rowTemplate = template || `repeat(${columns}, minmax(0, 1fr))`;
  const rowStyle = {
    ["--form-layout-row-template" as string]: rowTemplate,
    ...style,
  } as CSSProperties;

  return (
    <div
      className={joinClassNames(
        styles.row,
        density === "compact" && styles.rowCompact,
        className,
      )}
      style={rowStyle}
    >
      {children}
    </div>
  );
}
