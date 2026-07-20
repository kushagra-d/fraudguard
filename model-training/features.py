import os

import pandas as pd

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "paysim.csv")
STEP_CUTOFF = 355  # 80th percentile of `step`, computed from the actual data


def load_dataset():
    """Load PaySim, engineer features, and split by `step` (time), matching
    train.py's original pipeline exactly so every script that needs the model's
    input features (training, comparison, SHAP) stays in sync."""
    df = pd.read_csv(DATA_PATH)

    df["destBalanceZeroed"] = (
        (df["oldbalanceDest"] == 0) & (df["newbalanceDest"] == 0)
    ).astype(int)

    type_dummies = pd.get_dummies(df["type"], prefix="type")
    df = pd.concat([df, type_dummies], axis=1)

    feature_cols = (
        list(type_dummies.columns)
        + [
            "amount",
            "oldbalanceOrg",
            "newbalanceOrig",
            "oldbalanceDest",
            "newbalanceDest",
            "destBalanceZeroed",
        ]
    )

    train_mask = df["step"] <= STEP_CUTOFF
    test_mask = ~train_mask

    X_train = df.loc[train_mask, feature_cols]
    y_train = df.loc[train_mask, "isFraud"]
    X_test = df.loc[test_mask, feature_cols]
    y_test = df.loc[test_mask, "isFraud"]

    return X_train, X_test, y_train, y_test, feature_cols
