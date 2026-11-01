# EchoTrace repeatable test plan

Automated checks cover normalization/deduplication, label mapping, fake-only filtering,
threshold selection, syntax, and API validation. HTML fixtures represent a visible-review
layout and the observed six-control rating-summary failure mode.

Manual Shopee matrix:

1. Visible English and Filipino/Taglish reviews: scroll to ratings, scan, and compare extracted text with the rendered cards.
2. Loading reviews: scan before and after scrolling; confirm bounded retries and a loading/empty diagnostic.
3. Rating summary only, no reviews, and changed DOM: confirm nothing is submitted and no sample reviews are fabricated.
4. Duplicate visible reviews: confirm the validation log reports duplicates removed.
5. Backend stopped, HTTP error, or missing model: confirm an unavailable/incomplete state and no predictions.
6. Genuine-only, mixed, and uncertain model results: confirm the primary list contains only potentially fake reviews.
7. Confirm the result header reports only the rendered subset inspected, never all reviews for the product.

Run:

```powershell
node --test tests/extension-utils.test.js
python -m unittest tests.test_training_threshold
node --check chrome_extension/scripts/content.js
php -l backend/controllers/ScanController.php
```
