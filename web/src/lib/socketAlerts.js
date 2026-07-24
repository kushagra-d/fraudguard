// Reshapes the worker's raw Socket.io 'new-alert' payload
// ({ transactionId, transaction, scoreResult }) into the same flat row shape
// GET /review-queue returns, so TransactionRow can render both identically.
export function toQueueRow({ transactionId, transaction, scoreResult }) {
  return {
    id: transactionId,
    account_id: transaction.account_id,
    merchant_id: transaction.merchant_id,
    amount: transaction.amount,
    currency: transaction.currency,
    txn_timestamp: transaction.txn_timestamp,
    type: transaction.type,
    old_balance_orig: transaction.old_balance_orig,
    new_balance_orig: transaction.new_balance_orig,
    old_balance_dest: transaction.old_balance_dest,
    new_balance_dest: transaction.new_balance_dest,
    score: scoreResult.score,
    decision: scoreResult.decision,
    features_json: scoreResult.features_used,
    shap_values_json: scoreResult.shap_values,
    // The socket payload carries no DB timestamp (scored_at is a DB-side
    // default applied at insert time, never sent back to the worker) - "now" is
    // an accurate stand-in since the alert arrives essentially in real time.
    scored_at: new Date().toISOString(),
  };
}
