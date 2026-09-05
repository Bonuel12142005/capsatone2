import re
import string

# Fallback English stop words if NLTK download is not available
DEFAULT_STOPWORDS = set([
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", 
    "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers", 
    "herself", "it", "its", "itself", "they", "them", "their", "theirs", "themselves", 
    "what", "which", "who", "whom", "this", "that", "these", "those", "am", "is", "are", 
    "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", 
    "did", "doing", "a", "an", "the", "and", "but", "if", "or", "because", "as", "until", 
    "while", "of", "at", "by", "for", "with", "about", "against", "between", "into", 
    "through", "during", "before", "after", "above", "below", "to", "from", "up", "down", 
    "in", "out", "on", "off", "over", "under", "again", "further", "then", "once", "here", 
    "there", "when", "where", "why", "how", "all", "any", "both", "each", "few", "more", 
    "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", 
    "than", "too", "very", "s", "t", "can", "will", "just", "don", "should", "now"
])

class TextCleaner:
    def __init__(self):
        self.stopwords = DEFAULT_STOPWORDS
        self.lemmatizer = None
        
        # Try loading NLTK components dynamically
        try:
            import nltk
            from nltk.corpus import stopwords
            from nltk.stem import WordNetLemmatizer
            
            # Programmatically download required datasets if needed
            try:
                nltk.data.find('corpora/stopwords')
            except LookupError:
                nltk.download('stopwords', quiet=True)
                
            try:
                nltk.data.find('corpora/wordnet')
            except LookupError:
                nltk.download('wordnet', quiet=True)
                
            self.stopwords = set(stopwords.words('english'))
            self.lemmatizer = WordNetLemmatizer()
            print("[TextCleaner] Loaded NLTK components successfully.")
        except Exception as e:
            print(f"[TextCleaner] Using fallback cleaner. NLTK not fully loaded: {e}")

    def clean_html(self, text):
        """Removes HTML tags from a text string."""
        if not text:
            return ""
        clean_re = re.compile('<.*?>')
        return re.sub(clean_re, '', text)

    def clean_text(self, text):
        """
        Cleans review text by lowercasing, removing HTML tags, punctuation,
        filtering stopwords, and performing lemmatization.
        """
        if not text:
            return ""
        
        # Remove HTML
        text = self.clean_html(text)
        
        # Lowercase
        text = text.lower()
        
        # Remove punctuation
        text = text.translate(str.maketrans('', '', string.punctuation))
        
        # Tokenize (split by whitespace)
        words = text.split()
        
        # Filter stopwords and lemmatize
        cleaned_words = []
        for word in words:
            if word not in self.stopwords:
                if self.lemmatizer:
                    try:
                        word = self.lemmatizer.lemmatize(word)
                    except:
                        pass
                cleaned_words.append(word)
                
        return " ".join(cleaned_words)
