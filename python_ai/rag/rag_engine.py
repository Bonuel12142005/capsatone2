# python_ai/rag/rag_engine.py

import time


class RAGPipeline:
    """TF-IDF retrieval with deliberately template-based, grounded wording.

    This project does not use an LLM. Retrieval similarity is exposed as
    relevance only and is never presented as a probability or verification.
    """

    def __init__(self, vector_store):
        self.vector_store = vector_store

    def query_assistant(self, user_query, top_k=3, category=None):
        start_time = time.time()
        retrieved_chunks = self.vector_store.similarity_search(
            query=user_query, top_k=top_k, category=category, min_score=0.01
        )
        duration = round((time.time() - start_time) * 1000, 2)

        if not retrieved_chunks:
            return {
                'query': user_query,
                'answer': ('No sufficiently relevant knowledge-base passage was retrieved. '
                           'Review the actual model output and review text before drawing a conclusion.'),
                'retrieval_similarity': None,
                'response_type': 'retrieval-assisted template response',
                'sources': [], 'retrieved_chunks': [], 'latency_ms': duration,
            }

        citations = [{
            'source_id': chunk['doc_id'], 'title': chunk['title'],
            'category': chunk['category'],
            'similarity_score': round(chunk['similarity_score'] * 100, 1),
            'snippet': chunk['snippet'],
        } for chunk in retrieved_chunks]
        top = retrieved_chunks[0]
        answer = (
            f"According to **{top['title']}**, {top['snippet'][:280]}...\n\n"
            '**Retrieval note:** This is a template-based summary of related '
            'knowledge-base content. It provides context for reviewing a model '
            'finding; it is not proof of deception, authenticity, or a policy violation.'
        )
        return {
            'query': user_query, 'answer': answer,
            'retrieval_similarity': round(top['similarity_score'] * 100, 1),
            'response_type': 'retrieval-assisted template response',
            'sources': citations, 'retrieved_chunks': retrieved_chunks,
            'latency_ms': duration,
        }

    def explain_review(self, review_text, is_fake, confidence, reasons, nlp_metrics=None):
        search_query = f"{review_text} {' '.join(reasons if reasons else [])}"
        retrieved_chunks = self.vector_store.similarity_search(
            query=search_query, top_k=2, min_score=0.02
        )
        policy_citations = []
        if retrieved_chunks:
            top_match = retrieved_chunks[0]
            policy_citations.append({
                'title': top_match['title'], 'category': top_match['category'],
                'relevance': round(top_match['similarity_score'] * 100, 1),
                'rule': top_match['snippet'],
            })

        if is_fake:
            signal = reasons[0] if reasons else 'model-detected writing pattern'
            if policy_citations:
                explanation = (
                    f"Retrieved context from **{policy_citations[0]['title']}** is relevant to the model flag. "
                    f"Observed signal: {signal}. This context does not establish a policy violation or prove deception."
                )
            else:
                explanation = (
                    f"The classifier flagged this review based on patterns in its training data. Supporting signal: {signal}. "
                    'This prediction is not proof of deception; manual review is appropriate when it matters.'
                )
        else:
            explanation = (
                'The classifier did not flag this review in the analyzed sample. '
                'That result is not verification of authenticity or platform-policy compliance.'
            )

        return {
            'is_fake': bool(is_fake), 'model_fake_probability': confidence,
            'rag_explanation': explanation, 'policy_citations': policy_citations,
            'response_type': 'retrieval-assisted template response',
        }

    def synthesize_product_audit(self, product_title, total_reviews, fake_count, trust_score):
        retrieved = self.vector_store.similarity_search(
            query=f'Trust score thresholds e-commerce guidelines {product_title}', top_k=2
        )
        fake_pct = round((fake_count / total_reviews * 100) if total_reviews else 0, 1)
        if trust_score >= 80:
            status, risk_level = 'LOWER REVIEW-SAMPLE RISK', 'Low Risk'
            recommendation = 'The inspected sample had relatively few model flags. Continue monitoring as more evidence becomes available.'
        elif trust_score >= 60:
            status, risk_level = 'MODERATE REVIEW-SAMPLE RISK', 'Medium Risk'
            recommendation = 'Some reviews in the inspected sample were flagged. Consider manual review before relying on the sample.'
        else:
            status, risk_level = 'HIGHER REVIEW-SAMPLE RISK', 'High Risk'
            recommendation = 'A substantial portion of the inspected sample was flagged. Manual review and additional evidence are recommended.'

        citations = [{'title': r['title'], 'snippet': r['snippet']} for r in retrieved]
        summary = (
            f"EchoTrace retrieval-assisted audit summary for '{product_title}':\n"
            f"- Review-sample status: {status} (classification summary score: {trust_score}%)\n"
            f"- Audit metrics: {fake_count} of {total_reviews} reviews ({fake_pct}%) were model-flagged.\n"
            f"- Risk assessment: {risk_level}.\n"
            f"- Recommendation: {recommendation}\n"
            '- Method note: this is a template-based retrieval summary, not an LLM response or a verified marketplace-policy finding.'
        )
        return {
            'product_title': product_title, 'trust_score': trust_score,
            'risk_level': risk_level, 'status': status,
            'rag_executive_summary': summary,
            'policy_grounding_citations': citations,
            'response_type': 'retrieval-assisted template response',
        }
