import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import xgboost as xgb
from sklearn.metrics import f1_score, precision_recall_curve, precision_score, recall_score

from features import load_dataset

MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "fraud_model_candidate_0.1x.json")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "eda-output")
PR_CURVE_PATH = os.path.join(OUTPUT_DIR, "pr_curve.png")
DEFAULT_THRESHOLD = 0.5

os.makedirs(OUTPUT_DIR, exist_ok=True)

print("Loading data...")
X_train, X_test, y_train, y_test, feature_cols = load_dataset()

print(f"Loading model: {MODEL_PATH}")
model = xgb.XGBClassifier()
model.load_model(MODEL_PATH)

y_proba = model.predict_proba(X_test)[:, 1]

# --- Threshold sweep ---
thresholds = np.round(np.arange(0.10, 0.90 + 1e-9, 0.05), 2)

print("\n=== Threshold sweep (test set) ===")
header = f"{'threshold':>10} {'precision':>10} {'recall':>10} {'f1':>10} {'TP':>7} {'FP':>7} {'FN':>7}"
print(header)
print("-" * len(header))

for t in thresholds:
    y_pred = (y_proba >= t).astype(int)
    precision = precision_score(y_test, y_pred, zero_division=0)
    recall = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)
    tp = int(((y_pred == 1) & (y_test == 1)).sum())
    fp = int(((y_pred == 1) & (y_test == 0)).sum())
    fn = int(((y_pred == 0) & (y_test == 1)).sum())
    print(f"{t:>10.2f} {precision:>10.4f} {recall:>10.4f} {f1:>10.4f} {tp:>7} {fp:>7} {fn:>7}")

# --- Precision-recall curve ---
precisions, recalls, pr_thresholds = precision_recall_curve(y_test, y_proba)

# Point on the curve corresponding to the current 0.5 default.
default_pred = (y_proba >= DEFAULT_THRESHOLD).astype(int)
default_precision = precision_score(y_test, default_pred, zero_division=0)
default_recall = recall_score(y_test, default_pred, zero_division=0)

fig, ax = plt.subplots(figsize=(7, 6))
ax.plot(recalls, precisions, color="steelblue", label="Precision-recall curve")
ax.scatter(
    [default_recall],
    [default_precision],
    color="firebrick",
    zorder=5,
    label=f"Current default (threshold={DEFAULT_THRESHOLD})",
)
ax.annotate(
    f"({default_recall:.3f}, {default_precision:.3f})",
    (default_recall, default_precision),
    textcoords="offset points",
    xytext=(10, -10),
)
ax.set_xlabel("Recall")
ax.set_ylabel("Precision")
ax.set_title("Precision-Recall Curve - fraud_model_candidate_0.1x")
ax.legend()
plt.tight_layout()
plt.savefig(PR_CURVE_PATH)
plt.close(fig)
print(f"\nSaved: {PR_CURVE_PATH}")

print("\nDone.")
