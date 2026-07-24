// Humanized labels for every key that appears in shap_values_json / features_json.
// Single source of truth so the raw-values grid and the SHAP chart never drift
// out of sync on wording.
export const FEATURE_LABELS = {
  type_CASH_IN: 'Type: Cash In',
  type_CASH_OUT: 'Type: Cash Out',
  type_DEBIT: 'Type: Debit',
  type_PAYMENT: 'Type: Payment',
  type_TRANSFER: 'Type: Transfer',
  amount: 'Amount',
  oldbalanceOrg: 'Old Balance (Origin)',
  newbalanceOrig: 'New Balance (Origin)',
  oldbalanceDest: 'Old Balance (Destination)',
  newbalanceDest: 'New Balance (Destination)',
  destBalanceZeroed: 'Destination Balance Zeroed',
};
