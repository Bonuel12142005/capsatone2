"""Read-only validator for EchoTrace 3-table dual-blind real-world datasets."""
import csv
import re
import sys
import unicodedata
from collections import Counter, defaultdict

REVIEWS_COLS = ['review_id', 'review_text', 'platform', 'product_category', 'language', 'collection_source', 'collection_date']
LABELS_COLS = ['review_id', 'reviewer_id', 'assigned_label', 'label_confidence', 'submitted_at']
ADJ_COLS = ['review_id', 'final_label', 'adjudication_status', 'adjudicator_id', 'adjudication_reason']

ALLOWED_LABELS = {'genuine', 'fake', 'uncertain'}
ALLOWED_CONFIDENCE = {'high', 'medium', 'low'}
ALLOWED_ADJUDICATION = {'pending', 'agreed', 'adjudicated'}

PII_PATTERNS = {
    'email': re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'),
    'phone': re.compile(r'(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)\d{3,4}[-.\s]?\d{4}'),
}


def normalize_text(text: str) -> str:
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', text).strip().lower())


def fingerprint(text: str) -> str:
    return ' '.join(sorted(re.findall(r'\w+', normalize_text(text))))


def _read_csv(path: str, expected_cols: list, errors: list, name: str) -> list:
    with open(path, 'r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != expected_cols:
            errors.append(f"{name} schema mismatch. Expected {expected_cols}, got {reader.fieldnames}")
            return []
        return list(reader)


def validate_dataset(reviews_path: str, labels_path: str, adj_path: str) -> dict:
    errors, warnings = [], []
    reviews = _read_csv(reviews_path, REVIEWS_COLS, errors, 'reviews')
    labels = _read_csv(labels_path, LABELS_COLS, errors, 'reviewer_labels')
    adjs = _read_csv(adj_path, ADJ_COLS, errors, 'adjudications')
    if errors:
        return {'valid': False, 'errors': errors, 'warnings': warnings, 'total_reviews': 0}

    review_ids = set()
    norm_map, fp_map = defaultdict(list), defaultdict(list)
    for idx, r in enumerate(reviews, start=2):
        rid = (r.get('review_id') or '').strip()
        text = (r.get('review_text') or '').strip()
        if not rid or not text:
            errors.append(f"reviews row {idx}: missing review_id or review_text")
            continue
        if rid in review_ids:
            errors.append(f"reviews row {idx}: duplicate review_id '{rid}'")
        review_ids.add(rid)
        for pii_name, pat in PII_PATTERNS.items():
            if pat.search(text):
                errors.append(f"reviews row {idx} ({rid}): potential unredacted {pii_name}")
        norm_map[normalize_text(text)].append(rid)
        fp_map[fingerprint(text)].append(rid)

    subs_by_rid = defaultdict(list)
    seen_pairs = set()
    for idx, row in enumerate(labels, start=2):
        rid = (row.get('review_id') or '').strip()
        rev_id = (row.get('reviewer_id') or '').strip()
        lbl = (row.get('assigned_label') or '').strip().lower()
        conf = (row.get('label_confidence') or '').strip().lower()
        if rid not in review_ids:
            errors.append(f"reviewer_labels row {idx}: unknown review_id '{rid}'")
        if not rev_id:
            errors.append(f"reviewer_labels row {idx}: missing reviewer_id")
        if (rid, rev_id) in seen_pairs:
            errors.append(f"reviewer_labels row {idx}: duplicate submission for ({rid}, {rev_id})")
        seen_pairs.add((rid, rev_id))
        if lbl not in ALLOWED_LABELS:
            errors.append(f"reviewer_labels row {idx}: invalid assigned_label '{lbl}'")
        if conf not in ALLOWED_CONFIDENCE:
            errors.append(f"reviewer_labels row {idx}: invalid label_confidence '{conf}'")
        subs_by_rid[rid].append(lbl)

    adj_by_rid = {}
    for idx, row in enumerate(adjs, start=2):
        rid = (row.get('review_id') or '').strip()
        flbl = (row.get('final_label') or '').strip().lower()
        status = (row.get('adjudication_status') or '').strip().lower()
        if rid not in review_ids:
            errors.append(f"adjudications row {idx}: unknown review_id '{rid}'")
        if rid in adj_by_rid:
            errors.append(f"adjudications row {idx}: duplicate adjudication for '{rid}'")
        if flbl and flbl not in ALLOWED_LABELS:
            errors.append(f"adjudications row {idx}: invalid final_label '{flbl}'")
        if status not in ALLOWED_ADJUDICATION:
            errors.append(f"adjudications row {idx}: invalid adjudication_status '{status}'")
        adj_by_rid[rid] = row

    agreements, disagreements, unresolved = 0, 0, 0
    for rid in review_ids:
        r_labels = subs_by_rid.get(rid, [])
        if len(r_labels) != 2:
            errors.append(f"review '{rid}': expected 2 independent reviewer submissions, found {len(r_labels)}")
            continue
        adj = adj_by_rid.get(rid)
        if not adj:
            errors.append(f"review '{rid}': missing adjudication record")
            continue
        status = (adj.get('adjudication_status') or '').strip().lower()
        flbl = (adj.get('final_label') or '').strip().lower()
        if r_labels[0] == r_labels[1]:
            agreements += 1
            if status == 'pending' or not flbl:
                unresolved += 1
                errors.append(f"review '{rid}': agreed labels require final_label and non-pending status")
        else:
            disagreements += 1
            if status != 'adjudicated' or not flbl or not (adj.get('adjudicator_id') or '').strip() or not (adj.get('adjudication_reason') or '').strip():
                unresolved += 1
                errors.append(f"review '{rid}': reviewer disagreement ({r_labels[0]} vs {r_labels[1]}) requires adjudication_status='adjudicated', final_label, adjudicator_id, and adjudication_reason")

    if any(len(v) > 1 for v in norm_map.values()):
        warnings.append(f"Exact normalized duplicates: {sum(1 for v in norm_map.values() if len(v) > 1)} group(s)")
    if any(len(v) > 1 for v in fp_map.values()):
        warnings.append(f"Near-duplicate / template clusters: {sum(1 for v in fp_map.values() if len(v) > 1)} group(s)")

    return {
        'valid': len(errors) == 0,
        'total_reviews': len(review_ids),
        'agreements': agreements,
        'disagreements': disagreements,
        'unresolved': unresolved,
        'final_label_counts': dict(Counter((adj_by_rid[r].get('final_label') or '').strip().lower() for r in adj_by_rid)),
        'errors': errors,
        'warnings': warnings,
    }


if __name__ == '__main__':
    if len(sys.argv) != 4:
        print("Usage: python validate_real_world_dataset.py <reviews.csv> <reviewer_labels.csv> <adjudications.csv>")
        sys.exit(2)
    res = validate_dataset(sys.argv[1], sys.argv[2], sys.argv[3])
    print(f"Valid: {res['valid']} | Reviews: {res['total_reviews']} | Agreed: {res.get('agreements', 0)} | Disagreed: {res.get('disagreements', 0)} | Labels: {res.get('final_label_counts', {})}")
    for w in res['warnings']:
        print(f"  WARN: {w}")
    for e in res['errors']:
        print(f"  ERROR: {e}")
    sys.exit(0 if res['valid'] else 1)
