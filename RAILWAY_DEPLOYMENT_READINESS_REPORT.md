# EchoTrace — Phase 4.2: Railway Deployment Readiness Report

**Date:** 2026-11-25  
**Verdict:** **READY WITH REQUIRED FIXES**

---

## 1. Service Architecture
EchoTrace consists of:
1. **PHP Web & Admin Backend (`backend/`, `frontend/`):** PHP + MySQL application.
2. **Python Flask AI Engine (`python_ai/app.py`):** Serves ML inference (`fake_review_model.pkl`, `tfidf_vectorizer.pkl`), NLP/OCR, and `GET /health` (`200 OK`).
3. **Database:** MySQL (managed Railway MySQL service required).
4. **Chrome Extension (`chrome_extension/`):** Client-side extension communicating with the deployed backend URLs.

## 2. Deployment Configuration Findings
| Item | Status | Notes |
|---|---|---|
| `python_ai/requirements.txt` | **READY** | Python dependencies defined. |
| `GET /health` endpoint | **READY** | Verified `200 OK` on `python_ai/app.py`. |
| `Dockerfile` / `railway.toml` / `Procfile` | **BLOCKER** | None present in repo root, `backend/`, or `python_ai/`; must be added for Railway multi-service deployment (PHP + Python). |
| Managed MySQL & Migrations | **WARNING** | Must provision Railway MySQL and import schema/migrations before traffic. |
| Ephemeral Container Storage | **WARNING** | Local uploads/screenshots on container disk are lost on redeploy unless backed by a Railway Volume or external storage. |
| Environment Variables & Secrets | **WARNING** | Must configure DB credentials, Brevo SMTP key, Google OAuth client/redirect URI, and production CORS origins in Railway Variables (never commit `.env`). |

## 3. Recommended Deployment Sequence
1. Provision Railway **MySQL** service and import database schema.
2. Deploy **Python Flask AI** service (`python_ai/`, start via Gunicorn bound to `0.0.0.0:$PORT`, health check `/health`).
3. Deploy **PHP Web/Admin** service (`backend/` + `frontend/`), pointing it to the internal/public Flask AI URL and Railway MySQL.
4. Configure Google OAuth redirect URIs, Brevo SMTP variables, and Chrome Extension production API URL.
5. Run post-deploy smoke tests (`/health`, auth/OTP, paste-review scan, trust score, admin login).

