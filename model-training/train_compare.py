import os

from sklearn.metrics import average_precision_score, f1_score, precision_score, recall_score
from xgboost import XGBClassifier

from features import load_dataset

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODEL_DIR, exist_ok=True)

print("Loading data...")
X_train, X_test, y_train, y_test, feature_cols = load_dataset()

neg_count = int((y_train == 0).sum())
pos_count = int((y_train == 1).sum())
full_ratio = neg_count / pos_count
print(f"\nFull negative/positive ratio: {neg_count:,} / {pos_count:,} = {full_ratio:.2f}")

# Fractions of the full ratio to compare, plus the full ratio itself (= v1's config,
# re-run here so every row in the table comes from one consistent run).
fractions = [1.0, 0.5, 0.25, 0.1]

results = []
for fraction in fractions:
    scale_pos_weight = full_ratio * fraction
    print(f"\n=== Training: {fraction}x -> scale_pos_weight={scale_pos_weight:.2f} ===")

    model = XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        scale_pos_weight=scale_pos_weight,
        eval_metric="aucpr",
        random_state=42,
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]

    precision = precision_score(y_test, y_pred)
    recall = recall_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred)
    pr_auc = average_precision_score(y_test, y_proba)

    tp = int(((y_pred == 1) & (y_test == 1)).sum())
    fp = int(((y_pred == 1) & (y_test == 0)).sum())
    fn = int(((y_pred == 0) & (y_test == 1)).sum())

    model_path = os.path.join(MODEL_DIR, f"fraud_model_candidate_{fraction}x.json")
    model.save_model(model_path)

    results.append(
        {
            "fraction": fraction,
            "scale_pos_weight": scale_pos_weight,
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "pr_auc": pr_auc,
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "model_path": model_path,
        }
    )
    print(f"Precision={precision:.4f}  Recall={recall:.4f}  F1={f1:.4f}  PR-AUC={pr_auc:.4f}")
    print(f"Saved: {model_path}")

print("\n\n=== Comparison across scale_pos_weight values (same time-based split) ===")
header = f"{'fraction':>10} {'scale_pos_weight':>18} {'precision':>10} {'recall':>10} {'f1':>10} {'pr_auc':>10} {'TP':>6} {'FP':>6} {'FN':>6}"
print(header)
print("-" * len(header))
for r in results:
    print(
        f"{r['fraction']:>9}x {r['scale_pos_weight']:>18.2f} {r['precision']:>10.4f} "
        f"{r['recall']:>10.4f} {r['f1']:>10.4f} {r['pr_auc']:>10.4f} "
        f"{r['tp']:>6} {r['fp']:>6} {r['fn']:>6}"
    )

print("\nDone.")
