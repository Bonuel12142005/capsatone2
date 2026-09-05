// chrome_extension/scripts/background.js

console.log("[EchoTrace] Background service worker running.");

// Default API Base URL. Can be updated in settings.
const DEFAULT_API_URL = "http://localhost:8000/api/index.php";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("[EchoTrace Background] Received message:", request.action, "from", sender.url);
    
    if (request.action === "EXECUTE_SCAN") {
        // Retrieve custom API URL and token from storage if available
        chrome.storage.local.get(["api_url", "auth_token"], async (items) => {
            const apiBase = items.api_url || DEFAULT_API_URL;
            const token = items.auth_token || "";
            
            console.log("[EchoTrace Background] Auth token exists:", !!token);
            
            // Require login before scanning
            if (!token) {
                console.warn("[EchoTrace] Scan blocked: User not logged in.");
                sendResponse({ success: false, error: "LOGIN_REQUIRED", message: "Please sign in to EchoTrace before scanning." });
                return;
            }
            
            // Build scan URL: PHP gateway uses ?route=, Flask uses /scan path
            const scanUrl = apiBase.includes('index.php') ? `${apiBase}?route=scan` : `${apiBase}/scan`;
            console.log("[EchoTrace] Requesting review audit at API:", scanUrl);

            const headers = {
                "Content-Type": "application/json"
            };
            if (token) {
                headers["Authorization"] = `Bearer ${token}`;
            }

            try {
                const response = await fetch(scanUrl, {
                    method: "POST",
                    headers: headers,
                    body: JSON.stringify(request.data)
                });

                const result = await response.json().catch(() => null);

                if (!response.ok) {
                    const errMsg = result?.error || `HTTP error! status: ${response.status}`;
                    console.error("[EchoTrace] Server error:", errMsg);
                    sendResponse({ success: false, error: errMsg });
                    return;
                }

                if (result && result.success) {
                    // Add product title to result for popup display
                    result.product_title = request.data?.title || 'Product';
                    
                    // Save result to storage so popup can show it
                    chrome.storage.local.set({ last_scan_result: result });
                    
                    console.log("[EchoTrace] Scan successful, trust score:", result.trust_score);
                    sendResponse(result);
                } else {
                    sendResponse(result || { success: false, error: "Empty response from server" });
                }
            } catch (err) {
                console.error("[EchoTrace] Scan request failed:", err);
                sendResponse({ success: false, error: err.message });
            }
        });
        
        return true; // Keeps the message channel open for asynchronous sendResponse
    }
});
