import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

type ReactRootLike = Pick<Root, "render" | "unmount">;

export type MicroAppRootContainer = HTMLElement & {
  _reactRoot?: ReactRootLike;
};

export function mountReactRoot(
  container: MicroAppRootContainer,
  element: ReactNode,
  createRootFn: (container: HTMLElement) => ReactRootLike,
) {
  if (container._reactRoot) {
    container._reactRoot.unmount();
  }

  const root = createRootFn(container);
  container._reactRoot = root;
  root.render(element);
  return root;
}

export function unmountReactRoot(
  container?: MicroAppRootContainer | null,
) {
  if (!container?._reactRoot) {
    return;
  }

  container._reactRoot.unmount();
  delete container._reactRoot;
}
