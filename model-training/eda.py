import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "paysim.csv")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "eda-output")

os.makedirs(OUTPUT_DIR, exist_ok=True)

print("Loading data...")
df = pd.read_csv(DATA_PATH)

# --- Row counts ---
total_rows = len(df)
fraud_count = int(df["isFraud"].sum())
non_fraud_count = total_rows - fraud_count

print("\n=== Row counts ===")
print(f"Total rows: {total_rows:,}")
print(f"Fraud: {fraud_count:,} ({fraud_count / total_rows:.4%})")
print(f"Non-fraud: {non_fraud_count:,} ({non_fraud_count / total_rows:.4%})")

# --- Fraud rate by transaction type ---
print("\n=== Fraud rate by transaction type ===")
by_type = df.groupby("type")["isFraud"].agg(["sum", "count"])
by_type["fraud_rate"] = by_type["sum"] / by_type["count"]
by_type = by_type.rename(columns={"sum": "fraud_count", "count": "total_count"})
by_type = by_type.sort_values("fraud_rate", ascending=False)
print(by_type)

# --- Summary statistics for amount, split by isFraud ---
print("\n=== amount summary statistics, by isFraud ===")
print(df.groupby("isFraud")["amount"].describe())

# --- Plot 1: fraud count by transaction type ---
fig, ax = plt.subplots(figsize=(8, 5))
by_type["fraud_count"].plot(kind="bar", ax=ax, color="firebrick")
ax.set_title("Fraud Count by Transaction Type")
ax.set_xlabel("Transaction Type")
ax.set_ylabel("Fraud Count")
plt.xticks(rotation=45)
plt.tight_layout()
fraud_by_type_path = os.path.join(OUTPUT_DIR, "fraud_by_type.png")
plt.savefig(fraud_by_type_path)
plt.close(fig)
print(f"\nSaved: {fraud_by_type_path}")

# --- Plot 2: amount distribution, fraud vs non-fraud, log scale ---
fig, ax = plt.subplots(figsize=(8, 5))
fraud_amounts = df.loc[df["isFraud"] == 1, "amount"]
non_fraud_amounts = df.loc[df["isFraud"] == 0, "amount"]
# Log-spaced bins so a log x-axis actually shows the distribution shape instead of
# collapsing linear-width bins into one or two bars at the high end.
positive_amounts = df.loc[df["amount"] > 0, "amount"]
bins = np.logspace(np.log10(positive_amounts.min()), np.log10(df["amount"].max()), 100)
ax.hist(non_fraud_amounts, bins=bins, alpha=0.5, label="Non-fraud", color="steelblue", density=True)
ax.hist(fraud_amounts, bins=bins, alpha=0.5, label="Fraud", color="firebrick", density=True)
ax.set_xscale("log")
ax.set_title("Transaction Amount Distribution: Fraud vs. Non-fraud")
ax.set_xlabel("Amount (log scale)")
ax.set_ylabel("Density")
ax.legend()
plt.tight_layout()
amount_dist_path = os.path.join(OUTPUT_DIR, "amount_distribution.png")
plt.savefig(amount_dist_path)
plt.close(fig)
print(f"Saved: {amount_dist_path}")

# --- Zero-balance signal: oldbalanceOrg == newbalanceOrig == 0 ---
zero_balance_mask = (df["oldbalanceOrg"] == 0) & (df["newbalanceOrig"] == 0)

fraud_zero_balance = int((zero_balance_mask & (df["isFraud"] == 1)).sum())
non_fraud_zero_balance = int((zero_balance_mask & (df["isFraud"] == 0)).sum())

print("\n=== oldbalanceOrg == newbalanceOrig == 0 ===")
print(
    f"Fraud rows with zero origin balance: {fraud_zero_balance:,} "
    f"({fraud_zero_balance / fraud_count:.4%} of all fraud)"
)
print(
    f"Non-fraud rows with zero origin balance: {non_fraud_zero_balance:,} "
    f"({non_fraud_zero_balance / non_fraud_count:.4%} of all non-fraud)"
)

print("\nDone.")
