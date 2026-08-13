export function buildLegalAgreementPrintHtml(html: string, title: string) {
  const printScript = [
    "<script>",
    `(function(){document.title=${safeJsonForScript(title)};var printed=false;function run(){if(printed){return;}printed=true;var doPrint=function(){requestAnimationFrame(function(){requestAnimationFrame(function(){window.focus();window.print();});});};if(document.fonts&&document.fonts.ready){document.fonts.ready.then(doPrint,doPrint);}else{doPrint();}}if(document.readyState==="complete"){run();}else{window.addEventListener("load",run,{once:true});}setTimeout(run,1200);})();`,
    "</script>",
  ].join("");

  if (/<\/body\s*>/i.test(html)) {
    return html.replace(/<\/body\s*>/i, `${printScript}</body>`);
  }
  return `${html}${printScript}`;
}

export function printLegalAgreementHtml(
  html: string,
  title: string,
  hostWindow: Window = window,
) {
  const printWindow = hostWindow.open("", "_blank", "width=960,height=1200");
  if (!printWindow) {
    return false;
  }

  printWindow.document.open();
  printWindow.document.write(buildLegalAgreementPrintHtml(html, title));
  printWindow.document.close();
  printWindow.focus();
  return true;
}

function safeJsonForScript(value: string) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
