import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import shap
import xgboost as xgb

from features import load_dataset

MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "fraud_model_candidate_0.1x.json")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "eda-output")
SUMMARY_PLOT_PATH = os.path.join(OUTPUT_DIR, "shap_summary.png")
SUMMARY_SAMPLE_SIZE = 5000
EXAMPLES_PER_CATEGORY = 3
RANDOM_STATE = 42

os.makedirs(OUTPUT_DIR, exist_ok=True)

print("Loading data...")
X_train, X_test, y_train, y_test, feature_cols = load_dataset()

print(f"Loading model: {MODEL_PATH}")
model = xgb.XGBClassifier()
model.load_model(MODEL_PATH)

y_pred = model.predict(X_test)
y_proba = model.predict_proba(X_test)[:, 1]

tp_idx = X_test.index[(y_pred == 1) & (y_test == 1)]
fp_idx = X_test.index[(y_pred == 1) & (y_test == 0)]
tn_idx = X_test.index[(y_pred == 0) & (y_test == 0)]

print("\nTest set breakdown at this model's default decision threshold (0.5):")
print(f"  True positives:  {len(tp_idx):,}")
print(f"  False positives: {len(fp_idx):,}")
print(f"  True negatives:  {len(tn_idx):,}")

print("\nBuilding SHAP TreeExplainer...")
explainer = shap.TreeExplainer(model)
# SHAP values here are in log-odds (margin) space, matching TreeExplainer's default
# for XGBoost: for each row, expected_value + sum(shap values) == the model's raw
# margin score for that row (which sigmoid-transforms to the predicted probability).

proba_by_position = {idx: y_proba[pos] for pos, idx in enumerate(X_test.index)}


def show_examples(label, idx_pool):
    print(f"\n=== {label} ===")
    if len(idx_pool) == 0:
        print("  (none found in test set at this threshold)")
        return
    rng = np.random.RandomState(RANDOM_STATE)
    chosen = rng.choice(idx_pool, size=min(EXAMPLES_PER_CATEGORY, len(idx_pool)), replace=False)
    rows = X_test.loc[chosen]
    shap_values = explainer.shap_values(rows)

    for i, row_idx in enumerate(chosen):
        proba = proba_by_position[row_idx]
        print(f"\n  -- row {row_idx}  (actual isFraud={y_test.loc[row_idx]}, predicted probability={proba:.4f}) --")
        contributions = sorted(
            zip(feature_cols, rows.iloc[i].values, shap_values[i]),
            key=lambda t: abs(t[2]),
            reverse=True,
        )
        for feat, val, shap_val in contributions:
            direction = "-> pushes toward FRAUD" if shap_val > 0 else "-> pushes toward NOT-FRAUD"
            print(f"    {feat:20s} value={val!s:<14} shap={shap_val:+.4f}  {direction}")


show_examples("True Positive (correctly caught fraud)", tp_idx)
show_examples("False Positive (flagged legit transaction as fraud)", fp_idx)
show_examples("True Negative (correctly allowed legit transaction)", tn_idx)

# --- Global SHAP summary plot ---
print(f"\nComputing SHAP values for summary plot (sampling {SUMMARY_SAMPLE_SIZE:,} test rows)...")
sample_idx = X_test.sample(n=min(SUMMARY_SAMPLE_SIZE, len(X_test)), random_state=RANDOM_STATE).index
X_sample = X_test.loc[sample_idx]
shap_values_sample = explainer.shap_values(X_sample)

plt.figure()
shap.summary_plot(shap_values_sample, X_sample, show=False)
plt.tight_layout()
plt.savefig(SUMMARY_PLOT_PATH, bbox_inches="tight")
plt.close()
print(f"Saved: {SUMMARY_PLOT_PATH}")

print("\nDone.")
