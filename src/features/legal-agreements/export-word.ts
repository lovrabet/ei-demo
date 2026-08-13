/**
 * 将合同 HTML 导出为 Word（.docx）。
 * 签章页单独分页、甲乙方左右分栏需在导出前做 Word 兼容转换（表格 + 分页符）。
 */

function inlineParagraphStyles(content: string): string {
  return content.replace(/<p>/g, '<p style="margin:8pt 0;line-height:1.8;">');
}

/** Word 导出专用：签章页分页 + 甲乙方双列表格布局 */
export function transformSignatureSectionForWord(html: string): string {
  return html.replace(
    /<section class="sign">([\s\S]*?)<div class="sign-grid">([\s\S]*?)<\/div>\s*<\/section>/,
    (_match, beforeGrid: string, gridContent: string) => {
      const boxes = [
        ...gridContent.matchAll(
          /<div class="signature-box">([\s\S]*?)<\/div>/g,
        ),
      ].map((item) => item[1].trim());
      if (boxes.length < 2) {
        return _match;
      }

      const h2Match = beforeGrid.match(/<h2>[\s\S]*?<\/h2>/);
      const heading = h2Match?.[0] ?? "<h2>签章页</h2>";

      return `<section class="sign" style="page-break-before:always;mso-page-break-before:always;margin-top:24pt;">
${heading}
<table style="width:100%;border:none;border-collapse:collapse;margin-top:16pt;" border="0" cellpadding="0" cellspacing="0">
<tr>
<td style="width:50%;vertical-align:top;padding-right:24pt;border:none;">${inlineParagraphStyles(boxes[0])}</td>
<td style="width:50%;vertical-align:top;padding-left:24pt;border:none;">${inlineParagraphStyles(boxes[1])}</td>
</tr>
</table>
</section>`;
    },
  );
}

function prepareHtmlForWordExport(html: string) {
  const trimmed = String(html || "").trim();
  if (!trimmed) {
    return "";
  }

  const withSignatureLayout = transformSignatureSectionForWord(trimmed);

  return withSignatureLayout.replace(
    /<body([^>]*)>/i,
    '<body$1 style="font-family:SimSun,宋体,serif;font-size:12pt;line-height:1.8;color:#111;">',
  );
}

function sanitizeWordFileName(name: string) {
  return String(name || "legal-agreement")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function exportLegalAgreementWord(options: {
  html: string;
  fileName: string;
}) {
  const preparedHtml = prepareHtmlForWordExport(options.html);
  if (!preparedHtml) {
    throw new Error("合同内容为空，无法导出 Word");
  }

  const { asBlob } = await import("html-docx-js-typescript");
  const blob = await asBlob(preparedHtml);
  if (!(blob instanceof Blob)) {
    throw new Error("Word 导出失败");
  }

  const safeName = sanitizeWordFileName(options.fileName);
  triggerBlobDownload(blob, `${safeName}.docx`);
}
