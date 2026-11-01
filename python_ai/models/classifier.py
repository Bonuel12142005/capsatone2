import os
import re
import pickle
import json
from typing import Any, Optional
import numpy as np

# Path to save trained models (same paths used by train_model.py)
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'fake_review_model.pkl')
VECTORIZER_PATH = os.path.join(os.path.dirname(__file__), 'tfidf_vectorizer.pkl')
METADATA_PATH = os.path.join(os.path.dirname(__file__), 'model_metadata.json')


class FakeReviewClassifier:
    """
    Enhanced Fake Review Classifier powered by a 4-Model Soft Voting Ensemble
    (Logistic Regression + Calibrated LinearSVC + Gradient Boosting + Random Forest)
    trained on 1,800 curated multilingual samples (English, Tagalog, Taglish).

    The persisted ML ensemble determines the prediction. Heuristic checks are
    used only as human-readable supporting signals; they do not alter the
    model probability or overturn its label.
    """

    model: Any = None
    vectorizer: Any = None

    def __init__(self):
        self.model = None
        self.vectorizer = None
        self.model_version = 'unloaded'
        self.decision_threshold = 0.50
        self._load_model()

    def _load_model(self):
        """Load the pre-trained ensemble model and TF-IDF vectorizer from disk."""
        if os.path.exists(MODEL_PATH) and os.path.exists(VECTORIZER_PATH):
            try:
                with open(MODEL_PATH, 'rb') as f:
                    self.model = pickle.load(f)
                with open(VECTORIZER_PATH, 'rb') as f:
                    self.vectorizer = pickle.load(f)
                if os.path.exists(METADATA_PATH):
                    with open(METADATA_PATH, encoding='utf-8') as f:
                        metadata = json.load(f)
                    self.decision_threshold = float(metadata.get('decision_threshold', 0.50))
                    pipeline_version = metadata.get('pipeline_version', 'unknown')
                else:
                    pipeline_version = 'unknown'
                self.model_version = f"{pipeline_version}:{os.path.getmtime(MODEL_PATH)}:{os.path.getmtime(VECTORIZER_PATH)}"
                print("[Classifier] Model and Vectorizer loaded from disk.")
                return
            except Exception as e:
                print(f"[Classifier] Failed to load model: {e}")

        print("[Classifier] WARNING: No trained model found. Run train_model.py first.")
        print("[Classifier] Falling back to heuristic-only mode.")

    @property
    def is_ready(self):
        return self.model is not None and self.vectorizer is not None

    # ------------------------------------------------------------------ #
    #  HEURISTIC ANALYSIS LAYERS                                          #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _check_capitalization(text: str) -> tuple[float, list[str]]:
        """Detect excessive SHOUTING (uppercase ratio)."""
        caps = sum(1 for c in text if c.isupper())
        letters = sum(1 for c in text if c.isalpha())
        if letters > 10 and (caps / letters) > 0.35:
            return 0.20, ["Excessive capitalization (SHOUTING pattern)"]
        return 0.0, []

    @staticmethod
    def _check_exclamation(text: str) -> tuple[float, list[str]]:
        """Detect excessive exclamation marks."""
        count = text.count('!')
        if count >= 5:
            return 0.18, ["Heavy exclamation mark usage (spam signal)"]
        if count >= 3:
            return 0.10, ["Excessive exclamation marks"]
        return 0.0, []

    @staticmethod
    def _check_short_text(text: str) -> tuple[float, list[str]]:
        """Extremely short reviews with high rating are suspicious."""
        words = text.split()
        if len(words) <= 3:
            return 0.15, ["Ultra-short review (low effort)"]
        return 0.0, []

    @staticmethod
    def _check_repetition(text: str) -> tuple[float, list[str]]:
        """Detect word/phrase repetition patterns common in fake reviews."""
        words = text.lower().split()
        if len(words) >= 5:
            unique_ratio = len(set(words)) / len(words)
            if unique_ratio < 0.40:
                return 0.25, ["High word repetition (copy-paste pattern)"]
        return 0.0, []

    @staticmethod
    def _check_incentivized(text: str) -> tuple[float, list[str]]:
        """Detect paid / incentivized / rebate review markers."""
        patterns = [
            r'free product', r'honest review', r'in exchange',
            r'discount code', r'coupon code', r'paid review',
            r'sponsored', r'got this free', r'received this for free',
            r'unbiased review', r'provided for review',
            r'refund', r'cashback', r'rebate', r'free gift',
            r'updating to 5 stars', r'change my rating', r'for coins',
            r'product tester', r'i was compensated', r'complimentary',
            r'gifted this', r'sample product',
            # Tagalog / Taglish incentivized patterns
            r'libre.*product', r'binigay.*libre', r'kapalit.*review',
            r'may.*refund', r'may.*cashback', r'bayad.*review',
            r'gcash', r'load kapalit', r'pa-review',
        ]
        lower = text.lower()
        for p in patterns:
            if re.search(p, lower):
                return 0.40, ["Incentivized / Paid Review: compensated review language detected"]
        return 0.0, []

    @staticmethod
    def _check_spam(text: str) -> tuple[float, list[str]]:
        """Detect spam / promotional content."""
        patterns = [
            r'buy now', r'visit my', r'click here', r'check out my',
            r'discount price', r'link below', r'promo code',
            r'subscribe to', r'my channel', r'http://', r'https://',
            r'bit\.ly', r't\.me', r'telegram', r'whatsapp',
            r'deals-online', r'best seller ever', r'best store on',
            r'100/100 stars', r'order now', r'limited time',
            r'act fast', r'don\'t miss', r'hurry up',
            # Tagalog / Taglish spam
            r'bilhin.?na', r'mag-order.?na', r'dali.?na',
            r'link sa bio', r'pm lang', r'pm me', r'shop ko',
            r'check.?out.?ko', r'tindahan ko',
        ]
        lower = text.lower()
        for p in patterns:
            if re.search(p, lower):
                return 0.35, ["Spam Review: promotional links, affiliate redirects, or spam phrasing"]
        return 0.0, []

    @staticmethod
    def _check_ai_generated(text: str) -> tuple[float, list[str]]:
        """Detect AI / LLM generated review fingerprints."""
        patterns = [
            r'as an ai', r'as an ai language model', r'i am an ai',
            r'in conclusion,', r'overall, it is important to note',
            r'it is worth noting', r'it is crucial to note',
            r'delves into', r'tapestry of', r'seamlessly integrates',
            r'testament to', r'paradigm shift', r'multifaceted advantages',
            r'evaluation protocol', r'exemplary selection',
            r'this product stands as', r'one cannot overstate',
            r'in the realm of', r'a comprehensive solution',
            r'meticulous craftsmanship', r'unparalleled quality',
            r'elevates the experience', r'transcends expectations',
        ]
        lower = text.lower()
        for p in patterns:
            if re.search(p, lower):
                return 0.45, ["AI-Generated Review: synthetic LLM linguistic markers detected"]
        return 0.0, []

    @staticmethod
    def _check_fake_tagalog(text: str) -> tuple[float, list[str]]:
        """Detect Tagalog/Taglish fake review patterns specific to PH e-commerce."""
        patterns = [
            # Generic fake Tagalog
            r'sobrang ganda.*bili.?na', r'grabe.*quality.*perfect',
            r'waley.?tama', r'peke.*seller', r'scam.*to',
            r'wag.*bilhin', r'basura.*product', r'walang.*kwenta',
            # Fake positive Tagalog
            r'super.?worth.?it.*best.*ever', r'grabe.*solid.*perfect.*quality',
            r'basta.*best.*to.*promise', r'legit.*seller.*grab.*na',
            r'sobrang.?ganda.*walang.?kapantay',
            # Incentivized Tagalog
            r'5\s*stars.*kapalit', r'review.*kapalit.*libre',
            r'pa.?5.?stars', r'bigay.*5.*star',
        ]
        lower = text.lower()
        for p in patterns:
            if re.search(p, lower):
                return 0.35, ["Tagalog/Taglish Fake Review: manipulated local-language review pattern"]
        return 0.0, []

    @staticmethod
    def _check_emoji_spam(text: str) -> tuple[float, list[str]]:
        """Detect excessive emoji usage common in fake reviews."""
        # Count emoji-like characters (common Unicode emoji ranges)
        emoji_count = len(re.findall(
            r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF'
            r'\U0001F1E0-\U0001F1FF\U00002702-\U000027B0\U0001F900-\U0001F9FF'
            r'\U00002600-\U000026FF\U00002B50-\U00002B55]+', text
        ))
        if emoji_count >= 8:
            return 0.15, ["Emoji spam (excessive decorative emojis)"]
        return 0.0, []

    # ------------------------------------------------------------------ #
    #  MAIN PREDICTION                                                     #
    # ------------------------------------------------------------------ #

    def predict(self, raw_text: str, cleaned_text: str):
        """
        Predict if a review is fake (1) or genuine (0).

        Uses the persisted ML ensemble probability for classification and
        returns heuristic observations as supporting context only.

        Returns:
            - is_fake (int): 1 = fake, 0 = genuine
            - confidence_score (float): 0.0 – 100.0
            - reasons (list[str]): human-readable explanation strings
        """
        reasons: list[str] = []
        heuristic_score = 0.0

        # --- Run all heuristic checks ---
        checks = [
            self._check_capitalization(raw_text),
            self._check_exclamation(raw_text),
            self._check_short_text(raw_text),
            self._check_repetition(raw_text),
            self._check_incentivized(raw_text),
            self._check_spam(raw_text),
            self._check_ai_generated(raw_text),
            self._check_fake_tagalog(raw_text),
            self._check_emoji_spam(raw_text),
        ]

        for score, check_reasons in checks:
            heuristic_score += score
            reasons.extend(check_reasons)

        # Cap heuristic score at 1.0
        heuristic_score = min(heuristic_score, 1.0)

        # --- ML Ensemble Prediction ---
        if not self.is_ready or self.vectorizer is None or self.model is None:
            raise RuntimeError("Trained classifier artifacts are unavailable")
        try:
            # Training and inference both feed normalized review text directly to
            # the persisted TF-IDF vectorizer; no request-time retraining occurs.
            input_text = raw_text.strip() if raw_text.strip() else cleaned_text
            features = self.vectorizer.transform([input_text])
            ml_score = float(self.model.predict_proba(features)[0][1])  # P(fake)
        except Exception as e:
            raise RuntimeError(f"Model prediction failed: {e}") from e

        # --- Final Classification ---
        is_fake = 1 if ml_score >= self.decision_threshold else 0
        confidence = round(ml_score * 100, 2)
        if not is_fake:
            reasons = []

        # If ML flagged it but no heuristic reasons were found, add a responsible ML reason
        if is_fake and not reasons:
            if ml_score >= 0.80:
                reasons.append(
                    "Potentially suspicious review: the model identified patterns associated "
                    "with deceptive examples in its training data. This prediction is not proof of fraud."
                )
            elif ml_score >= 0.60:
                reasons.append(
                    "Suspicious signals detected: the AI ensemble found writing patterns "
                    "statistically associated with inauthentic reviews. "
                    "This is not a confirmed finding of deception."
                )
            else:
                reasons.append(
                    "Low-confidence flag: combined NLP signals are weakly associated "
                    "with suspicious content. Manual review is recommended."
                )

        return is_fake, confidence, reasons

    def predict_batch(self, raw_texts: list[str], cleaned_texts: list[str]):
        """Run the persisted vectorizer/model once for a batch of reviews.

        The per-review heuristic explanations and classification thresholds are
        intentionally identical to ``predict``. Only the vectorizer/model call
        is batched, so prediction semantics do not change.
        """
        if len(raw_texts) != len(cleaned_texts):
            raise ValueError('raw_texts and cleaned_texts must have the same length')
        if not raw_texts:
            return []
        if not self.is_ready or self.vectorizer is None or self.model is None:
            raise RuntimeError("Trained classifier artifacts are unavailable")
        try:
            input_texts = [raw.strip() if raw.strip() else cleaned for raw, cleaned in zip(raw_texts, cleaned_texts)]
            features = self.vectorizer.transform(input_texts)
            ml_scores = self.model.predict_proba(features)[:, 1]
        except Exception as exc:
            raise RuntimeError(f"Model batch prediction failed: {exc}") from exc

        outputs = []
        for raw_text, score in zip(raw_texts, ml_scores):
            ml_score = float(score)
            reasons = []
            heuristic_checks = [
                self._check_capitalization(raw_text),
                self._check_exclamation(raw_text),
                self._check_short_text(raw_text),
                self._check_repetition(raw_text),
                self._check_incentivized(raw_text),
                self._check_spam(raw_text),
                self._check_ai_generated(raw_text),
                self._check_fake_tagalog(raw_text),
                self._check_emoji_spam(raw_text),
            ]
            for _, check_reasons in heuristic_checks:
                reasons.extend(check_reasons)

            is_fake = 1 if ml_score >= self.decision_threshold else 0
            confidence = round(ml_score * 100, 2)
            if not is_fake:
                reasons = []
            if is_fake and not reasons:
                if ml_score >= 0.80:
                    reasons.append('Potentially suspicious review: the model identified patterns associated with deceptive examples in its training data. This prediction is not proof of fraud.')
                elif ml_score >= 0.60:
                    reasons.append('Suspicious signals detected: the AI ensemble found writing patterns statistically associated with inauthentic reviews. This is not a confirmed finding of deception.')
                else:
                    reasons.append('Low-confidence flag: combined NLP signals are weakly associated with suspicious content. Manual review is recommended.')
            outputs.append((is_fake, confidence, reasons))
        return outputs
