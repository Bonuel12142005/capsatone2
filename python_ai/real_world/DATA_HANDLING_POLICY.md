# EchoTrace — Real-World Data Handling Policy

## 1. Separation of Consent & Review Data
- Signed consent records (`[CONSENT_REF_ID]`) are stored in an access-restricted folder **separate** from `python_ai/real_world/` evaluation datasets.
- `participant_reviews_template.csv` links to consent only via the pseudonymous `consent_reference` token.

## 2. Raw Export Storage & PII Redaction
- Raw exports must never be placed inside the Git repository or public directories.
- Before intake, all usernames, emails, phone numbers, order IDs, and addresses must be redacted using neutral placeholders (`[USER]`, `[EMAIL]`, `[PHONE]`, `[ORDER_ID]`).

## 3. Rejected Records, Retention & Deletion
- Records rejected by `intake_batch.py` (e.g., for unredacted PII or invalid dates) are logged only by row index, `review_id`, and reason code—never raw text.
- Raw exports are securely deleted once intake and verification complete.

## 4. Prohibition on Public Release
- Never commit or push private exports, `assignments_manifest.json`, or raw participant reviews to GitHub or any public repository.

