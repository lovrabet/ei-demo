import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./index.module.css";

type MarkdownContentProps = {
  value?: unknown;
  emptyText?: string;
  className?: string;
};

const MarkdownContent: React.FC<MarkdownContentProps> = ({
  value,
  emptyText = "-",
  className,
}) => {
  const markdown = typeof value === "string" ? value.trim() : "";

  if (!markdown) {
    return <span className={className}>{emptyText}</span>;
  }

  return (
    <div className={[styles.root, className].filter(Boolean).join(" ")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer noopener" />
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownContent;
