"""Read-only production evaluation script for 3-table dual-blind real-world datasets."""
import csv
import json
import os
import pickle
import sys
import numpy as np
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, average_precision_score, confusion_matrix, matthews_corrcoef
)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from validate_real_world_dataset import validate_dataset

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIN_BINARY_SAMPLES = 30


def compute_metrics(y_true, probs, threshold):
    preds = (probs >= threshold).astype(int)
    cm = confusion_matrix(y_true, preds, labels=[0, 1])
    tn, fp, fn, tp = cm.ravel()
    has_both = len(set(y_true)) == 2
    return {
        'n': int(len(y_true)),
        'accuracy': round(float(accuracy_score(y_true, preds)), 4),
        'precision': round(float(precision_score(y_true, preds, zero_division=0)), 4),
        'recall': round(float(recall_score(y_true, preds, zero_division=0)), 4),
        'f1': round(float(f1_score(y_true, preds, zero_division=0)), 4),
        'macro_f1': round(float(f1_score(y_true, preds, average='macro', zero_division=0)), 4),
        'roc_auc': round(float(roc_auc_score(y_true, probs)), 4) if has_both else None,
        'pr_auc': round(float(average_precision_score(y_true, probs)), 4) if has_both else None,
        'mcc': round(float(matthews_corrcoef(y_true, preds)), 4) if has_both else None,
        'fpr': round(float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0, 4),
        'fnr': round(float(fn / (fn + tp)) if (fn + tp) > 0 else 0.0, 4),
        'cm': {'tn': int(tn), 'fp': int(fp), 'fn': int(fn), 'tp': int(tp)},
    }


def evaluate_real_world(reviews_path: str, labels_path: str, adj_path: str):
    val_res = validate_dataset(reviews_path, labels_path, adj_path)
    if not val_res['valid']:
        print("Dataset validation failed:")
        for e in val_res['errors']:
            print(f"  ERROR: {e}")
        sys.exit(1)

    with open(reviews_path, 'r', encoding='utf-8-sig', newline='') as f:
        reviews = {r['review_id'].strip(): r for r in csv.DictReader(f)}
    with open(adj_path, 'r', encoding='utf-8-sig', newline='') as f:
        adjs = {r['review_id'].strip(): r for r in csv.DictReader(f)}

    excluded_uncertain, excluded_unresolved = 0, 0
    eval_rows = []
    for rid, r in reviews.items():
        adj = adjs.get(rid, {})
        status = (adj.get('adjudication_status') or '').strip().lower()
        flbl = (adj.get('final_label') or '').strip().lower()
        if status not in {'agreed', 'adjudicated'}:
            excluded_unresolved += 1
            continue
        if flbl == 'uncertain':
            excluded_uncertain += 1
            continue
        if flbl in {'genuine', 'fake'}:
            eval_rows.append((r, 1 if flbl == 'fake' else 0))

    print(f"Excluded: uncertain={excluded_uncertain}, unresolved={excluded_unresolved}")
    if len(eval_rows) < MIN_BINARY_SAMPLES:
        print(f"Insufficient adjudicated binary samples ({len(eval_rows)} < {MIN_BINARY_SAMPLES}). Refusing to compute misleading metrics.")
        sys.exit(2)

    with open(os.path.join(BASE_DIR, 'models', 'fake_review_model.pkl'), 'rb') as f:
        model = pickle.load(f)
    with open(os.path.join(BASE_DIR, 'models', 'tfidf_vectorizer.pkl'), 'rb') as f:
        vectorizer = pickle.load(f)
    with open(os.path.join(BASE_DIR, 'models', 'model_metadata.json'), 'r', encoding='utf-8') as f:
        threshold = float(json.load(f).get('decision_threshold', 0.50))

    texts = [r['review_text'] for r, _ in eval_rows]
    y_true = np.array([y for _, y in eval_rows])
    probs = model.predict_proba(vectorizer.transform(texts))[:, 1]

    overall = compute_metrics(y_true, probs, threshold)
    print(f"Overall (n={overall['n']}): Acc={overall['accuracy']*100:.2f}% | MacroF1={overall['macro_f1']*100:.2f}% | CM={overall['cm']}")

    for col in ['platform', 'language', 'product_category']:
        for val in sorted({r[col].strip() for r, _ in eval_rows if r[col].strip()}):
            idx = [i for i, (r, _) in enumerate(eval_rows) if r[col].strip() == val]
            if len(idx) >= 5:
                m = compute_metrics(y_true[idx], probs[idx], threshold)
                print(f"  [{col}={val}] n={m['n']} Acc={m['accuracy']*100:.2f}% MacroF1={m['macro_f1']*100:.2f}%")


if __name__ == '__main__':
    if len(sys.argv) != 4:
        print("Usage: python eval_real_world.py <reviews.csv> <reviewer_labels.csv> <adjudications.csv>")
        sys.exit(2)
    evaluate_real_world(sys.argv[1], sys.argv[2], sys.argv[3])
