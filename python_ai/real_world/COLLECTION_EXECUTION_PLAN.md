# EchoTrace — Phase 3.9: Real-World Collection Execution Plan

**Date:** 2026-11-25  
**Researcher:** Mc Kenlly Bonuel (`mckenllyhuertas@gmail.com`) | Mindoro State University  
**Collection Status:** **BLOCKED — approvals remain outstanding**

---

## 1. Outstanding Approvals Required Before Collection
Per `INSTITUTIONAL_READINESS_CHECKLIST.md`, all 7 Mindoro State University / capstone adviser confirmations remain pending:
1. Ethics review or exemption requirement.
2. Official university consent form template requirement.
3. Formal institutional authorization requirement.
4. Capstone adviser approval for data collection.
5. Applicable data privacy and retention requirements.
6. Permission to use external ecommerce review content.
7. Authorized protocol approver identity.

Once approved, remove `DRAFT — NOT FOR PARTICIPANT DISTRIBUTION` and update the `Ethics Approval / Reference` line in `PARTICIPANT_CONSENT.md`.

## 2. First-Batch Target & Rationale
- **Target:** **90–150** authorized, PII-redacted reviews (aiming for ≥30 per language: English, Tagalog, Taglish).
- **Rationale & Limitations:** Exceeds the 30-sample sanity floor in `eval_real_world.py` while remaining practical for dual-blind human labeling. Results on 90–150 samples are **preliminary** with wide confidence intervals; 100+ binary samples per subgroup are needed for generalizable subgroup claims.

## 3. Approved-Source Requirements
- **Primary:** Authorized user/researcher exports with signed `PARTICIPANT_CONSENT.md` and active `consent_reference`.
- **Prohibited:** Scraping, bypassing login/CAPTCHA/anti-bot controls, or using datasets without verified permission.

## 4. Exact Execution Sequence (Existing Utilities Only)
1. **Consent Verification:** Record active `consent_reference` entries in the protected consent registry.
2. **Consent Bridge (`consent_bridge.py`):** Map 8-column `participant_reviews_template.csv` → 7-column `reviews.csv` + protected `consent_trace.csv`.
3. **Dataset Intake (`intake_batch.py`):** Stage and promote batch with canonical SHA-256 fingerprint, PII check, and `quality_report.json`.
4. **Blinded Packet Generation (`blind_labeling.py`):** Generate `reviewer_A_packet.csv` and `reviewer_B_packet.csv`.
5. **Human Labeling & Adjudication (`blind_labeling.py`):** Merge independent submissions and adjudicate any disagreements.
6. **Dataset Validation (`validate_real_world_dataset.py`):** Confirm `valid=True` across all 3 tables.
7. **Read-Only Evaluation (`eval_real_world.py`):** Evaluate production `fake_review_model.pkl` + `tfidf_vectorizer.pkl` on adjudicated binary labels only.

## 5. Stop Conditions & Data-Protection Checks
- **Stop immediately** if any unredacted PII is detected, any `consent_reference` is withdrawn/unknown, or any batch file is not ignored by `.gitignore`.
- Never commit `batches/`, `packets/`, `assignments_manifest.json`, `*.private.csv`, or `*consent_*.csv` to Git.

