"""
ML Training Script for Shipment Delay Prediction
Uses DataCo Supply Chain Dataset
"""
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, accuracy_score
import joblib
import os

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_PATH = os.path.join(BASE_DIR, "dataset", "shipment_data.csv")
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model")
os.makedirs(MODEL_DIR, exist_ok=True)

print(f"Loading dataset from: {DATASET_PATH}")
df = pd.read_csv(DATASET_PATH, encoding="latin1", low_memory=False)
print(f"Loaded {len(df):,} rows, {len(df.columns)} columns")

# ─── Feature Engineering ──────────────────────────────────────────────────────
# Map DataCo columns → required ML features

# shipping_mode: already exists
df["shipping_mode"] = df["Shipping Mode"].fillna("Standard Class")

# distance_km: estimate from lat/lon or use order region index
# Use a simple proxy: order region hashed to a distance bucket
region_distance_map = {
    "Western Europe": 1200, "Central America": 4500, "Oceania": 8000,
    "Eastern Asia": 6500, "West Asia": 5000, "South Asia": 5500,
    "Southeast Asia": 7000, "Eastern Europe": 2000, "West Africa": 7500,
    "Southern Asia": 5800, "Central Asia": 4000, "Northern Europe": 1500,
    "East Africa": 6800, "North America": 5200, "South America": 9000,
    "Southern Africa": 8500, "Caribbean": 4800, "North Africa": 4200,
}
df["distance_km"] = df["Order Region"].map(region_distance_map).fillna(3000).astype(float)

# travel_time: Days for shipping (real)
df["travel_time"] = pd.to_numeric(df["Days for shipping (real)"], errors="coerce").fillna(5)

# sla_days: Days for shipment (scheduled)
df["sla_days"] = pd.to_numeric(df["Days for shipment (scheduled)"], errors="coerce").fillna(5)

# weather_condition: simulate based on region (0=clear, 1=rain, 2=storm, 3=fog)
np.random.seed(42)
df["weather_condition"] = np.random.choice([0, 1, 2, 3], size=len(df), p=[0.5, 0.3, 0.1, 0.1])

# disruption_risk: 0-1 score (use Benefit per order − negative = disrupted)
benefit = pd.to_numeric(df["Benefit per order"], errors="coerce").fillna(0)
df["disruption_risk"] = (benefit < 0).astype(int).astype(float)
# Add random noise for variability
df["disruption_risk"] = (df["disruption_risk"] + np.random.uniform(0, 0.3, len(df))).clip(0, 1)

# delay_flag: target variable (1 = delayed, 0 = on-time)
# DataCo has 'Late_delivery_risk' (0/1) and 'Delivery Status'
df["delay_flag"] = pd.to_numeric(df["Late_delivery_risk"], errors="coerce").fillna(0).astype(int)

print(f"Delay rate: {df['delay_flag'].mean():.2%}")

# ─── Encode Categorical ────────────────────────────────────────────────────────
label_encoders = {}
categorical_cols = ["shipping_mode"]

for col in categorical_cols:
    le = LabelEncoder()
    df[col + "_enc"] = le.fit_transform(df[col].astype(str))
    label_encoders[col] = le

# ─── Prepare Features ─────────────────────────────────────────────────────────
FEATURES = ["shipping_mode_enc", "distance_km", "travel_time", "weather_condition", "sla_days", "disruption_risk"]
TARGET = "delay_flag"

X = df[FEATURES].values
y = df[TARGET].values

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
print(f"Training: {len(X_train):,} | Test: {len(X_test):,}")

# ─── Train RandomForest ────────────────────────────────────────────────────────
print("Training RandomForestClassifier...")
model = RandomForestClassifier(
    n_estimators=200,
    max_depth=12,
    min_samples_split=5,
    random_state=42,
    n_jobs=-1,
    class_weight="balanced",
)
model.fit(X_train, y_train)

# ─── Evaluate ─────────────────────────────────────────────────────────────────
y_pred = model.predict(X_test)
acc = accuracy_score(y_test, y_pred)
print(f"\nAccuracy: {acc:.4f}")
print(classification_report(y_test, y_pred))

# ─── Save Model & Encoders ────────────────────────────────────────────────────
model_path = os.path.join(MODEL_DIR, "shipment_model.pkl")
encoders_path = os.path.join(MODEL_DIR, "label_encoders.pkl")
joblib.dump(model, model_path)
joblib.dump(label_encoders, encoders_path)
print(f"\nModel saved → {model_path}")
print(f"Encoders saved → {encoders_path}")
print("\nTraining complete!")
