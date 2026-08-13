import React from "react";
import { createRoot } from "react-dom/client";
import { isInIcestark } from "@ice/stark-app";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { mountReactRoot, unmountReactRoot } from "./micro-app-root";
import App from "./router";
import "./style.css";

function renderApp(customProps?: object) {
  return (
    <ConfigProvider locale={zhCN}>
      <App {...customProps} />
    </ConfigProvider>
  );
}

// 可选：根据 isInIcestark() 判断当前的运行环境，可同时兼容独立使用和嵌入使用
if (!isInIcestark()) {
  const container = document.getElementById("root");
  if (container) {
    mountReactRoot(container, renderApp(), createRoot);
  }
}

// 关键：暴露 mount 供主应用加载时调用
export function mount({
  container,
  customProps,
}: {
  container: HTMLElement;
  customProps: object;
}) {
  return mountReactRoot(
    container,
    <React.StrictMode>
      {renderApp(customProps)}
    </React.StrictMode>,
    createRoot,
  );
}

// 关键：暴露 unmount 供主应用卸载时调用
export function unmount({ container }: { container: HTMLElement }) {
  unmountReactRoot(container);
}
