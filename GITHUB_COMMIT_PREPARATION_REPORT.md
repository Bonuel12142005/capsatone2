# EchoTrace — Phase 4.4: GitHub Commit Preparation & Final Staged-File Audit

**Date:** 2026-11-25  
**Branch:** `main`  
**Remote:** `origin` (`https://github.com/Bonuel12142005/capsatone2.git`)  
**Pre-Existing Staged Files:** `0` (all changes are unstaged or untracked).

---

## A. Safe and Necessary Files to Include (Recommended First-Commit Scope)
1. **Core Application Source:**
   - `backend/api/index.php`, `backend/controllers/*`, `backend/models/User.php`, `backend/services/GoogleAuthService.php`, `backend/services/OtpService.php`
   - `frontend/index.html`, `frontend/css/style.css`, `frontend/js/app.js`, `frontend/js/auth.js`, `frontend/js/review-parser.js`
   - `chrome_extension/popup/popup.html`, `chrome_extension/popup/popup.js`
   - `python_ai/app.py`
2. **Frozen Production ML Artifacts:**
   - `python_ai/models/fake_review_model.pkl`, `python_ai/models/tfidf_vectorizer.pkl`, `python_ai/models/model_metadata.json`, `python_ai/models/training_metrics.json`
3. **Database Migrations & Tests:**
   - `database/migrations/20261124_add_otp_purpose.php`, `database/migrations/20261124_add_otp_purpose.sql`
   - `tests/*`
4. **Ignore Rules & Real-World Research Templates/Utilities:**
   - `.gitignore`
   - `python_ai/real_world/` (templates, documentation, and read-only utilities; private batch/consent/packet paths are already ignored by `.gitignore`)
5. **Audit & Finalization Reports:**
   - `FINAL_SYSTEM_REGRESSION_REPORT.md`, `RAILWAY_DEPLOYMENT_READINESS_REPORT.md`, `GITHUB_PRE_PUSH_AUDIT.md`, `python_ai/PRODUCTION_MODEL_FINALIZATION_REPORT.md`

## B. Files to Exclude
- Already ignored by `.gitignore`: `cache/`, `scratch/`, `python_ai/models/candidates/`, `.env`, `*.db`, `*.sqlite3`, `python_ai/real_world/batches/`, `python_ai/real_world/packets/`, `assignments_manifest.json`, `*.private.csv`, `*consent_trace*.csv`, `*consent_registry*.csv`.

## C. Files Needing Manual Decision
- `python_ai/eval_baseline.py` and `python_ai/fast_benchmark.py`: Experimental benchmark scripts (not required by `python_ai/app.py` runtime). Recommend **excluding** from the production commit unless you want them archived for reproducibility.
- `python_ai/experiment_models.py`, `python_ai/run_baseline_eval.py`, `python_ai/run_candidate_experiment.py`, `python_ai/baseline_evaluation_results.json`: Research/experimentation scripts and baseline JSON; safe to include if desired for thesis reproducibility.

## D. Secret & Privacy Blockers
- **0** `.env` files, private databases, or real-world participant batches appear in `git status --short`.

## E. Missing Deployment Files
- `Dockerfile` / `railway.toml` / `Procfile` for Railway multi-service deployment (PHP + Python Flask AI) are not yet created (documented in `RAILWAY_DEPLOYMENT_READINESS_REPORT.md`).

