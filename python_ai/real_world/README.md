# EchoTrace — Real-World Ecommerce Review Dataset & Evaluation Guide

## 1. Real-World Data Collection Policy
- **Authorized Sources Only:** User-provided ecommerce review exports, manually collected reviews by authorized project researchers, or public datasets whose licenses explicitly permit research and evaluation (e.g., Shopee, Lazada, Amazon, TikTok Shop).
- **Prohibited:** Bypassing login restrictions, CAPTCHAs, anti-bot protections, or access controls; scraping private customer data; inventing/generating synthetic records and labeling them as real-world.
- **Provenance Rule:** Exclude any record whose source permission or provenance is unclear.

## 2. Normalized 3-Table Dual-Blind Schema
To preserve independent reviewer submissions, disagreement tracking, and adjudication provenance, real-world data is stored across three linked CSVs joined by `review_id`:

### A. `reviews.csv` (from `reviews_template.csv`)
- `review_id`, `review_text`, `platform`, `product_category`, `language`, `collection_source`, `collection_date`

### B. `reviewer_labels.csv` (from `reviewer_labels_template.csv`)
- `review_id`, `reviewer_id`, `assigned_label` (`genuine` | `fake` | `uncertain`), `label_confidence` (`high` | `medium` | `low`), `submitted_at`
- Each `review_id` requires **two independent reviewer submissions** from distinct `reviewer_id`s. Reviewers must not see model predictions or each other's labels before submitting.

### C. `adjudications.csv` (from `adjudications_template.csv`)
- `review_id`, `final_label` (`genuine` | `fake` | `uncertain`), `adjudication_status` (`pending` | `agreed` | `adjudicated`), `adjudicator_id`, `adjudication_reason`
- Disagreements between Reviewer A and Reviewer B must be resolved via `adjudication_status=adjudicated` with `adjudicator_id` and `adjudication_reason`.

## 3. Privacy & PII Redaction
Remove usernames, phone numbers, email addresses, street addresses, order IDs, and personal tokens before storing. Replace with neutral placeholders (e.g., `[USER]`, `[PHONE]`, `[EMAIL]`, `[ORDER_ID]`) while preserving meaning.

## 4. Sample Size Limitations
- `eval_real_world.py` enforces a minimum floor of **30** adjudicated binary (`genuine`/`fake`) samples to prevent division/metric instability.
- **Limitation:** 30 samples is only a minimum sanity floor with wide confidence intervals; **100+ samples per subgroup** (platform, language, category) are recommended for statistically reliable subgroup comparisons.

## 5. Usage
```powershell
python python_ai/real_world/validate_real_world_dataset.py <reviews.csv> <reviewer_labels.csv> <adjudications.csv>
python python_ai/real_world/eval_real_world.py <reviews.csv> <reviewer_labels.csv> <adjudications.csv>
```
