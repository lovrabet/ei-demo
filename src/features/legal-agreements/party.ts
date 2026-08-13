import type { LegalAgreementDraft } from "./types";

type DraftParty = LegalAgreementDraft["parties"][number];

export function normalizeLegalAgreementParties(
  parties: DraftParty[],
): DraftParty[] {
  const ordered: DraftParty[] = [];
  const seen = new Set<DraftParty>();
  const counterparty = parties.find(
    (party) => party.partyRole === "COUNTERPARTY",
  );
  const ourSide = parties.find((party) => party.partyRole === "OUR_SIDE");

  for (const party of [counterparty, ourSide]) {
    if (party && !seen.has(party)) {
      ordered.push(normalizePartyTitle(party));
      seen.add(party);
    }
  }

  for (const party of parties) {
    if (!seen.has(party)) {
      ordered.push(normalizePartyTitle(party));
      seen.add(party);
    }
  }

  return ordered;
}

function normalizePartyTitle(party: DraftParty): DraftParty {
  if (party.partyRole === "COUNTERPARTY") {
    return { ...party, partyTitle: "甲方" };
  }
  if (party.partyRole === "OUR_SIDE") {
    return { ...party, partyTitle: "乙方" };
  }
  return party;
}
