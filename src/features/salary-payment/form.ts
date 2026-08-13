export type SalaryPaymentItemDefaults = {
  currency: "CNY";
  payment_method: "bank_transfer";
};

export function createSalaryPaymentItemDefaults(): SalaryPaymentItemDefaults {
  return {
    currency: "CNY",
    payment_method: "bank_transfer",
  };
}
