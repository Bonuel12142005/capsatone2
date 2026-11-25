"""Bridge 8-column participant_reviews_template.csv to 7-column reviews.csv with consent traceability."""
import csv
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from validate_real_world_dataset import REVIEWS_COLS, PII_PATTERNS

PARTICIPANT_COLS = REVIEWS_COLS + ['consent_reference']
VALID_CONSENT_STATUS = {'active'}


def bridge_participant_reviews(participant_csv: str, consent_registry_csv: str, out_reviews_csv: str, out_trace_csv: str) -> dict:
    if os.path.exists(out_reviews_csv) or os.path.exists(out_trace_csv):
        raise FileExistsError("Output files already exist; refusing to overwrite.")

    consent_status = {}
    with open(consent_registry_csv, 'r', encoding='utf-8-sig', newline='') as fc:
        for row in csv.DictReader(fc):
            cref = (row.get('consent_reference') or '').strip()
            status = (row.get('status') or '').strip().lower()
            if cref:
                consent_status[cref] = status

    with open(participant_csv, 'r', encoding='utf-8-sig', newline='') as fp:
        reader = csv.DictReader(fp)
        if reader.fieldnames != PARTICIPANT_COLS:
            raise ValueError(f"Schema mismatch. Expected {PARTICIPANT_COLS}, got {reader.fieldnames}")
        rows = list(reader)

    accepted_reviews, trace_rows, rejected = [], [], []
    seen_ids = set()

    for idx, r in enumerate(rows, start=2):
        rid = (r.get('review_id') or '').strip()
        text = (r.get('review_text') or '').strip()
        cref = (r.get('consent_reference') or '').strip()
        reasons = []

        if not rid or not text:
            reasons.append('missing_id_or_text')
        elif rid in seen_ids:
            reasons.append('duplicate_review_id')
        if not cref:
            reasons.append('missing_consent_reference')
        elif consent_status.get(cref) not in VALID_CONSENT_STATUS:
            reasons.append(f"invalid_or_inactive_consent:{consent_status.get(cref, 'unknown')}")
        for pii_name, pat in PII_PATTERNS.items():
            if text and pat.search(text):
                reasons.append(f'pii_{pii_name}')

        if reasons:
            rejected.append({'row': idx, 'review_id': rid, 'reasons': ';'.join(reasons)})
            continue

        seen_ids.add(rid)
        accepted_reviews.append({k: r[k] for k in REVIEWS_COLS})
        trace_rows.append({'review_id': rid, 'consent_reference': cref})

    with open(out_reviews_csv, 'w', encoding='utf-8', newline='') as fr:
        w = csv.DictWriter(fr, fieldnames=REVIEWS_COLS)
        w.writeheader()
        w.writerows(accepted_reviews)

    with open(out_trace_csv, 'w', encoding='utf-8', newline='') as ft:
        w = csv.DictWriter(ft, fieldnames=['review_id', 'consent_reference'])
        w.writeheader()
        w.writerows(trace_rows)

    return {'total': len(rows), 'accepted': len(accepted_reviews), 'rejected': len(rejected), 'rejected_details': rejected}

