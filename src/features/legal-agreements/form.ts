import {
  buildDefaultLegalAgreementDraft,
  customerOptionToCounterparty,
} from "./api";
import type { InternalLegalEntityOption } from "../internal-legal-entities/api";
import { normalizeLegalAgreementParties } from "./party";
import type { LegalAgreementDraft, LegalCustomerOption } from "./types";

export type LegalAgreementFormValues = Omit<LegalAgreementDraft, "parties"> & {
  customerName?: string;
  customerUscc?: string;
  customerLegalRep?: string;
  customerAddress?: string;
  customerContactName?: string;
  customerContactPhone?: string;
  customerContactEmail?: string;
  internalEntityCode?: string;
};

export function legalAgreementFormValuesToDraft(
  values: LegalAgreementFormValues,
  customer?: LegalCustomerOption,
  ourEntity?: InternalLegalEntityOption,
): LegalAgreementDraft {
  const defaultDraft = buildDefaultLegalAgreementDraft(ourEntity);
  const baseCounterparty = customer
    ? customerOptionToCounterparty(customer)
    : {
        partyTitle: "甲方",
        partyRole: "COUNTERPARTY" as const,
        sourceType: "MANUAL" as const,
        companyName: "",
      };
  const counterparty = {
    ...baseCounterparty,
    companyName: formValue(values.customerName, baseCounterparty.companyName),
    uscc: formValue(values.customerUscc, baseCounterparty.uscc),
    legalRep: formValue(values.customerLegalRep, baseCounterparty.legalRep),
    address: formValue(values.customerAddress, baseCounterparty.address),
    contactName: formValue(
      values.customerContactName,
      baseCounterparty.contactName,
    ),
    contactPhone: formValue(
      values.customerContactPhone,
      baseCounterparty.contactPhone,
    ),
    contactEmail: formValue(
      values.customerContactEmail,
      baseCounterparty.contactEmail,
    ),
  };
  const ourSide =
    defaultDraft.parties.find((party) => party.partyRole === "OUR_SIDE") ||
    defaultDraft.parties[1];

  return {
    agreementType: values.agreementType || "NDA",
    agreementTitle: values.agreementTitle || "商务合作保密协议",
    projectName: values.projectName,
    cooperationMatter: values.cooperationMatter,
    agreementDate: values.agreementDate,
    signedDate: values.signedDate,
    effectiveDate: values.effectiveDate,
    confidentialityYears: values.confidentialityYears,
    returnDestroyDays: values.returnDestroyDays,
    breachPenaltyType: values.breachPenaltyType || "ACTUAL_LOSS",
    breachPenaltyAmount: values.breachPenaltyAmount,
    breachPenaltyPercent: values.breachPenaltyPercent,
    disputeResolutionType: values.disputeResolutionType || "LITIGATION",
    disputeResolutionOrg: values.disputeResolutionOrg,
    disputeResolutionPlace: values.disputeResolutionPlace,
    signingPlace: values.signingPlace,
    externalNote: values.externalNote,
    internalNote: values.internalNote,
    parties: normalizeLegalAgreementParties([counterparty, ourSide]),
  };
}

function formValue<T>(value: T | undefined, fallback: T | undefined) {
  return value === undefined ? fallback : value;
}
