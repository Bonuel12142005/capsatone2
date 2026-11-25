# EchoTrace — Phase 3.4.1: Dataset License, Provenance & Research-Use Verification

**Access Date:** 2026-11-25  
**Scope:** Read-only rights and provenance audit. No datasets were downloaded, scraped, or imported.

---

## 1. Per-Dataset Verification

### A. `SEACrowd/shopee_reviews_tagalog`
- **Official URL:** `https://huggingface.co/datasets/SEACrowd/shopee_reviews_tagalog`
- **Publisher / Ecosystem:** SEACrowd (Southeast Asian Languages in Hugging Face), wrapping upstream `scaredmeow/shopee-reviews-tl-stars`.
- **License & Rights Analysis:**
  - **Verified:** The Hugging Face dataset card lists **MPL-2.0**.
  - **Unresolved / Limitation:** MPL-2.0 applies to the SEACrowd dataset loading script and packaging metadata. It does **not** prove that the upstream scraped Shopee user reviews carry an MPL-2.0 grant from the original review authors or Shopee.
- **Status:** **Permission confirmation required** (confirm institutional/academic research-use approval; do not redistribute raw text).

### B. `McAuley-Lab/Amazon-Reviews-2023`
- **Official URL:** `https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023`
- **Publisher:** McAuley Lab (UC San Diego).
- **License & Rights Analysis:**
  - **Verified:** Maintainers explicitly state they are *"not in a position to assign a license to this dataset or dictate the terms of its usage,"* while noting intended use for non-commercial academic research and student theses.
  - **Unresolved / Limitation:** No formal open-source license; commercial use is not permitted.
- **Privacy & Data Minimization:** Exclude `user_id` (reviewer ID) and `asin`/`parent_asin` before intake; retain only `review_text`, `collection_date` (derived from `timestamp`), and `product_category`.
- **Status:** **Permission confirmation required** (suitable for non-commercial thesis evaluation with data minimization, subject to institutional approval).

### C. `SEACrowd/lazada_review_filipino`
- **Official URL:** `https://huggingface.co/datasets/SEACrowd/lazada_review_filipino`
- **Publisher / Ecosystem:** SEACrowd / Hugging Face.
- **License & Rights Analysis:**
  - **Unresolved:** Underlying Lazada review text rights and upstream license terms are unverified.
- **Status:** **Excluded** until explicit permission/license is verified.

---

## 2. EchoTrace Schema Compatibility (`reviews_template.csv`)
- **Safe Mapping:** `review_id` (generated/pseudonymous), `review_text` (PII-redacted), `platform`, `product_category` (or `unknown`), `language` (verified by human annotators), `collection_source`, `collection_date` (`YYYY-MM-DD`).
- **Excluded / Anonymized:** Original usernames, `user_id`, `asin`, URLs, and 1–5 star sentiment ratings (sentiment must **never** be equated with `genuine`/`fake` labels).

---

## 3. Ranked Research Recommendation
1. **Authorized User / Researcher Exports (with explicit consent)** — Clearest permission, exact `collection_date`, and direct English/Tagalog/Taglish coverage.
2. **`SEACrowd/shopee_reviews_tagalog`** — *Permission confirmation required* (MPL-2.0 wrapper; strong Tagalog/Taglish Shopee relevance).
3. **`McAuley-Lab/Amazon-Reviews-2023`** — *Permission confirmation required* (academic/thesis use noted; English-only; requires `user_id`/`asin` removal).
4. **`SEACrowd/lazada_review_filipino`** — *Excluded* (unverified rights).

