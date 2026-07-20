import os

import pandas as pd
import xgboost as xgb

from features import DATA_PATH, load_dataset

MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "fraud_model_candidate_0.1x.json")
LOW, HIGH = 0.35, 0.49

RAW_COLS = [
    "type",
    "amount",
    "oldbalanceOrg",
    "newbalanceOrig",
    "oldbalanceDest",
    "newbalanceDest",
    "isFraud",
]


def show_example(label, in_band, y_test, raw_df):
    idx_in_band = in_band.index[y_test.loc[in_band.index] == label]
    print(f"\n{len(idx_in_band):,} test-set rows in [{LOW}, {HIGH}] have actual isFraud={label}")
    if len(idx_in_band) == 0:
        print(f"  (none found for isFraud={label})")
        return

    example_idx = idx_in_band[0]
    example_score = in_band.loc[example_idx]
    raw_row = raw_df.loc[example_idx]

    title = "genuine fraud" if label == 1 else "false positive (legitimate)"
    print(f"\n=== Example transaction demonstrating the 0.35 threshold change ({title}) ===")
    print(f"Score:             {example_score:.4f}")
    print(f"Old rule (>=0.5):  allow")
    print(f"New rule (>=0.35): block")
    print()
    print(f"type:              {raw_row['type']}")
    print(f"amount:            {raw_row['amount']}")
    print(f"old_balance_orig:  {raw_row['oldbalanceOrg']}")
    print(f"new_balance_orig:  {raw_row['newbalanceOrig']}")
    print(f"old_balance_dest:  {raw_row['oldbalanceDest']}")
    print(f"new_balance_dest:  {raw_row['newbalanceDest']}")
    print(f"actual isFraud:    {raw_row['isFraud']}")


print("Loading data...")
X_train, X_test, y_train, y_test, feature_cols = load_dataset()

print(f"Loading model: {MODEL_PATH}")
model = xgb.XGBClassifier()
model.load_model(MODEL_PATH)

y_proba = model.predict_proba(X_test)[:, 1]
proba_series = pd.Series(y_proba, index=X_test.index)

in_band = proba_series[(proba_series >= LOW) & (proba_series <= HIGH)]
print(f"\n{len(in_band):,} test-set rows have predicted probability in [{LOW}, {HIGH}]")

if len(in_band) == 0:
    raise SystemExit(f"No test-set row found with probability in [{LOW}, {HIGH}].")

raw_df = pd.read_csv(DATA_PATH, usecols=RAW_COLS)

show_example(0, in_band, y_test, raw_df)
show_example(1, in_band, y_test, raw_df)

print("\nDone.")
