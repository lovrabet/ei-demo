type StandalonePrintWindowOptions = {
  targetWindow: Window;
  sourceElement: HTMLElement;
  title: string;
  beforePrint?: () => Promise<void>;
  onAfterPrint?: () => void;
};

const STYLE_SELECTOR = 'style, link[rel="stylesheet"]';

function delay(milliseconds: number) {
  return new Promise<void>((resolve) =>
    window.setTimeout(resolve, milliseconds),
  );
}

function sourceStyleNodes(sourceElement: HTMLElement) {
  const sourceDocument = sourceElement.ownerDocument;
  const roots: ParentNode[] = [sourceDocument];
  const rootNode = sourceElement.getRootNode();
  if (rootNode !== sourceDocument && "querySelectorAll" in rootNode) {
    roots.push(rootNode as ParentNode);
  }
  return roots.flatMap((root) =>
    Array.from(
      root.querySelectorAll<HTMLStyleElement | HTMLLinkElement>(STYLE_SELECTOR),
    ),
  );
}

function waitForStylesheet(link: HTMLLinkElement) {
  if (link.sheet) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    link.addEventListener("load", finish, { once: true });
    link.addEventListener("error", finish, { once: true });
    window.setTimeout(finish, 1500);
  });
}

async function waitForPrintResources(targetDocument: Document) {
  const links = Array.from(
    targetDocument.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
  );
  await Promise.all(links.map(waitForStylesheet));
  if (targetDocument.fonts) {
    await Promise.race([
      targetDocument.fonts.ready.then(() => undefined),
      delay(1500),
    ]);
  }
}

export async function printInStandaloneWindow({
  targetWindow,
  sourceElement,
  title,
  beforePrint,
  onAfterPrint,
}: StandalonePrintWindowOptions) {
  const targetDocument = targetWindow.document;
  targetDocument.documentElement.lang = "zh-CN";
  targetDocument.title = title;
  targetDocument.head.replaceChildren();
  targetDocument.body.replaceChildren();
  targetDocument.body.className =
    "application-detail-page application-detail-print-window";

  const charset = targetDocument.createElement("meta");
  charset.setAttribute("charset", "UTF-8");
  targetDocument.head.appendChild(charset);

  const viewport = targetDocument.createElement("meta");
  viewport.name = "viewport";
  viewport.content = "width=device-width, initial-scale=1";
  targetDocument.head.appendChild(viewport);

  const base = targetDocument.createElement("base");
  base.href = sourceElement.ownerDocument.baseURI;
  targetDocument.head.appendChild(base);

  sourceStyleNodes(sourceElement).forEach((node) => {
    targetDocument.head.appendChild(targetDocument.importNode(node, true));
  });

  const helperStyle = targetDocument.createElement("style");
  helperStyle.textContent = `
    body.application-detail-print-window { margin: 0; background: #fff; }
    .application-detail-print-preparing {
      margin: 48px auto;
      color: #555;
      font: 14px/1.6 "Microsoft YaHei", "PingFang SC", sans-serif;
      text-align: center;
    }
    @media print { .application-detail-print-preparing { display: none !important; } }
  `;
  targetDocument.head.appendChild(helperStyle);

  const preparing = targetDocument.createElement("p");
  preparing.className = "application-detail-print-preparing";
  preparing.textContent = "正在准备财务单据打印稿…";
  targetDocument.body.appendChild(preparing);
  targetDocument.body.appendChild(
    targetDocument.importNode(sourceElement, true),
  );

  await waitForPrintResources(targetDocument);
  if (targetWindow.closed) return;
  preparing.remove();
  await new Promise<void>((resolve) =>
    targetWindow.requestAnimationFrame(() => resolve()),
  );

  await beforePrint?.();
  if (targetWindow.closed) return;

  targetWindow.addEventListener(
    "afterprint",
    () => {
      onAfterPrint?.();
      window.setTimeout(() => targetWindow.close(), 0);
    },
    { once: true },
  );
  targetWindow.focus();
  targetWindow.print();
}
