"""Blinded dual-reviewer assignment, packet generation, and submission merge workflow."""
import csv
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from validate_real_world_dataset import (
    REVIEWS_COLS, LABELS_COLS, ADJ_COLS,
    ALLOWED_LABELS, ALLOWED_CONFIDENCE, PII_PATTERNS
)

PACKET_COLS = ['review_id', 'review_text', 'platform', 'product_category', 'language', 'assigned_label', 'label_confidence']


def assign_and_generate_packets(reviews_csv: str, reviewer_a_id: str, reviewer_b_id: str, out_dir: str, batch_id: str = '') -> dict:
    if not reviewer_a_id.strip() or not reviewer_b_id.strip() or reviewer_a_id.strip() == reviewer_b_id.strip():
        raise ValueError("Two distinct non-empty pseudonymous reviewer IDs are required.")
    os.makedirs(out_dir, exist_ok=True)
    batch_id = batch_id.strip() or datetime.datetime.now().strftime('batch_%Y%m%d_%H%M%S')

    with open(reviews_csv, 'r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != REVIEWS_COLS:
            raise ValueError(f"reviews.csv schema mismatch: {reader.fieldnames}")
        rows = list(reader)

    review_ids = []
    for idx, r in enumerate(rows, start=2):
        rid = (r.get('review_id') or '').strip()
        text = (r.get('review_text') or '').strip()
        if not rid or not text:
            raise ValueError(f"Row {idx}: missing review_id or review_text")
        if rid in review_ids:
            raise ValueError(f"Row {idx}: duplicate review_id '{rid}'")
        for pii_name, pat in PII_PATTERNS.items():
            if pat.search(text):
                raise ValueError(f"Row {idx} ({rid}): unredacted {pii_name} detected")
        review_ids.append(rid)

    manifest = {
        'batch_id': batch_id,
        'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'reviewer_a_id': reviewer_a_id.strip(),
        'reviewer_b_id': reviewer_b_id.strip(),
        'review_ids': review_ids,
    }
    manifest_path = os.path.join(out_dir, 'assignments_manifest.json')
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)

    for pkt_name in ('reviewer_A_packet.csv', 'reviewer_B_packet.csv'):
        pkt_path = os.path.join(out_dir, pkt_name)
        with open(pkt_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=PACKET_COLS)
            writer.writeheader()
            for r in rows:
                writer.writerow({
                    'review_id': r['review_id'].strip(),
                    'review_text': r['review_text'],
                    'platform': r['platform'],
                    'product_category': r['product_category'],
                    'language': r['language'],
                    'assigned_label': '',
                    'label_confidence': '',
                })

    return manifest


def _read_packet(packet_path: str, expected_ids: set) -> dict:
    with open(packet_path, 'r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != PACKET_COLS:
            raise ValueError(f"Packet schema mismatch in {packet_path}: {reader.fieldnames}")
        subs = {}
        for idx, row in enumerate(reader, start=2):
            rid = (row.get('review_id') or '').strip()
            lbl = (row.get('assigned_label') or '').strip().lower()
            conf = (row.get('label_confidence') or '').strip().lower()
            if rid not in expected_ids:
                raise ValueError(f"{packet_path} row {idx}: unauthorized or unknown review_id '{rid}'")
            if rid in subs:
                raise ValueError(f"{packet_path} row {idx}: duplicate submission for '{rid}'")
            if lbl not in ALLOWED_LABELS:
                raise ValueError(f"{packet_path} row {idx} ({rid}): invalid or missing assigned_label '{lbl}'")
            if conf not in ALLOWED_CONFIDENCE:
                raise ValueError(f"{packet_path} row {idx} ({rid}): invalid or missing label_confidence '{conf}'")
            subs[rid] = (lbl, conf)

    missing = expected_ids - set(subs.keys())
    if missing:
        raise ValueError(f"{packet_path}: missing submissions for {sorted(missing)}")
    return subs


def merge_submissions(manifest_path: str, packet_a_path: str, packet_b_path: str, out_labels_csv: str, out_adj_csv: str) -> dict:
    if os.path.exists(out_labels_csv) or os.path.exists(out_adj_csv):
        raise FileExistsError("Output files already exist; refusing to silently overwrite previous labels.")

    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    expected_ids = set(manifest['review_ids'])
    rev_a = manifest['reviewer_a_id']
    rev_b = manifest['reviewer_b_id']
    subs_a = _read_packet(packet_a_path, expected_ids)
    subs_b = _read_packet(packet_b_path, expected_ids)
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    agreements, disagreements, uncertain_agreed = 0, 0, 0
    with open(out_labels_csv, 'w', encoding='utf-8', newline='') as fl, \
         open(out_adj_csv, 'w', encoding='utf-8', newline='') as fa:
        lw = csv.DictWriter(fl, fieldnames=LABELS_COLS)
        aw = csv.DictWriter(fa, fieldnames=ADJ_COLS)
        lw.writeheader()
        aw.writeheader()

        for rid in manifest['review_ids']:
            lbl_a, conf_a = subs_a[rid]
            lbl_b, conf_b = subs_b[rid]
            lw.writerow({'review_id': rid, 'reviewer_id': rev_a, 'assigned_label': lbl_a, 'label_confidence': conf_a, 'submitted_at': now_iso})
            lw.writerow({'review_id': rid, 'reviewer_id': rev_b, 'assigned_label': lbl_b, 'label_confidence': conf_b, 'submitted_at': now_iso})

            if lbl_a == lbl_b:
                agreements += 1
                if lbl_a == 'uncertain':
                    uncertain_agreed += 1
                aw.writerow({'review_id': rid, 'final_label': lbl_a, 'adjudication_status': 'agreed', 'adjudicator_id': '', 'adjudication_reason': ''})
            else:
                disagreements += 1
                aw.writerow({'review_id': rid, 'final_label': '', 'adjudication_status': 'pending', 'adjudicator_id': '', 'adjudication_reason': f"Disagreement: {lbl_a} vs {lbl_b}"})

    return {'total': len(manifest['review_ids']), 'agreements': agreements, 'disagreements': disagreements, 'uncertain_agreed': uncertain_agreed}

