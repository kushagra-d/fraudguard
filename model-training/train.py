import os

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from xgboost import XGBClassifier

from features import load_dataset

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "fraud_model_v1.json")

os.makedirs(MODEL_DIR, exist_ok=True)

print("Loading data...")
X_train, X_test, y_train, y_test, feature_cols = load_dataset()

print(f"\nTrain: {len(X_train):,} rows, {y_train.sum():,} fraud ({y_train.mean():.4%})")
print(f"Test:  {len(X_test):,} rows, {y_test.sum():,} fraud ({y_test.mean():.4%})")

# --- Train ---
neg_count = int((y_train == 0).sum())
pos_count = int((y_train == 1).sum())
scale_pos_weight = neg_count / pos_count
print(f"\nscale_pos_weight = {neg_count:,} / {pos_count:,} = {scale_pos_weight:.2f}")

model = XGBClassifier(
    n_estimators=200,
    max_depth=6,
    learning_rate=0.1,
    scale_pos_weight=scale_pos_weight,
    eval_metric="aucpr",
    random_state=42,
)

print("\nTraining...")
model.fit(X_train, y_train)

# --- Evaluate ---
y_pred = model.predict(X_test)
y_proba = model.predict_proba(X_test)[:, 1]

precision = precision_score(y_test, y_pred)
recall = recall_score(y_test, y_pred)
f1 = f1_score(y_test, y_pred)
pr_auc = average_precision_score(y_test, y_proba)
no_skill_pr_auc = y_test.mean()  # PR-AUC of a random classifier = positive class prevalence

print("\n=== XGBoost model - test set evaluation ===")
print(f"Precision: {precision:.4f}")
print(f"Recall:    {recall:.4f}")
print(f"F1:        {f1:.4f}")
print(f"PR-AUC:    {pr_auc:.4f}  (no-skill baseline = {no_skill_pr_auc:.4f})")

cm = confusion_matrix(y_test, y_pred)
print("\nConfusion matrix (rows=actual, cols=predicted, [not-fraud, fraud]):")
print(cm)
tn, fp, fn, tp = cm.ravel()
print(f"  True negatives:  {tn:,}")
print(f"  False positives: {fp:,}")
print(f"  False negatives: {fn:,}")
print(f"  True positives:  {tp:,}")

# --- Trivial baseline: always predict not-fraud ---
y_pred_baseline = np.zeros_like(y_test)
baseline_precision = precision_score(y_test, y_pred_baseline, zero_division=0)
baseline_recall = recall_score(y_test, y_pred_baseline, zero_division=0)
baseline_f1 = f1_score(y_test, y_pred_baseline, zero_division=0)

print("\n=== Trivial baseline (always predict not-fraud) ===")
print(f"Precision: {baseline_precision:.4f}")
print(f"Recall:    {baseline_recall:.4f}")
print(f"F1:        {baseline_f1:.4f}")
print(f"PR-AUC:    {no_skill_pr_auc:.4f}  (= test set fraud rate, the no-skill reference line)")

# --- Save model ---
model.save_model(MODEL_PATH)
print(f"\nSaved model: {MODEL_PATH}")

# --- Feature importances ---
importances = model.get_booster().get_score(importance_type="gain")
importances = sorted(importances.items(), key=lambda kv: kv[1], reverse=True)
print("\n=== Feature importances (gain) ===")
for feature, gain in importances:
    print(f"  {feature}: {gain:.2f}")

print("\nDone.")
