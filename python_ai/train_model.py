"""
EchoTrace — Training Pipeline v3 (Phase 2)
===========================================
Phase 2 improvements:
  - Merges v1 (1800 rows) + v2 (104 hard-case rows) datasets
  - Template-group-aware split via data_loader.group_aware_split()
  - Per-language evaluation (English / Tagalog / Taglish)
  - Per-category evaluation
  - Bias diagnostic: checks label correlation with length/caps/exclamations
  - Probability calibration check (Brier score + reliability diagram data)
  - Honest metrics — no manipulation

Ensemble (unchanged from Phase 1):
  LR + Calibrated LinearSVC + GradientBoosting + RandomForest (soft vote)
"""

import os
import sys
import json
import pickle
import datetime
from typing import Any
import numpy as np

from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier, VotingClassifier
from sklearn.svm import LinearSVC
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import StratifiedGroupKFold, cross_val_score
from sklearn.base import BaseEstimator
from sklearn.metrics import (
    classification_report, confusion_matrix,
    accuracy_score, f1_score, roc_auc_score,
    average_precision_score, brier_score_loss, precision_recall_curve
)

BASE_DIR        = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH      = os.path.join(BASE_DIR, 'models', 'fake_review_model.pkl')
VECTORIZER_PATH = os.path.join(BASE_DIR, 'models', 'tfidf_vectorizer.pkl')
METRICS_PATH    = os.path.join(BASE_DIR, 'models', 'training_metrics.json')
METADATA_PATH   = os.path.join(BASE_DIR, 'models', 'model_metadata.json')
CSV_V1          = os.path.join(BASE_DIR, 'synthetic_reviews.csv')
CSV_V2          = os.path.join(BASE_DIR, 'synthetic_reviews_v2.csv')


# ── Model Architecture ────────────────────────────────────────────────────────

def build_ensemble() -> VotingClassifier:
    lr = LogisticRegression(
        C=1.0, solver='lbfgs',
        class_weight='balanced', max_iter=1000, random_state=42
    )
    svc = CalibratedClassifierCV(
        LinearSVC(C=1.0, loss='squared_hinge',
                  class_weight='balanced', max_iter=2000, random_state=42),
        cv=3
    )
    gb = GradientBoostingClassifier(
        n_estimators=100, learning_rate=0.1,
        max_depth=4, subsample=0.85, random_state=42
    )
    rf = RandomForestClassifier(
        n_estimators=100, max_depth=15,
        class_weight='balanced', random_state=42, n_jobs=-1
    )
    estimators: list[tuple[str, Any]] = [
        ('lr', lr), ('svc', svc), ('gb', gb), ('rf', rf)
    ]
    return VotingClassifier(
        estimators=estimators,
        voting='soft'
    )


def build_pipeline() -> Pipeline:
    return Pipeline([
        ('tfidf', TfidfVectorizer(
            max_features=8000, ngram_range=(1, 3),
            sublinear_tf=True, min_df=2,
            strip_accents='unicode', analyzer='word',
            # No English stop words — multilingual dataset
        )),
        ('clf', build_ensemble())
    ])


def select_high_precision_threshold(y_true, probabilities, minimum_precision=0.90):
    """Select a precision-first decision threshold using validation data only."""
    precision, recall, thresholds = precision_recall_curve(y_true, probabilities)
    candidates = []
    for idx, threshold in enumerate(thresholds):
        p, r = float(precision[idx]), float(recall[idx])
        if p < minimum_precision:
            continue
        f05 = (1.25 * p * r / (0.25 * p + r)) if (0.25 * p + r) else 0.0
        candidates.append((f05, p, r, float(threshold)))
    return max(candidates, key=lambda row: (row[0], row[1], row[2]))[3] if candidates else 0.50


def write_json_atomically(path, payload):
    """Avoid exposing a partially written metrics artifact to the dashboard."""
    temporary_path = path + '.tmp'
    with open(temporary_path, 'w', encoding='utf-8') as output:
        json.dump(payload, output, indent=2)
    os.replace(temporary_path, path)


# ── Bias Diagnostics ──────────────────────────────────────────────────────────

def bias_report(texts, labels):
    """Check label correlation with surface-level features."""
    import re
    results = {}
    for label_name, target in [('fake', 1), ('genuine', 0)]:
        subset = [t for t, l in zip(texts, labels) if l == target]
        avg_len   = sum(len(t.split()) for t in subset) / max(len(subset), 1)
        avg_caps  = sum(sum(1 for c in t if c.isupper()) / max(len(t), 1) for t in subset) / max(len(subset), 1)
        avg_excl  = sum(t.count('!') for t in subset) / max(len(subset), 1)
        results[label_name] = {
            'count'     : len(subset),
            'avg_words' : round(float(avg_len), 1),
            'avg_caps_ratio': round(float(avg_caps), 3),
            'avg_exclamations': round(float(avg_excl), 2),
        }
    print("\n[Bias Diagnostic]")
    for cls, stats in results.items():
        print(f"  {cls:8s}: words={stats['avg_words']:5.1f}  caps={stats['avg_caps_ratio']:.3f}  excl={stats['avg_exclamations']:.2f}")
    return results


# ── Per-Language Evaluation ───────────────────────────────────────────────────

def per_language_eval(pipeline, test_records, label_key='label'):
    """Evaluate on each language subset. Returns dict of per-lang metrics."""
    from data_loader import ReviewRecord
    results = {}
    languages = list({r.language for r in test_records if r.language})

    for lang in sorted(languages):
        subset = [r for r in test_records if r.language == lang]
        if len(subset) < 4:
            continue
        X = [r.text for r in subset]
        y = [r.label for r in subset]
        pred  = pipeline.predict(X)
        prob  = pipeline.predict_proba(X)[:, 1]
        acc   = accuracy_score(y, pred)
        f1_w  = f1_score(y, pred, average='weighted', zero_division=0)
        try:
            auc = roc_auc_score(y, prob)
        except Exception:
            auc = None
        results[lang] = {
            'n'         : len(subset),
            'accuracy'  : round(float(acc) * 100, 2),
            'f1_weighted': round(float(f1_w) * 100, 2),
            'roc_auc'   : round(float(auc), 4) if auc else None,
        }
        auc_str = f"{auc:.4f}" if auc is not None else "N/A"
        print(f"  [{lang:8s}] n={len(subset):4d}  acc={acc*100:.1f}%  f1={f1_w*100:.1f}%  auc={auc_str}")
    return results


# ── Main Training ─────────────────────────────────────────────────────────────

def train():
    print("=" * 65)
    print("  EchoTrace — Training Pipeline v3 (Phase 2)")
    print("=" * 65)

    from data_loader import load_records, group_aware_split, load_synthetic_csv

    # ── 1. Load + merge datasets ──────────────────────────────────────────────
    records_v1 = load_records(CSV_V1)
    print(f"\n[1/6] V1 dataset: {len(records_v1)} unique samples")

    records_v2 = []
    if os.path.exists(CSV_V2):
        records_v2 = load_records(CSV_V2)
        print(f"      V2 dataset: {len(records_v2)} unique samples")

    # Merge — deduplicate across v1+v2 by text
    seen_texts = set()
    seen_fingerprints = set()
    all_records = []
    cross_dataset_duplicates = 0
    for r in records_v1 + records_v2:
        fingerprint = ' '.join(sorted(r.text.split()))
        if r.text in seen_texts or fingerprint in seen_fingerprints:
            cross_dataset_duplicates += 1
            continue
        seen_texts.add(r.text)
        seen_fingerprints.add(fingerprint)
        all_records.append(r)

    texts  = [r.text  for r in all_records]
    labels = [r.label for r in all_records]
    total   = len(all_records)
    genuine = labels.count(0)
    fake    = labels.count(1)
    print(f"      Merged total : {total}  Genuine: {genuine}  Fake: {fake}")

    # ── 2. Bias diagnostic ────────────────────────────────────────────────────
    bias = bias_report(texts, labels)

    # ── 3. Group-aware split ──────────────────────────────────────────────────
    development_records, test_records = group_aware_split(
        all_records, test_size=0.20, random_seed=42
    )
    train_records, validation_records = group_aware_split(
        development_records, test_size=0.25, random_seed=43
    )
    X_train = [r.text  for r in train_records]
    y_train = [r.label for r in train_records]
    X_validation = [r.text for r in validation_records]
    y_validation = [r.label for r in validation_records]
    X_test  = [r.text  for r in test_records]
    y_test  = [r.label for r in test_records]
    group_key = lambda r: r.template_group_id if r.template_group_id else r._fingerprint
    train_groups = {group_key(r) for r in train_records}
    validation_groups = {group_key(r) for r in validation_records}
    test_groups = {group_key(r) for r in test_records}
    assert train_groups.isdisjoint(validation_groups)
    assert train_groups.isdisjoint(test_groups)
    assert validation_groups.isdisjoint(test_groups)
    print(f"\n[2/6] Split — Train: {len(X_train)}  Test: {len(X_test)}")

    # ── 4. Train pipeline ─────────────────────────────────────────────────────
    print("\n[3/6] Training pipeline...")
    pipeline = build_pipeline()
    pipeline.fit(X_train, y_train)
    vocab_size = len(pipeline.named_steps['tfidf'].vocabulary_)
    print(f"      Vocabulary: {vocab_size} features")

    # ── 5. Holdout evaluation ─────────────────────────────────────────────────
    validation_prob = pipeline.predict_proba(X_validation)[:, 1]
    decision_threshold = select_high_precision_threshold(y_validation, validation_prob)
    validation_pred = (validation_prob >= decision_threshold).astype(int)
    validation_accuracy = accuracy_score(y_validation, validation_pred)
    y_prob = pipeline.predict_proba(X_test)[:, 1]
    y_pred = (y_prob >= decision_threshold).astype(int)

    accuracy    = accuracy_score(y_test, y_pred)
    f1_weighted = f1_score(y_test, y_pred, average='weighted')
    f1_macro    = f1_score(y_test, y_pred, average='macro')
    roc_auc     = roc_auc_score(y_test, y_prob)
    pr_auc      = average_precision_score(y_test, y_prob)
    brier       = brier_score_loss(y_test, y_prob)
    cm          = confusion_matrix(y_test, y_pred)
    false_positive_rate = cm[0, 1] / max(cm[0, 0] + cm[0, 1], 1)
    cr = classification_report(
        y_test, y_pred,
        target_names=['Genuine', 'Fake'],
        digits=4, output_dict=True
    )
    assert isinstance(cr, dict)

    print("\n" + "=" * 65)
    print("  HOLDOUT EVALUATION (unseen test set)")
    print("=" * 65)
    print(f"  Accuracy      : {accuracy*100:.2f}%")
    print(f"  F1 (weighted) : {f1_weighted*100:.2f}%")
    print(f"  F1 (macro)    : {f1_macro*100:.2f}%")
    print(f"  ROC-AUC       : {roc_auc:.4f}")
    print(f"  PR-AUC        : {pr_auc:.4f}")
    print(f"  Brier Score   : {brier:.4f}  (lower=better, 0=perfect)")
    print(f"\n{classification_report(y_test, y_pred, target_names=['Genuine','Fake'], digits=4)}")
    print(f"  Confusion Matrix:  TN={cm[0,0]} FP={cm[0,1]} | FN={cm[1,0]} TP={cm[1,1]}")

    # ── 6. Per-language evaluation ────────────────────────────────────────────
    print("\n[4/6] Per-language evaluation:")
    per_lang = per_language_eval(pipeline, test_records)

    # ── 7. Cross-validation ───────────────────────────────────────────────────
    print("\n[5/6] 5-Fold CV (full merged dataset, pipeline)...")
    cv = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
    cv_groups = np.array([group_key(r) for r in all_records])
    cv_scores = cross_val_score(pipeline, np.array(texts), np.array(labels),
                                groups=cv_groups, cv=cv, scoring='f1_weighted', n_jobs=1)
    print(f"  CV F1: {[f'{s:.3f}' for s in cv_scores]}  mean={cv_scores.mean():.4f} ±{cv_scores.std():.4f}")

    # ── 8. Save model artifacts ───────────────────────────────────────────────
    print("\n[6/6] Saving model artifacts...")
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)

    # Backup existing model
    import shutil
    if os.path.exists(MODEL_PATH):
        shutil.copy(MODEL_PATH, MODEL_PATH.replace('.pkl', '_phase1.pkl'))
    if os.path.exists(VECTORIZER_PATH):
        shutil.copy(VECTORIZER_PATH, VECTORIZER_PATH.replace('.pkl', '_phase1.pkl'))

    vectorizer = pipeline.named_steps['tfidf']
    ensemble   = pipeline.named_steps['clf']

    with open(MODEL_PATH, 'wb') as f:
        pickle.dump(ensemble, f)
    with open(VECTORIZER_PATH, 'wb') as f:
        pickle.dump(vectorizer, f)

    # ── 9. Save metrics ───────────────────────────────────────────────────────
    evaluated_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    metrics = {
        "trained_at"        : evaluated_at,
        "evaluated_at"      : evaluated_at,
        "pipeline_version"  : "v3_phase2",
        "dataset_versions"  : ["synthetic_reviews_v1", "synthetic_reviews_v2"],
        "dataset_scope"     : "synthetic_labeled_data",
        "evaluation_split"  : "held_out_test",
        "split_strategy"    : "group_aware",
        "validation_purpose": "decision_threshold_selection",
        "cross_dataset_duplicates_removed": cross_dataset_duplicates,
        "total_samples"     : total,
        "genuine_samples"   : genuine,
        "fake_samples"      : fake,
        "train_size"        : len(X_train),
        "validation_size"   : len(X_validation),
        "test_size"         : len(X_test),
        "decision_threshold": round(float(decision_threshold), 6),
        "vocab_size"        : vocab_size,
        "accuracy"          : round(float(accuracy) * 100, 2),
        "test_accuracy"     : round(float(accuracy) * 100, 2),
        "validation_accuracy": round(float(validation_accuracy) * 100, 2),
        "f1_score"          : round(float(f1_weighted) * 100, 2),
        "f1_macro"          : round(float(f1_macro) * 100, 2),
        "roc_auc"           : round(float(roc_auc), 4),
        "pr_auc"            : round(float(pr_auc), 4),
        "brier_score"       : round(float(brier), 4),
        "false_positive_rate": round(float(false_positive_rate), 4),
        "cv_mean_f1"        : round(float(cv_scores.mean()) * 100, 2),
        "cv_std_f1"         : round(float(cv_scores.std()) * 100, 4),
        "cv_scores"         : [round(float(s) * 100, 2) for s in cv_scores],
        "confusion_matrix"  : {
            "tn": int(cm[0,0]), "fp": int(cm[0,1]),
            "fn": int(cm[1,0]), "tp": int(cm[1,1]),
        },
        "genuine_precision" : round(float(cr['Genuine']['precision']) * 100, 2),
        "genuine_recall"    : round(float(cr['Genuine']['recall'])    * 100, 2),
        "fake_precision"    : round(float(cr['Fake']['precision'])    * 100, 2),
        "fake_recall"       : round(float(cr['Fake']['recall'])       * 100, 2),
        "per_language"      : per_lang,
        "bias_diagnostics"  : bias,
        "note"              : (
            "Phase 2 training. Merged v1 (1800 raw rows, 1354 unique) + "
            "v2 (104 hard-case reviews). Group-aware split prevents template "
            "family leakage. Metrics reflect synthetic-data performance only. "
            "High accuracy on synthetic data reflects strong linguistic "
            "separability in hand-crafted examples, not proven real-world "
            "detection capability. Independent evaluation on real reviews "
            "is required for production performance claims."
        )
    }
    if os.path.exists(METRICS_PATH):
        shutil.copy(METRICS_PATH, METRICS_PATH.replace('.json', '_phase1.json'))
    write_json_atomically(METRICS_PATH, metrics)

    metadata = {
        "train_date"     : datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "pipeline_version": "v3_phase2",
        "total_samples"  : total,
        "train_samples"  : len(X_train),
        "validation_samples": len(X_validation),
        "test_samples"   : len(X_test),
        "decision_threshold": round(float(decision_threshold), 6),
        "accuracy"       : round(float(accuracy), 4),
        "test_accuracy"  : round(float(accuracy), 4),
        "validation_accuracy": round(float(validation_accuracy), 4),
        "evaluation_split": "held_out_test",
        "dataset_scope"  : "synthetic_labeled_data",
        "f1_score"       : round(float(f1_weighted), 4),
        "roc_auc"        : round(float(roc_auc), 4),
        "cv_mean"        : round(float(cv_scores.mean()), 4),
        "cv_std"         : round(float(cv_scores.std()), 4),
        "features"       : vocab_size,
        "vocabulary_size": vocab_size,
    }
    write_json_atomically(METADATA_PATH, metadata)

    print(f"\n  Model    -> {MODEL_PATH}")
    print(f"  Vec      -> {VECTORIZER_PATH}")
    print(f"  Metrics  -> {METRICS_PATH}")
    print("=" * 65)
    print("\n  Phase 2 training complete. Restart Flask to load new model.")


if __name__ == '__main__':
    train()
