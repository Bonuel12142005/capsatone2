// frontend/js/api.js

const EchoTraceAPI = (() => {
    // The local startup script runs the secured PHP API on port 8000.  When
    // this frontend is served through Laragon's default HTTP port, use that
    // API instead of its separate Apache process, which may not have the
    // development JWT environment configured. Production and non-local
    // deployments retain the existing same-origin API path.
    // The built-in PHP server serves the SPA at /, while Apache/Laragon
    // commonly serves it under /capsatone2/. Keep API calls same-origin in
    // both layouts so credentials and JWT authorization are consistent.
    const projectPrefix = window.location.pathname.startsWith('/capsatone2/')
        ? '/capsatone2'
        : '';
    const PHP_BASE = `${window.location.origin}${projectPrefix}/backend/api/index.php?route=`;
    let baseURL = PHP_BASE;

    console.log("[EchoTraceAPI] API Base URL configured to:", baseURL);

    const getHeaders = (includeContentType = true) => {
        const token = localStorage.getItem('echotrace_token')
            || sessionStorage.getItem('echotrace_token');
        const headers = includeContentType ? { 'Content-Type': 'application/json' } : {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    };

    const request = async (endpoint, options = {}) => {
        // Build a proper REST path: http://localhost/capsatone2/backend/api/index.php?route=admin/dashboard
        const url = baseURL.includes('?route=') ? `${baseURL}${endpoint}` : `${baseURL}/${endpoint}`;
        const defaultOptions = {
            headers: getHeaders(),
            credentials: 'include',
            cache: 'no-store',
            ...options
        };

        try {
            const response = await fetch(url, defaultOptions);
            let data = null;
            try {
                data = await response.json();
            } catch (parseError) {
                if (!response.ok) {
                    throw new Error(`EchoTrace server error (HTTP ${response.status}).`);
                }
                throw new Error('EchoTrace returned an invalid server response.');
            }

            if (!response.ok) {
                // If unauthorized, clear storage.
                // Guard: skip the auto-logout if the token was written in the
                // last 3 seconds — a race between login and a fast 401 on the
                // first dashboard request can otherwise immediately log the
                // user back out.
                const isLoginRequest = endpoint === 'auth/login' || endpoint === 'auth/session';
                const tokenAge = Date.now() - (parseInt(sessionStorage.getItem('echotrace_token_written_at') || '0', 10));
                const tokenJustWritten = tokenAge < 3000;
                if (!isLoginRequest && !tokenJustWritten && (response.status === 401 || response.status === 403)) {
                    localStorage.removeItem('echotrace_token');
                    localStorage.removeItem('echotrace_user');
                    sessionStorage.removeItem('echotrace_token');
                    sessionStorage.removeItem('echotrace_user');
                    sessionStorage.removeItem('echotrace_cookie_session');
                    sessionStorage.removeItem('echotrace_token_written_at');
                    window.dispatchEvent(new Event('authChange'));
                }
                const requestError = new Error(data?.error || `EchoTrace server error (HTTP ${response.status}).`);
                requestError.code = data?.error_code || 'server_error';
                requestError.status = response.status;
                throw requestError;
            }
            return data;
        } catch (error) {
            console.error(`[EchoTraceAPI] Request to ${endpoint} failed:`, error);
            if (error instanceof TypeError) {
                throw new Error('Unable to reach the EchoTrace server. Please check that the backend is running.');
            }
            throw error;
        }
    };

    return {
        setBaseURL: (url) => { baseURL = url; },
        getBaseURL: () => baseURL,
        get: (endpoint) => request(endpoint, { method: 'GET' }),
        post: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) }),
        upload: (endpoint, formData, options = {}) => request(endpoint, { ...options, method: 'POST', headers: getHeaders(false), body: formData }),
        put: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) }),
        patch: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
        delete: (endpoint, body) => request(endpoint, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) }),

        // RAG Machine Learning API Calls
        ragQuery: (query, top_k = 3, category = 'all') => request('rag/query', { method: 'POST', body: JSON.stringify({ query, top_k, category }) }),
        ragKnowledge: () => request('rag/knowledge', { method: 'GET' }),
        ragAddKnowledge: (title, content, category = 'custom', tags = []) => request('rag/knowledge/add', { method: 'POST', body: JSON.stringify({ title, content, category, tags }) }),
        ragDeleteKnowledge: (doc_id) => request('rag/knowledge/delete', { method: 'POST', body: JSON.stringify({ doc_id }) }),
        ragReindex: () => request('rag/knowledge/reindex', { method: 'POST' }),
        ragStats: () => request('rag/stats', { method: 'GET' })
    };
})();
