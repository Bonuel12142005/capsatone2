"""
EchoTrace — Data Loader & Dataset Utilities (Phase 2)
======================================================
Supports:
  - v1 CSV schema: review_text, label, language, deception_type, product_category
  - v2 CSV schema: above + data_source, generation_method, template_group_id

Provides:
  - Unicode + whitespace normalization
  - Exact and near-duplicate removal
  - Conflicting-label detection and flagging
  - Template-group-aware train/test split (no leakage across group boundaries)
  - Per-language and per-category metadata passthrough
"""

import csv
import os
import unicodedata
import random
from collections import defaultdict
from typing import List, Tuple, Set, Dict, Optional

REQUIRED_COLUMNS = {'review_text', 'label'}


# ── Normalization ─────────────────────────────────────────────────────────────

def normalize_text(text: str) -> str:
    """NFKC Unicode normalization + whitespace collapse + lowercase."""
    text = unicodedata.normalize('NFKC', text)
    text = ' '.join(text.split())
    return text.lower().strip()


def _token_fingerprint(text: str) -> str:
    """Sorted-token fingerprint for near-duplicate detection."""
    return ' '.join(sorted(text.split()))


# ── Record type ───────────────────────────────────────────────────────────────

class ReviewRecord:
    """Holds a single review with all metadata fields."""
    __slots__ = ('text', 'label', 'language', 'deception_type',
                 'product_category', 'data_source', 'generation_method',
                 'template_group_id', '_fingerprint')

    def __init__(self, text: str, label: int,
                 language: str = '', deception_type: str = '',
                 product_category: str = '', data_source: str = '',
                 generation_method: str = '', template_group_id: str = ''):
        self.text              = text
        self.label             = label
        self.language          = language
        self.deception_type    = deception_type
        self.product_category  = product_category
        self.data_source       = data_source
        self.generation_method = generation_method
        self.template_group_id = template_group_id
        self._fingerprint      = _token_fingerprint(text)


# ── CSV Loading ───────────────────────────────────────────────────────────────

def load_synthetic_csv(csv_path: str) -> List[Tuple[str, int]]:
    """
    Load and deduplicate the reviews CSV.
    Returns List[(normalized_text, label)] for backward compatibility
    with train_model.py.
    Prints an audit summary to stdout.
    """
    records = _load_records(csv_path)
    return [(r.text, r.label) for r in records]


def load_records(csv_path: str) -> List[ReviewRecord]:
    """Load full ReviewRecord objects including all metadata."""
    return _load_records(csv_path)


def _load_records(csv_path: str) -> List[ReviewRecord]:
    if not os.path.isfile(csv_path):
        raise FileNotFoundError(f"Dataset not found: {csv_path}")

    raw: List[ReviewRecord] = []
    with open(csv_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        headers = set(reader.fieldnames or [])
        missing = REQUIRED_COLUMNS - headers
        if missing:
            raise ValueError(f"CSV missing required columns: {missing}")

        for i, row in enumerate(reader, start=2):
            text_raw  = row.get('review_text', '').strip()
            label_raw = row.get('label', '').strip()
            if not text_raw or not label_raw:
                continue
            try:
                label = int(label_raw)
                if label not in (0, 1):
                    raise ValueError()
            except ValueError:
                raise ValueError(f"Invalid label at line {i}: '{label_raw}'")

            norm = normalize_text(text_raw)
            if not norm:
                continue

            raw.append(ReviewRecord(
                text              = norm,
                label             = label,
                language          = row.get('language', '').strip(),
                deception_type    = row.get('deception_type', '').strip(),
                product_category  = row.get('product_category', '').strip(),
                data_source       = row.get('data_source', '').strip(),
                generation_method = row.get('generation_method', '').strip(),
                template_group_id = row.get('template_group_id', '').strip(),
            ))

    total_raw = len(raw)

    # Conflict detection
    text_labels: Dict[str, Set[int]] = defaultdict(set)
    for r in raw:
        text_labels[r.text].add(r.label)
    conflicts = {t: lbls for t, lbls in text_labels.items() if len(lbls) > 1}
    if conflicts:
        print(f"[DataLoader] WARNING: {len(conflicts)} texts have conflicting labels — keeping first.")

    # Deduplication (exact text + near-duplicate fingerprint)
    seen_text: Set[str] = set()
    seen_fp:   Set[str] = set()
    clean: List[ReviewRecord] = []
    for r in raw:
        if r.text in seen_text:
            continue
        if r._fingerprint in seen_fp:
            continue
        seen_text.add(r.text)
        seen_fp.add(r._fingerprint)
        clean.append(r)

    removed = total_raw - len(clean)
    label0  = sum(1 for r in clean if r.label == 0)
    label1  = sum(1 for r in clean if r.label == 1)

    print(f"[DataLoader] Raw rows      : {total_raw}")
    print(f"[DataLoader] After dedup   : {len(clean)} (removed {removed})")
    print(f"[DataLoader] Genuine (0)   : {label0}")
    print(f"[DataLoader] Fake    (1)   : {label1}")
    print(f"[DataLoader] Conflicts     : {len(conflicts)}")

    return clean


# ── Template-Group-Aware Split ────────────────────────────────────────────────

def leak_safe_split(
    data: List[Tuple[str, int]],
    test_size: float = 0.20,
    random_seed: int = 42
) -> Tuple[List[Tuple[str, int]], List[Tuple[str, int]]]:
    """
    Backward-compatible split that works on (text, label) tuples.
    Groups by token fingerprint and assigns whole clusters to one split.
    Guarantees zero text/near-duplicate leakage.
    """
    rng = random.Random(random_seed)

    fp_to_samples: Dict[str, List[Tuple[str, int]]] = defaultdict(list)
    for text, label in data:
        fp = _token_fingerprint(text)
        fp_to_samples[fp].append((text, label))

    clusters_0 = [s for s in fp_to_samples.values()
                  if sum(l for _, l in s) / len(s) < 0.5]
    clusters_1 = [s for s in fp_to_samples.values()
                  if sum(l for _, l in s) / len(s) >= 0.5]

    rng.shuffle(clusters_0)
    rng.shuffle(clusters_1)

    def _assign(clusters, ratio):
        total   = sum(len(c) for c in clusters)
        target  = int(total * ratio)
        test_c, train_c, count = [], [], 0
        for c in clusters:
            if count < target:
                test_c.append(c)
                count += len(c)
            else:
                train_c.append(c)
        return train_c, test_c

    tr0, te0 = _assign(clusters_0, test_size)
    tr1, te1 = _assign(clusters_1, test_size)

    train_data = [s for c in tr0 + tr1 for s in c]
    test_data  = [s for c in te0 + te1 for s in c]

    train_texts = {t for t, _ in train_data}
    test_texts  = {t for t, _ in test_data}
    leaked = train_texts & test_texts
    assert len(leaked) == 0, f"Leakage: {len(leaked)} texts in both splits!"

    rng.shuffle(train_data)
    rng.shuffle(test_data)

    print(f"[DataLoader] Train samples : {len(train_data)}")
    print(f"[DataLoader] Test  samples : {len(test_data)}")
    print(f"[DataLoader] Leakage       : 0 (verified)")

    return train_data, test_data


def group_aware_split(
    records: List[ReviewRecord],
    test_size: float = 0.20,
    random_seed: int = 42
) -> Tuple[List[ReviewRecord], List[ReviewRecord]]:
    """
    Template-group-aware split for ReviewRecord objects.
    Keeps entire template_group_id clusters on the same side of the split.
    Falls back to fingerprint grouping when template_group_id is absent.
    """
    rng = random.Random(random_seed)

    # Group by template_group_id if available, else fingerprint
    group_map: Dict[str, List[ReviewRecord]] = defaultdict(list)
    for r in records:
        key = r.template_group_id if r.template_group_id else r._fingerprint
        group_map[key].append(r)

    groups = list(group_map.values())

    # Stratify by dominant label
    groups_0 = [g for g in groups if sum(r.label for r in g) / len(g) < 0.5]
    groups_1 = [g for g in groups if sum(r.label for r in g) / len(g) >= 0.5]

    rng.shuffle(groups_0)
    rng.shuffle(groups_1)

    def _assign_records(groups, ratio):
        total  = sum(len(g) for g in groups)
        target = int(total * ratio)
        te, tr, count = [], [], 0
        for g in groups:
            if count < target:
                te.append(g)
                count += len(g)
            else:
                tr.append(g)
        return [r for g in tr for r in g], [r for g in te for r in g]

    train_r0, test_r0 = _assign_records(groups_0, test_size)
    train_r1, test_r1 = _assign_records(groups_1, test_size)

    train_records = train_r0 + train_r1
    test_records  = test_r0  + test_r1

    # Verify no text leakage
    train_texts = {r.text for r in train_records}
    test_texts  = {r.text for r in test_records}
    leaked = train_texts & test_texts
    assert len(leaked) == 0, f"Group-split leakage: {len(leaked)} texts!"

    rng.shuffle(train_records)
    rng.shuffle(test_records)

    print(f"[DataLoader] Group-aware split  Train: {len(train_records)}  Test: {len(test_records)}")
    print(f"[DataLoader] Leakage: 0 (verified)")

    return train_records, test_records
