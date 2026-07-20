import os

import numpy as np
import xgboost as xgb
from fastapi import FastAPI
from pydantic import BaseModel

MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "fraud_model_current.json")

# Order the model was trained on - must match model-training/train.py's feature_cols exactly.
FEATURE_NAMES = [
    "type_CASH_IN",
    "type_CASH_OUT",
    "type_DEBIT",
    "type_PAYMENT",
    "type_TRANSFER",
    "amount",
    "oldbalanceOrg",
    "newbalanceOrig",
    "oldbalanceDest",
    "newbalanceDest",
    "destBalanceZeroed",
]
TRANSACTION_TYPES = ["CASH_IN", "CASH_OUT", "DEBIT", "PAYMENT", "TRANSFER"]
MODEL_VERSION = "v1-scale0.1x-threshold0.35"
# Chosen from model-training/threshold_sweep.py: holds recall near-maximal (0.994) while
# cutting false positives substantially versus the 0.5 default. Recall is prioritized
# because in a review-queue system, a missed fraud case costs far more than an analyst
# spending a minute clearing a false alarm.
DECISION_THRESHOLD = 0.35

app = FastAPI()

model = xgb.Booster()
model.load_model(MODEL_PATH)


class Transaction(BaseModel):
    type: str
    amount: float
    old_balance_orig: float
    new_balance_orig: float
    old_balance_dest: float
    new_balance_dest: float


def build_features(txn: Transaction) -> dict:
    dest_balance_zeroed = int(txn.old_balance_dest == 0 and txn.new_balance_dest == 0)
    features = {f"type_{t}": int(txn.type == t) for t in TRANSACTION_TYPES}
    features.update(
        {
            "amount": txn.amount,
            "oldbalanceOrg": txn.old_balance_orig,
            "newbalanceOrig": txn.new_balance_orig,
            "oldbalanceDest": txn.old_balance_dest,
            "newbalanceDest": txn.new_balance_dest,
            "destBalanceZeroed": dest_balance_zeroed,
        }
    )
    return features


@app.post("/score")
def score(txn: Transaction):
    features = build_features(txn)
    row = np.array([[features[name] for name in FEATURE_NAMES]], dtype=float)
    dmatrix = xgb.DMatrix(row, feature_names=FEATURE_NAMES)

    fraud_probability = float(model.predict(dmatrix)[0])
    decision = "block" if fraud_probability >= DECISION_THRESHOLD else "allow"

    # pred_contribs returns len(FEATURE_NAMES) + 1 values per row: one TreeSHAP
    # contribution per feature, in FEATURE_NAMES order, plus a trailing bias/base-value
    # term that is NOT a feature contribution - it must be split off, not zipped
    # against FEATURE_NAMES, or the last feature would silently get the bias's value.
    contribs = model.predict(dmatrix, pred_contribs=True)[0]
    feature_contribs, bias = contribs[:-1], contribs[-1]
    shap_values = {name: float(val) for name, val in zip(FEATURE_NAMES, feature_contribs)}
    shap_values["base_value"] = float(bias)

    return {
        "score": fraud_probability,
        "decision": decision,
        "features_used": features,
        "shap_values": shap_values,
        "model_version": MODEL_VERSION,
    }
