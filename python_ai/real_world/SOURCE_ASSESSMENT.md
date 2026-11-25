# EchoTrace — Phase 3.4: Real-World Dataset Source Assessment

**Access Date:** 2026-11-25  
**Scope:** Research and planning only. No datasets were downloaded, scraped, or imported.

## 1. Candidate Source Assessment

| Dataset / Source | Official URL | Publisher | Platforms | Languages | Labels Provided | License / Permission | Suitability & Limitations |
|---|---|---|---|---|---|---|---|
| **SEACrowd Shopee Reviews Tagalog** (`SEACrowd/shopee_reviews_tagalog`) | `https://huggingface.co/datasets/SEACrowd/shopee_reviews_tagalog` | SEACrowd / Hugging Face | Shopee | Tagalog / Taglish | 1–5 star sentiment (no fake/genuine labels) | **MPL-2.0** (explicit) | **High** for Tagalog/Taglish Shopee text; requires EchoTrace dual-blind fake/genuine labeling; verify `collection_date` availability. |
| **SEACrowd Lazada Reviews Filipino** (`SEACrowd/lazada_review_filipino`) | `https://huggingface.co/datasets/SEACrowd/lazada_review_filipino` | SEACrowd / Hugging Face | Lazada | Filipino / Tagalog | 1–5 star sentiment (no fake/genuine labels) | Unverified on card (SEACrowd research ecosystem) | **Medium**; must verify exact license on dataset card before download; requires EchoTrace dual-blind labeling. |
| **Amazon Reviews 2023** (`McAuley-Lab/Amazon-Reviews-2023`) | `https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023` | McAuley Lab (UC San Diego) | Amazon | English (primarily) | Metadata/ratings (no fake/genuine labels) | **No formal license** (authors permit non-commercial academic/thesis use) | **Medium** for English baseline; commercial use restricted; requires EchoTrace dual-blind labeling. |
| **Authorized User / Researcher Exports** | Project-internal (user-provided / manual export) | EchoTrace Researchers / Consenting Users | Shopee, Lazada, TikTok Shop, Amazon | English, Tagalog, Taglish | None (requires dual-blind labeling) | Explicit user/researcher consent | **High** for small initial batch (e.g., 50–150 reviews) with exact `collection_date`, `platform`, and `product_category`; requires strict PII redaction. |

## 2. Schema Compatibility (`reviews_template.csv`)
Required fields: `review_id, review_text, platform, product_category, language, collection_source, collection_date`.
- **Missing metadata handling:** Never invent missing `product_category` or `collection_date`. Use `unknown` for missing `product_category`, and document dataset-level date ranges or exclude records if `intake_batch.py` requires exact `YYYY-MM-DD` dates.
- **Labels:** None of the public sentiment datasets provide ground-truth `genuine`/`fake` labels; all imported records must go through `blind_labeling.py` (dual-blind human annotation).

## 3. Recommendation for Initial Evaluation Batch
1. **Primary:** **SEACrowd Shopee Reviews Tagalog** (explicit **MPL-2.0** license, strong Tagalog/Taglish coverage) + **Authorized Researcher/User Exports** (exact `collection_date` and multi-platform Taglish/English coverage).
2. **Secondary (English):** **Amazon Reviews 2023** (for English-only academic benchmarking, noting no formal license).
3. **Unresolved Permission Issues:** Verify the exact license field of `SEACrowd/lazada_review_filipino` before any download.

