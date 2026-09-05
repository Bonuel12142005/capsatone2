import os
import pickle
import re
import uuid
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer  # type: ignore
from sklearn.metrics.pairwise import cosine_similarity  # type: ignore

class VectorStore:
    def __init__(self, storage_path=None):
        if storage_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            storage_path = os.path.join(base_dir, 'models', 'rag_vector_store.pkl')
            
        self.storage_path = storage_path
        self.documents = {}  # doc_id -> doc_dict
        self.chunks = []     # list of chunk dicts: {"chunk_id", "doc_id", "title", "category", "tags", "text"}
        self.vectorizer = None
        self.tfidf_matrix = None
        self.is_fitted = False
        
        # Load existing vector store if file exists
        self.load()

    def _chunk_text(self, text, chunk_size=350, overlap=50):
        """Splits text into overlapping semantic passages."""
        text = text.strip()
        if not text:
            return []
        
        # Split by paragraphs or sentences first
        sentences = re.split(r'(?<=[.!?])\s+', text)
        chunks = []
        current_chunk = ""
        
        for sentence in sentences:
            if len(current_chunk) + len(sentence) + 1 <= chunk_size:
                current_chunk += (" " if current_chunk else "") + sentence
            else:
                if current_chunk:
                    chunks.append(current_chunk)
                # Apply overlap if possible
                words = current_chunk.split()
                overlap_words = words[-10:] if len(words) >= 10 else words
                current_chunk = " ".join(overlap_words) + " " + sentence
                
        if current_chunk and current_chunk not in chunks:
            chunks.append(current_chunk)
            
        return chunks if chunks else [text]

    def add_document(self, title, content, category="general", tags=None, doc_id=None, save_after=True):
        """Adds a document to the vector store, chunks it, and rebuilds vector index."""
        if not doc_id:
            doc_id = str(uuid.uuid4())[:8]
            
        if tags is None:
            tags = []
        elif isinstance(tags, str):
            tags = [t.strip() for t in tags.split(',')]

        text_chunks = self._chunk_text(content)
        doc_entry = {
            "id": doc_id,
            "title": title,
            "content": content,
            "category": category,
            "tags": tags,
            "chunk_count": len(text_chunks)
        }
        
        self.documents[doc_id] = doc_entry

        # Remove previous chunks for this doc_id if re-adding
        self.chunks = [c for c in self.chunks if c["doc_id"] != doc_id]

        # Append new chunks
        for idx, chunk_text in enumerate(text_chunks):
            self.chunks.append({
                "chunk_id": f"{doc_id}_c{idx}",
                "doc_id": doc_id,
                "title": title,
                "category": category,
                "tags": tags,
                "text": chunk_text
            })

        self.rebuild_index()
        if save_after:
            self.save()
        return doc_id

    def add_documents_batch(self, doc_list):
        """Batch adds multiple documents and rebuilds index once."""
        added_ids = []
        for item in doc_list:
            doc_id = self.add_document(
                title=item.get("title", "Untitled Document"),
                content=item.get("content", ""),
                category=item.get("category", "general"),
                tags=item.get("tags", []),
                doc_id=item.get("id"),
                save_after=False
            )
            added_ids.append(doc_id)
        
        self.rebuild_index()
        self.save()
        return added_ids

    def rebuild_index(self):
        """Re-fits the TF-IDF vectorizer over all chunk texts."""
        if not self.chunks:
            self.vectorizer = None
            self.tfidf_matrix = None
            self.is_fitted = False
            return

        corpus = [f"{c['title']} {c['category']} {' '.join(c['tags'])} {c['text']}" for c in self.chunks]
        self.vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            max_features=10000,
            stop_words='english',
            sublinear_tf=True
        )
        self.tfidf_matrix = self.vectorizer.fit_transform(corpus)
        self.is_fitted = True

    def similarity_search(self, query, top_k=3, category=None, min_score=0.05):
        """Performs cosine similarity search against query vector."""
        if not self.is_fitted or self.vectorizer is None or self.tfidf_matrix is None or not self.chunks:
            return []

        query_vec = self.vectorizer.transform([query])
        similarities = cosine_similarity(query_vec, self.tfidf_matrix).flatten()

        # Get indices sorted by similarity score descending
        sorted_indices = np.argsort(similarities)[::-1]

        results = []
        for idx in sorted_indices:
            score = float(similarities[idx])
            if score < min_score:
                continue
            
            chunk = self.chunks[idx]
            if category and category != 'all' and chunk["category"] != category:
                continue

            results.append({
                "chunk_id": chunk["chunk_id"],
                "doc_id": chunk["doc_id"],
                "title": chunk["title"],
                "category": chunk["category"],
                "tags": chunk["tags"],
                "snippet": chunk["text"],
                "similarity_score": round(score, 4)
            })

            if len(results) >= top_k:
                break

        return results

    def delete_document(self, doc_id):
        """Removes a document and its chunks from the store."""
        if doc_id in self.documents:
            del self.documents[doc_id]
            self.chunks = [c for c in self.chunks if c["doc_id"] != doc_id]
            self.rebuild_index()
            self.save()
            return True
        return False

    def list_documents(self):
        """Returns list of indexed documents."""
        return list(self.documents.values())

    def get_stats(self):
        """Returns vector store metrics."""
        return {
            "total_documents": len(self.documents),
            "total_chunks": len(self.chunks),
            "vocabulary_size": len(self.vectorizer.vocabulary_) if self.is_fitted and self.vectorizer else 0,
            "is_indexed": self.is_fitted,
            "storage_path": self.storage_path
        }

    def save(self):
        """Persists the vector store to disk."""
        try:
            os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
            data = {
                "documents": self.documents,
                "chunks": self.chunks,
                "vectorizer": self.vectorizer,
                "tfidf_matrix": self.tfidf_matrix,
                "is_fitted": self.is_fitted
            }
            with open(self.storage_path, 'wb') as f:
                pickle.dump(data, f)
            return True
        except Exception as e:
            print(f"[RAG VectorStore] Error saving index: {e}")
            return False

    def load(self):
        """Loads the vector store from disk if present."""
        if not os.path.exists(self.storage_path):
            return False
        try:
            with open(self.storage_path, 'rb') as f:
                data = pickle.load(f)
            self.documents = data.get("documents", {})
            self.chunks = data.get("chunks", [])
            self.vectorizer = data.get("vectorizer")
            self.tfidf_matrix = data.get("tfidf_matrix")
            self.is_fitted = data.get("is_fitted", False)
            print(f"[RAG VectorStore] Loaded index with {len(self.documents)} docs, {len(self.chunks)} vector chunks.")
            return True
        except Exception as e:
            print(f"[RAG VectorStore] Error loading vector store: {e}")
            return False
