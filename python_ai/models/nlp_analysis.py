import re
from collections import Counter

# Standard emotion wordlist for rule-based matching
EMOTION_LEXICON = {
    'joy': ['happy', 'love', 'wonderful', 'excellent', 'amazing', 'great', 'awesome', 'good', 'glad', 'satisfy', 'perfect', 'best', 'enjoy'],
    'anger': ['angry', 'mad', 'hate', 'furious', 'annoyed', 'frustrated', 'terrible', 'worst', 'poor', 'disappoint', 'scam', 'rip-off', 'waste'],
    'fear': ['scared', 'afraid', 'worry', 'concern', 'suspicious', 'risk', 'dangerous', 'broken', 'unsafe', 'cheap', 'scared', 'dread'],
    'sadness': ['sad', 'disappointed', 'regret', 'unhappy', 'sorry', 'cry', 'hurt', 'fail', 'broken', 'damage', 'useless', 'defective'],
    'surprise': ['surprised', 'shock', 'unexpected', 'wow', 'actually', 'incredibly', 'suddenly', 'amazingly', 'incredible']
}

# Toxic wordlist for toxicity detection
TOXIC_WORDS = [
    'hate', 'scam', 'fraud', 'liar', 'stupid', 'idiot', 'fake', 'garbage', 'trash', 'scammer', 'cheat', 'horrible', 'crap', 'shit', 'ass', 'bastard', 'fuck'
]

class NLPAnalyzer:
    def __init__(self):
        self.textblob_available = False
        try:
            from textblob import TextBlob
            self.textblob = TextBlob
            self.textblob_available = True
            print("[NLPAnalyzer] Loaded TextBlob successfully.")
        except Exception as e:
            print(f"[NLPAnalyzer] TextBlob not available, using lexicon fallback. Error: {e}")

    def analyze_sentiment(self, text):
        """Returns sentiment polarity (-1 to 1) and label (positive, neutral, negative)."""
        if not text:
            return 0.0, 'neutral'

        if self.textblob_available:
            try:
                tb = self.textblob(text)
                polarity = tb.sentiment.polarity
                if polarity > 0.05:
                    label = 'positive'
                elif polarity < -0.05:
                    label = 'negative'
                else:
                    label = 'neutral'
                return round(polarity, 2), label
            except Exception as e:
                # Fallback on exception
                pass

        # Lexicon fallback
        words = text.lower().split()
        pos_words = ['good', 'great', 'excellent', 'love', 'perfect', 'amazing', 'best', 'happy', 'nice', 'awesome', 'recommend']
        neg_words = ['bad', 'worst', 'terrible', 'poor', 'hate', 'scam', 'waste', 'disappointed', 'broke', 'cheap', 'defect']
        
        pos_count = sum(1 for w in words if w in pos_words)
        neg_count = sum(1 for w in words if w in neg_words)
        
        total = pos_count + neg_count
        if total == 0:
            return 0.0, 'neutral'
        
        score = (pos_count - neg_count) / total
        label = 'positive' if score > 0.1 else ('negative' if score < -0.1 else 'neutral')
        return round(score, 2), label

    def detect_emotion(self, text):
        """Detects primary emotion in text based on lexicon mapping."""
        if not text:
            return 'neutral'
        
        text = text.lower()
        counts = Counter()
        
        for emotion, keywords in EMOTION_LEXICON.items():
            for keyword in keywords:
                # Count matches including word boundaries
                matches = re.findall(rf'\b{keyword}', text)
                counts[emotion] += len(matches)
                
        if not counts or counts.most_common(1)[0][1] == 0:
            return 'neutral'
            
        return counts.most_common(1)[0][0]

    def detect_toxicity(self, text):
        """Detects toxic language percentage based on keywords."""
        if not text:
            return 0.0
            
        text = text.lower()
        words = text.split()
        if not words:
            return 0.0
            
        toxic_count = sum(1 for word in words if any(toxic in word for toxic in TOXIC_WORDS))
        score = (toxic_count / len(words)) * 100
        return round(min(score * 3, 100.0), 2)  # Amplify slightly for user readability

    def compute_jaccard_similarity(self, text1, text2):
        """Computes Jaccard Similarity between two texts (cleaned sets of words)."""
        w1 = set(text1.lower().split())
        w2 = set(text2.lower().split())
        
        if not w1 or not w2:
            return 0.0
            
        intersection = w1.intersection(w2)
        union = w1.union(w2)
        return len(intersection) / len(union)

    def group_duplicates(self, cleaned_reviews, threshold=0.8):
        """
        Groups similar reviews together.
        Returns a dictionary mapping review index to duplicate_group_id.
        """
        group_id = 1
        assignments = {}
        
        for i in range(len(cleaned_reviews)):
            if i in assignments:
                continue
                
            has_duplicates = False
            for j in range(i + 1, len(cleaned_reviews)):
                if j in assignments:
                    continue
                
                similarity = self.compute_jaccard_similarity(cleaned_reviews[i], cleaned_reviews[j])
                if similarity >= threshold:
                    if not has_duplicates:
                        assignments[i] = group_id
                        has_duplicates = True
                    assignments[j] = group_id
            
            if has_duplicates:
                group_id += 1
            else:
                assignments[i] = None # No duplicate
                
        return assignments

    def extract_keywords(self, text, top_n=3):
        """Extracts top keywords or noun phrases."""
        if not text:
            return []
            
        if self.textblob_available:
            try:
                tb = self.textblob(text)
                phrases = tb.noun_phrases
                if phrases:
                    counts = Counter(phrases)
                    return [p[0] for p in counts.most_common(top_n)]
            except:
                pass
                
        # Fallback heuristic (words > 3 chars, not in stop list)
        stopwords = {'this', 'that', 'with', 'from', 'your', 'have', 'they', 'will', 'just', 'like', 'what', 'some', 'there', 'very'}
        words = [w.lower() for w in re.findall(r'\b\w{4,}\b', text) if w.lower() not in stopwords]
        counts = Counter(words)
        return [w[0] for w in counts.most_common(top_n)]

    def detect_intent(self, text):
        """Detects the primary intent behind the text."""
        if not text:
            return "Feedback"
            
        text = text.lower()
        
        inquiry_patterns = [r'\bhow do i\b', r'\bquestion\b', r'\bcan you\b', r'\bis this\b', r'\bhelp\b', r'\bhow to\b']
        complaint_patterns = [r'\breturn\b', r'\brefund\b', r'\bbroken\b', r'\bfix\b', r'\bissue\b', r'\bproblem\b', r'\bdoesn\'t work\b']
        recommend_patterns = [r'\bhighly recommend\b', r'\bmust buy\b', r'\bgreat product\b', r'\blove it\b', r'\bwill buy again\b']
        
        for p in complaint_patterns:
            if re.search(p, text):
                return "Complaint"
                
        for p in inquiry_patterns:
            if re.search(p, text):
                return "Inquiry"
                
        for p in recommend_patterns:
            if re.search(p, text):
                return "Recommendation"
                
        return "Feedback"

    def analyze_grammar(self, text):
        """Heuristic-based grammar score (0-100). 100 is perfect grammar."""
        if not text:
            return 100.0
            
        score = 100.0
        
        # Check 1: Missing capitalization at the start of sentences
        sentences = re.split(r'[.!?]+', text)
        sentences = [s.strip() for s in sentences if s.strip()]
        
        capitalization_errors = 0
        for s in sentences:
            if s[0].islower():
                capitalization_errors += 1
                
        if sentences:
            # Deduct up to 30 points for capitalization errors
            score -= (capitalization_errors / len(sentences)) * 30.0
            
        # Check 2: Excessive repeated punctuation
        repeated_punct = len(re.findall(r'[!?]{2,}', text))
        score -= min(repeated_punct * 5.0, 30.0) # Deduct up to 30 points
        
        # Check 3: Incorrect spacing around punctuation (e.g. "word , word")
        bad_spacing = len(re.findall(r'\s+[,.!?]', text))
        score -= min(bad_spacing * 5.0, 20.0) # Deduct up to 20 points
        
        # Check 4: ALL CAPS sentences/words penalty
        words = text.split()
        if words:
            all_caps_words = sum(1 for w in words if w.isupper() and len(w) > 1)
            score -= min((all_caps_words / len(words)) * 40.0, 20.0)
            
        return round(max(0.0, score), 2)
