import os
import pickle
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer  # type: ignore
from sklearn.linear_model import LogisticRegression  # type: ignore

# Path to save trained models
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'fake_review_model.pkl')
VECTORIZER_PATH = os.path.join(os.path.dirname(__file__), 'tfidf_vectorizer.pkl')

# Seed training data to build the model if it doesn't exist
SEED_TRAINING_DATA = [
    # Genuine reviews (Label 0)
    ("I bought this product last week. It works okay, but the battery life is a bit short.", 0),
    ("Not bad for the price. The material feels slightly cheap but it does the job.", 0),
    ("Very fast delivery. Product corresponds to the description. I recommend it.", 0),
    ("Decent product. The design is neat, but the user manual is hard to understand.", 0),
    ("It fits well and looks good. The only issue is the color is slightly darker than the picture.", 0),
    ("Useful gadget, though it takes some time to get used to. Overall satisfied.", 0),
    ("Works as expected. It has a few minor bugs but nothing major.", 0),
    ("Quality is fine, but shipping took almost two weeks. Otherwise good.", 0),
    ("My daughter loves it. It seems durable so far.", 0),
    ("It does exactly what it's supposed to do. Simple and effective.", 0),
    
    # Fake/Spam/Paid/AI-generated reviews (Label 1)
    ("AMAZING! BEST PRODUCT EVER!!! CHOOSE THIS NOW! CLICK HERE FOR DISCOUNT!", 1),
    ("This is the absolute best thing in the world. I got a discount for this review.", 1),
    ("Highly recommended! I love this. Cheap price and free shipping. Buy it now!", 1),
    ("Great product. Visit my website for more review details. Excellent service.", 1),
    ("I received this product for free in exchange for my honest opinion. Outstanding!", 1),
    ("Best quality! Super fast! Cheap! Perfect! Buy now! Highly recommended!", 1),
    ("Wow! Excellent stuff! Five stars all the way! Best seller ever!", 1),
    ("Scam alert! Absolute garbage. Do not buy! Fake seller! Zero stars!", 1),
    ("This is a paid review. The product is perfect and there are no issues at all.", 1),
    ("Superb item! Exceeded all my expectations. The design is majestic and flawless.", 1)
]

class FakeReviewClassifier:
    def __init__(self):
        self.model = None
        self.vectorizer = None
        self.load_or_train_model()

    def load_or_train_model(self):
        """Loads vectorizer and model from disk or trains a new one with seed data."""
        if os.path.exists(MODEL_PATH) and os.path.exists(VECTORIZER_PATH):
            try:
                with open(MODEL_PATH, 'rb') as f:
                    self.model = pickle.load(f)
                with open(VECTORIZER_PATH, 'rb') as f:
                    self.vectorizer = pickle.load(f)
                print("[Classifier] Model and Vectorizer loaded from disk.")
                return
            except Exception as e:
                print(f"[Classifier] Failed to load model. Retraining. Error: {e}")

        # Train a new model using seed data
        print("[Classifier] No model found. Training new model with seed data...")
        self.train_model(SEED_TRAINING_DATA)

    def train_model(self, data):
        """Trains the TF-IDF Vectorizer and Logistic Regression model."""
        texts = [item[0] for item in data]
        labels = [item[1] for item in data]

        self.vectorizer = TfidfVectorizer(max_features=1000, stop_words='english', ngram_range=(1, 2))
        x_train = self.vectorizer.fit_transform(texts)
        y_train = np.array(labels)

        self.model = LogisticRegression(C=1.0)
        self.model.fit(x_train, y_train)

        # Save files
        try:
            os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
            with open(MODEL_PATH, 'wb') as f:
                pickle.dump(self.model, f)
            with open(VECTORIZER_PATH, 'wb') as f:
                pickle.dump(self.vectorizer, f)
            print("[Classifier] Model training completed and saved to disk.")
        except Exception as e:
            print(f"[Classifier] Failed to save trained model: {e}")

    def predict(self, raw_text, cleaned_text):
        """
        Predicts if a review is fake (1) or genuine (0).
        Returns:
            - is_fake (int)
            - confidence_score (float, 0.0 to 100.0)
            - reasons (list of str)
        """
        reasons = []
        
        # Heuristics checks
        heuristic_score = 0.0
        
        # 1. Capitalization ratio (excessive uppercase is common in fake reviews)
        caps_count = sum(1 for c in raw_text if c.isupper())
        total_letters = sum(1 for c in raw_text if c.isalpha())
        if total_letters > 10 and (caps_count / total_letters) > 0.35:
            heuristic_score += 0.20
            reasons.append("Excessive capitalization (SHOUTING)")
            
        # 2. Exclamation mark density
        excl_count = raw_text.count('!')
        if excl_count >= 3:
            heuristic_score += 0.15
            reasons.append("Excessive exclamation marks")
            
        # 3. Paid/Incentivized Review markers
        incentive_patterns = [
            r'free product', r'honest review', r'in exchange', 
            r'discount code', r'coupon code', r'paid review', 
            r'sponsored', r'got this free', r'received this for free',
            r'unbiased review', r'provided for review'
        ]
        import re
        for pattern in incentive_patterns:
            if re.search(pattern, raw_text.lower()):
                heuristic_score += 0.30
                reasons.append("Paid Review: Incentivized language detected")
                break
                
        # 4. Spam Review (Spammer words & links)
        spam_patterns = [
            r'buy now', r'visit my', r'click here', r'check out my', 
            r'discount price', r'link below', r'promo code', 
            r'subscribe to', r'my channel', r'http://', r'https://'
        ]
        for pattern in spam_patterns:
            if re.search(pattern, raw_text.lower()):
                heuristic_score += 0.25
                reasons.append("Spam Review: Contains promotional links or spam phrases")
                break
                
        # 5. AI-Generated Review footprints
        ai_patterns = [
            r'as an ai', r'as an ai language model', r'i am an ai', 
            r'in conclusion,', r'overall, it is important to note',
            r'it is worth noting', r'it is crucial to note',
            r'delves into', r'tapestry of', r'seamlessly integrates'
        ]
        for pattern in ai_patterns:
            if re.search(pattern, raw_text.lower()):
                heuristic_score += 0.40
                reasons.append("AI-Generated Review: Contains AI language model footprints")
                break

        # ML Prediction
        ml_score = 0.0
        if self.model and self.vectorizer:
            try:
                features = self.vectorizer.transform([cleaned_text])
                ml_prob = self.model.predict_proba(features)[0][1] # Probability of fake (class 1)
                ml_score = float(ml_prob)
            except Exception as e:
                print(f"[Classifier] Prediction error: {e}")
                
        # Combine ML Score and Heuristic Score (weighted average)
        # ML represents 65%, Heuristics represent 35%
        combined_prob = (ml_score * 0.65) + (min(heuristic_score, 1.0) * 0.35)
        
        # Final classification based on threshold (60%)
        is_fake = 1 if combined_prob >= 0.60 else 0
        confidence = combined_prob * 100
        
        if is_fake and not reasons:
            reasons.append("Fake Review: Matches known fake patterns")
            
        return is_fake, round(confidence, 2), reasons
