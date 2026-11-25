"""Controlled intake and quality-assurance utility for authorized real-world review batches."""
import csv
import datetime
import hashlib
import json
import os
import re
import shutil
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from validate_real_world_dataset import REVIEWS_COLS, PII_PATTERNS, normalize_text, fingerprint

DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def _valid_date(val: str) -> bool:
    if not DATE_RE.match(val):
        return False
    try:
        datetime.date.fromisoformat(val)
        return True
    except ValueError:
        return False


def intake_batch(source_csv: str, out_base_dir: str, batch_id: str, provenance: dict) -> dict:
    req_prov = ('source', 'collection_method', 'collection_date', 'permission_basis')
    missing_prov = [k for k in req_prov if not (provenance.get(k) or '').strip()]
    if missing_prov:
        raise ValueError(f"Missing required provenance fields: {missing_prov}")
    if not _valid_date(provenance['collection_date'].strip()):
        raise ValueError(f"Invalid provenance collection_date: {provenance['collection_date']}")

    batch_dir = os.path.join(out_base_dir, batch_id)
    if os.path.exists(batch_dir):
        raise FileExistsError(f"Batch directory already exists: {batch_dir}")

    with open(source_csv, 'r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != REVIEWS_COLS:
            raise ValueError(f"Schema mismatch. Expected {REVIEWS_COLS}, got {reader.fieldnames}")
        rows = list(reader)

    canonical_rows = sorted(json.dumps({k: (r.get(k) or '') for k in REVIEWS_COLS}, sort_keys=True) for r in rows)
    dataset_fp = hashlib.sha256('\n'.join(canonical_rows).encode('utf-8')).hexdigest()

    if os.path.exists(out_base_dir):
        for existing in os.listdir(out_base_dir):
            m_path = os.path.join(out_base_dir, existing, 'batch_manifest.json')
            if os.path.isfile(m_path):
                with open(m_path, 'r', encoding='utf-8') as fm:
                    if json.load(fm).get('dataset_fingerprint') == dataset_fp:
                        raise ValueError(f"Re-import prevented: dataset fingerprint already exists in batch '{existing}'")

    accepted, rejected = [], []
    seen_ids = set()
    norm_map, fp_map = defaultdict(list), defaultdict(list)
    pii_count, missing_meta_count = 0, 0

    for idx, r in enumerate(rows, start=2):
        rid = (r.get('review_id') or '').strip()
        text = (r.get('review_text') or '').strip()
        cdate = (r.get('collection_date') or '').strip()
        csrc = (r.get('collection_source') or '').strip()
        reasons = []

        if not rid or not text:
            reasons.append('missing_id_or_text')
        elif rid in seen_ids:
            reasons.append('duplicate_review_id')
        if not csrc:
            reasons.append('missing_collection_source')
            missing_meta_count += 1
        if not _valid_date(cdate):
            reasons.append('invalid_collection_date')
        for pii_name, pat in PII_PATTERNS.items():
            if text and pat.search(text):
                reasons.append(f'pii_{pii_name}')
                pii_count += 1

        if reasons:
            rejected.append({'row': idx, 'review_id': rid, 'reasons': ';'.join(reasons)})
            continue

        seen_ids.add(rid)
        norm_map[normalize_text(text)].append(rid)
        fp_map[fingerprint(text)].append(rid)
        accepted.append(r)

    exact_dup_groups = sum(1 for v in norm_map.values() if len(v) > 1)
    near_dup_groups = sum(1 for v in fp_map.values() if len(v) > 1)

    os.makedirs(out_base_dir, exist_ok=True)
    staging_dir = os.path.join(out_base_dir, f".tmp_{batch_id}_{os.getpid()}")
    if os.path.exists(staging_dir):
        shutil.rmtree(staging_dir)
    os.makedirs(staging_dir, exist_ok=False)
    try:
        with open(os.path.join(staging_dir, 'reviews.csv'), 'w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=REVIEWS_COLS)
            w.writeheader()
            w.writerows(accepted)

        if rejected:
            with open(os.path.join(staging_dir, 'rejected_records.csv'), 'w', encoding='utf-8', newline='') as f:
                w = csv.DictWriter(f, fieldnames=['row', 'review_id', 'reasons'])
                w.writeheader()
                w.writerows(rejected)

        quality_report = {
            'batch_id': batch_id,
            'total_records': len(rows),
            'accepted': len(accepted),
            'rejected': len(rejected),
            'platform_distribution': dict(Counter((r.get('platform') or '').strip() for r in accepted)),
            'language_distribution': dict(Counter((r.get('language') or '').strip() for r in accepted)),
            'category_distribution': dict(Counter((r.get('product_category') or '').strip() for r in accepted)),
            'exact_duplicate_groups': exact_dup_groups,
            'near_duplicate_clusters': near_dup_groups,
            'pii_detections': pii_count,
            'missing_metadata_count': missing_meta_count,
        }
        manifest = {
            'batch_id': batch_id,
            'imported_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'provenance': provenance,
            'dataset_fingerprint': dataset_fp,
            'status': 'accepted' if accepted else 'rejected',
        }
        with open(os.path.join(staging_dir, 'quality_report.json'), 'w', encoding='utf-8') as f:
            json.dump(quality_report, f, indent=2)
        with open(os.path.join(staging_dir, 'batch_manifest.json'), 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2)

        os.replace(staging_dir, batch_dir)
    except Exception:
        if os.path.exists(staging_dir):
            shutil.rmtree(staging_dir, ignore_errors=True)
        raise

    return {'manifest': manifest, 'quality_report': quality_report}

