import type {
  LegalAgreementDraft,
  LegalAgreementSnapshot,
  LegalBreachPenaltyType,
} from "./types";
import { normalizeLegalAgreementParties } from "./party";

const DEFAULT_CONFIDENTIALITY_YEARS = 5;
const DEFAULT_RETURN_DESTROY_DAYS = 10;

export function buildLegalAgreementSnapshot({
  agreementNo,
  generatedAt,
  draft,
}: {
  agreementNo: string;
  generatedAt: string;
  draft: LegalAgreementDraft;
}): LegalAgreementSnapshot {
  return {
    schemaVersion: 1,
    generatedAt,
    header: {
      agreementNo,
      agreementType: draft.agreementType,
      agreementTitle: draft.agreementTitle,
      projectName: optionalText(draft.projectName),
      cooperationMatter: optionalText(draft.cooperationMatter),
      agreementDate: optionalText(draft.agreementDate),
      signedDate: optionalText(draft.signedDate),
      effectiveDate: optionalText(draft.effectiveDate),
      signingPlace: optionalText(draft.signingPlace),
    },
    parties: normalizeLegalAgreementParties(draft.parties).map((party) => ({
      ...party,
      partyTitle: normalizeText(party.partyTitle),
      companyName: normalizeText(party.companyName),
      uscc: optionalText(party.uscc),
      legalRep: optionalText(party.legalRep),
      address: optionalText(party.address),
      contactName: optionalText(party.contactName),
      contactPhone: optionalText(party.contactPhone),
      contactEmail: optionalText(party.contactEmail),
    })),
    terms: {
      confidentialityYears:
        normalizePositiveInt(draft.confidentialityYears) ||
        DEFAULT_CONFIDENTIALITY_YEARS,
      returnDestroyDays:
        normalizePositiveInt(draft.returnDestroyDays) ||
        DEFAULT_RETURN_DESTROY_DAYS,
      breachPenaltyType: draft.breachPenaltyType,
      breachPenaltyAmount: normalizeOptionalNumber(draft.breachPenaltyAmount),
      breachPenaltyPercent: normalizeOptionalNumber(draft.breachPenaltyPercent),
      disputeResolutionType: draft.disputeResolutionType,
      disputeResolutionOrg: optionalText(draft.disputeResolutionOrg),
      disputeResolutionPlace: optionalText(draft.disputeResolutionPlace),
    },
    externalNote: optionalText(draft.externalNote),
  };
}

export function renderLegalAgreementHtml(snapshot: LegalAgreementSnapshot) {
  const firstParty = snapshot.parties.find(
    (party) => party.partyRole === "COUNTERPARTY",
  );
  const secondParty = snapshot.parties.find(
    (party) => party.partyRole === "OUR_SIDE",
  );
  const terms = snapshot.terms;
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escapeHtml(snapshot.header.agreementTitle)}</title>`,
    "<style>",
    "@page{size:A4;margin:20mm 18mm;}",
    'html,body{margin:0;padding:0;background:#eef2f6;color:#111;font-family:"Songti SC","SimSun",serif;font-size:12pt;line-height:1.85;}',
    ".contract-page{box-sizing:border-box;width:210mm;min-height:297mm;margin:18px auto;padding:24mm 20mm;background:#fff;box-shadow:0 10px 30px rgba(15,23,42,.16);}",
    ".contract-title{text-align:center;font-size:22pt;font-weight:700;line-height:1.35;margin:0 0 10mm;letter-spacing:0;}",
    ".contract-meta{display:grid;grid-template-columns:repeat(2,1fr);gap:2mm 12mm;margin:0 0 8mm;padding:5mm 0;border-top:1px solid #111;border-bottom:1px solid #111;font-size:11pt;}",
    ".contract-meta div{min-width:0;}.party-block{margin:0 0 5mm;}.party-block p,.clause p,.sign p{margin:2mm 0;text-align:justify;}.clause{margin-top:6mm;}.clause h2{font-size:14pt;margin:0 0 2mm;font-weight:700;}.sign{margin-top:18mm;page-break-before:always;}.sign-grid{display:grid;grid-template-columns:1fr 1fr;gap:18mm;margin-top:10mm;}.signature-box{min-height:55mm;}.signature-box p{margin:4mm 0;}",
    "@media print{html,body{background:#fff;}.contract-page{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none;}.contract-meta{break-inside:avoid;}.party-block,.clause,.signature-box{break-inside:avoid;}.sign{page-break-before:always;}}",
    "</style>",
    "</head>",
    "<body>",
    '<main class="contract-page">',
    `<h1 class="contract-title">${escapeHtml(snapshot.header.agreementTitle)}</h1>`,
    '<section class="contract-meta">',
    `<div>协议编号：${escapeHtml(snapshot.header.agreementNo)}</div>`,
    `<div>协议类型：${escapeHtml(snapshot.header.agreementType)}</div>`,
    `<div>项目名称：${valueOrBlank(snapshot.header.projectName)}</div>`,
    `<div>签署地点：${valueOrBlank(snapshot.header.signingPlace)}</div>`,
    `<div>协议日期：${valueOrBlank(snapshot.header.agreementDate)}</div>`,
    "</section>",
    renderParty(firstParty),
    renderParty(secondParty),
    `<section class="clause"><p>鉴于：甲方拟就${valueOrBlank(snapshot.header.projectName)}与乙方开展${valueOrBlank(snapshot.header.cooperationMatter)}。乙方作为服务提供、产品试用、技术对接或合同履行方，可能接触、获取或处理甲方或其客户数据、业务数据、账号权限、项目资料、商务安排、技术资料及其他非公开信息。双方亦可能相互披露各自具有商业价值、技术价值、经营价值或合规敏感性的非公开信息。为保护双方合法权益，双方本着平等、自愿、公平、诚信原则，签署本协议并共同遵守。</p>`,
    `<p>本协议于${valueOrBlank(snapshot.header.agreementDate)}在${valueOrBlank(snapshot.header.signingPlace)}签署，自双方签字或盖章之日起生效。</p></section>`,
    '<section class="clause"><h2>第一条 保密信息</h2>',
    "<p>本协议项下保密信息，是指一方以口头、书面、电子、系统接口、账号授权、现场接触或其他方式向另一方披露、提供或使另一方知悉的非公开信息。双方互为披露方和接收方，披露信息的一方为披露方，接收、获取或知悉信息的一方为接收方。</p>",
    "<p>保密信息包括但不限于：甲方或其客户数据、业务数据、账号权限、项目资料、客户信息、经营数据、财务信息、合同文本、商务条款、会议纪要、需求文档、流程制度、系统配置、接口文档、访问凭证、密钥、个人信息、重要数据；以及乙方的产品方案、源代码、算法、模型、提示词、技术架构、报价策略、交付方法、知识产权及依法或依约需要保护的其他非公开信息。</p></section>",
    '<section class="clause"><h2>第二条 合作目的和使用范围</h2>',
    `<p>接收方仅可为${valueOrBlank(snapshot.header.cooperationMatter)}及本协议约定合作目的，在必要、最小、授权范围内使用保密信息。未经披露方事先书面同意，接收方不得将保密信息用于本协议目的以外的研发、训练、销售、竞品分析、对外展示、商业推广或其他用途。</p></section>`,
    '<section class="clause"><h2>第三条 双方保密义务</h2>',
    "<p>接收方应以不低于保护自身同类重要信息的注意义务保护披露方保密信息，并采取合理的管理、技术和访问控制措施。未经披露方事先书面同意，接收方不得向任何第三方披露、提供、公开、转让、出售、上传、发布、复制、反向工程或以其他方式处置保密信息。</p>",
    "<p>接收方确因合作目的需要向其员工、顾问、承包商或关联方披露保密信息的，应限于必要知悉人员，并确保前述人员承担不低于本协议约定的保密义务。接收方应对前述人员的行为承担责任。</p></section>",
    '<section class="clause"><h2>第四条 乙方特别义务</h2>',
    "<p>乙方接触或处理甲方保密信息、甲方或其客户数据、业务数据、账号权限、系统环境、接口凭证、测试数据、生产数据或个人信息时，应仅为甲方授权的项目目的使用，不得超范围访问、复制、留存、下载、转移、分析或向第三方提供。</p>",
    "<p>未经甲方事先书面同意，乙方不得将甲方保密信息用于模型训练、样本沉淀、案例宣传、产品演示、对外投标、客户名单展示或其他与甲方授权项目无关的用途。乙方应按甲方合理要求配合进行权限回收、数据删除、材料返还、访问记录核查和安全事件处置。</p></section>",
    '<section class="clause"><h2>第五条 保密例外</h2>',
    "<p>以下信息不属于保密信息：接收方能够证明在披露前已经合法知悉的信息；非因接收方违反本协议而进入公开领域的信息；接收方从有权披露的第三方合法取得的信息；或接收方未使用披露方保密信息而独立开发的信息。接收方根据法律法规、监管机关、司法机关或证券交易规则要求披露的，应在法律允许范围内提前通知披露方，并尽合理努力协助披露方采取保护措施。</p></section>",
    '<section class="clause"><h2>第六条 返还和销毁</h2>',
    `<p>合作终止、双方停止谈判或披露方提出书面要求时，接收方应在${escapeHtml(String(terms.returnDestroyDays))}个工作日内按披露方要求返还、删除或销毁其掌握的全部保密信息及复制件、备份、摘录和派生材料。</p></section>`,
    '<section class="clause"><h2>第七条 保密期限</h2>',
    `<p>除双方另有书面约定外，保密期限为本协议生效之日起至合作事项终止、双方停止谈判、相关合同解除或终止后${escapeHtml(String(terms.confidentialityYears))}年止。对商业秘密、技术秘密、未公开源代码、账号密钥、个人信息和重要数据，只要其仍具保密属性，保密义务持续有效。</p></section>`,
    '<section class="clause"><h2>第八条 权属和知识产权</h2>',
    "<p>保密信息的披露、接收或使用不构成任何所有权、知识产权、数据权益、许可权益或其他权利的转让。甲方及其客户数据、业务数据、项目资料和账号权限归甲方或其合法权利人所有；乙方的产品、平台、代码、模型、算法、技术方案、交付工具和方法论归乙方或其合法权利人所有。双方另有书面约定的，从其约定。</p></section>",
    '<section class="clause"><h2>第九条 违约责任</h2>',
    `<p>${escapeHtml(buildPenaltyText(terms.breachPenaltyType, terms.breachPenaltyAmount, terms.breachPenaltyPercent))}</p></section>`,
    '<section class="clause"><h2>第十条 适用法律和争议解决</h2>',
    `<p>本协议适用中华人民共和国法律。因本协议引起或与本协议有关的任何争议，双方应先友好协商；协商不成的，按${escapeHtml(terms.disputeResolutionType === "ARBITRATION" ? "仲裁" : "诉讼")}方式提交${valueOrBlank(terms.disputeResolutionOrg)}处理。</p></section>`,
    '<section class="clause"><h2>第十一条 其他</h2>',
    "<p>本协议独立于双方就具体项目、订单、试用、采购或服务另行签署的业务合同。若业务合同对保密、数据安全、个人信息保护或知识产权保护作出更高要求的，从其约定；未约定或约定不明的，适用本协议。</p></section>",
    snapshot.externalNote
      ? `<section class="clause"><h2>其他备注</h2><p>${escapeHtml(snapshot.externalNote)}</p></section>`
      : "",
    '<section class="sign"><h2>签章页</h2><div class="sign-grid">',
    renderSignature(firstParty),
    renderSignature(secondParty),
    "</div></section>",
    "</main>",
    "</body></html>",
  ].join("");
}

function renderParty(party?: LegalAgreementSnapshot["parties"][number]) {
  if (!party) {
    return "";
  }
  return [
    '<section class="party-block">',
    `<p>${escapeHtml(party.partyTitle)}：${escapeHtml(party.companyName)}</p>`,
    party.uscc ? `<p>统一社会信用代码：${escapeHtml(party.uscc)}</p>` : "",
    party.legalRep ? `<p>法定代表人：${escapeHtml(party.legalRep)}</p>` : "",
    party.address ? `<p>地址：${escapeHtml(party.address)}</p>` : "",
    party.contactName || party.contactPhone || party.contactEmail
      ? `<p>项目联系人、电话及邮箱：${escapeHtml(
          [party.contactName, party.contactPhone, party.contactEmail]
            .filter(Boolean)
            .join("、"),
        )}</p>`
      : "",
    "</section>",
  ].join("");
}

function renderSignature(party?: LegalAgreementSnapshot["parties"][number]) {
  if (!party) {
    return "";
  }
  return [
    '<div class="signature-box">',
    `<p>${escapeHtml(party.partyTitle)}：${escapeHtml(party.companyName)}</p>`,
    "<p>盖章：</p>",
    "<p>法定代表人/授权代表签字：</p>",
    "<p>日期：　　　年　　　月　　　日</p>",
    "</div>",
  ].join("");
}

function buildPenaltyText(
  type: LegalBreachPenaltyType,
  amount?: number,
  percent?: number,
) {
  if (type === "FIXED_AMOUNT") {
    return `任何一方违反本协议，应赔偿守约方全部损失，并支付违约金人民币${amount ?? "【】"}元。`;
  }
  if (type === "PERCENT_OF_DEAL") {
    return `任何一方违反本协议，应赔偿守约方全部损失，并支付相当于双方拟达成或已达成合作金额${percent ?? "【】"}%的违约金。`;
  }
  if (type === "NONE") {
    return "任何一方违反本协议，应立即停止违约行为并赔偿守约方因此遭受的全部损失及合理维权费用。";
  }
  return "任何一方违反本协议，应立即停止违约行为，采取补救措施，消除影响，并赔偿守约方因此遭受的全部损失及合理维权费用。";
}

function valueOrBlank(value?: string) {
  return escapeHtml(value || "【】");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function optionalText(value: unknown) {
  const text = normalizeText(value);
  return text || undefined;
}

function normalizePositiveInt(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? Math.round(next) : undefined;
}

function normalizeOptionalNumber(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}
