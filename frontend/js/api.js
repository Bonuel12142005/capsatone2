// frontend/js/api.js

const EchoTraceAPI = (() => {
    // PHP REST backend gateway running on port 8000
    const PHP_BASE = 'http://localhost:8000/api/index.php?route=';
    let baseURL = PHP_BASE;

    console.log("[EchoTraceAPI] API Base URL configured to:", baseURL);

    const getHeaders = () => {
        const token = localStorage.getItem('echotrace_token');
        const headers = {
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    };

    const request = async (endpoint, options = {}) => {
        // Build a proper REST path: http://localhost:8000/backend/api/index.php?route=admin/dashboard
        const url = baseURL.includes('?route=') ? `${baseURL}${endpoint}` : `${baseURL}/${endpoint}`;
        const defaultOptions = {
            headers: getHeaders(),
            credentials: 'include',
            ...options
        };

        try {
            const response = await fetch(url, defaultOptions);
            const data = await response.json();

            if (!response.ok) {
                // If unauthorized, clear storage
                if (response.status === 401 || response.status === 403) {
                    localStorage.removeItem('echotrace_token');
                    localStorage.removeItem('echotrace_user');
                    window.dispatchEvent(new Event('authChange'));
                }
                throw new Error(data.error || `HTTP error! Status: ${response.status}`);
            }
            return data;
        } catch (error) {
            console.error(`[EchoTraceAPI] Request to ${endpoint} failed:`, error);
            throw error;
        }
    };

    return {
        setBaseURL: (url) => { baseURL = url; },
        getBaseURL: () => baseURL,
        get:    (endpoint)        => request(endpoint, { method: 'GET' }),
        post:   (endpoint, body)  => request(endpoint, { method: 'POST',   body: JSON.stringify(body) }),
        put:    (endpoint, body)  => request(endpoint, { method: 'PUT',    body: JSON.stringify(body) }),
        patch:  (endpoint, body)  => request(endpoint, { method: 'PATCH',  body: JSON.stringify(body) }),
        delete: (endpoint)        => request(endpoint, { method: 'DELETE' }),

        // RAG Machine Learning API Calls
        ragQuery: (query, top_k = 3, category = 'all') => request('rag/query', { method: 'POST', body: JSON.stringify({ query, top_k, category }) }),
        ragKnowledge: () => request('rag/knowledge', { method: 'GET' }),
        ragAddKnowledge: (title, content, category = 'custom', tags = []) => request('rag/knowledge/add', { method: 'POST', body: JSON.stringify({ title, content, category, tags }) }),
        ragDeleteKnowledge: (doc_id) => request('rag/knowledge/delete', { method: 'POST', body: JSON.stringify({ doc_id }) }),
        ragReindex: () => request('rag/knowledge/reindex', { method: 'POST' }),
        ragStats: () => request('rag/stats', { method: 'GET' })
    };
})();
