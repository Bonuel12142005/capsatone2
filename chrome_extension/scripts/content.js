// chrome_extension/scripts/content.js

console.log("[EchoTrace] Content script injected successfully.");

// Suppress non-critical errors
window.addEventListener('error', (e) => {
    if (e.message && e.message.includes('404')) {
        e.preventDefault();
    }
}, true);

// Inject Floating Scanner Button
const injectFloatingButton = () => {
    if (document.getElementById('echotrace-floating-btn')) return;

    const btn = document.createElement('div');
    btn.id = 'echotrace-floating-btn';
    btn.innerHTML = `
        <div style="
            position: fixed;
            bottom: 30px;
            right: 30px;
            z-index: 999999;
            background: linear-gradient(135deg, #9ca3af 0%, #6b7280 100%);
            color: white;
            padding: 12px 20px;
            border-radius: 14px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            font-weight: bold;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
            cursor: not-allowed;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            border: 2px solid rgba(255, 255, 255, 0.2);
        " onmouseover="if(this.style.cursor === 'pointer') this.style.transform='translateY(-2px) scale(1.05)';" onmouseout="this.style.transform='translateY(0) scale(1)';">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shield-alert"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span id="echotrace-btn-text">Choose a product first</span>
        </div>
    `;

    document.body.appendChild(btn);
};

// Extract information based on website
const scrapeProductData = () => {
    const hostname = window.location.hostname;
    let platform = 'unknown';
    let externalId = '';
    let title = document.title;
    let url = window.location.href;
    let imageUrl = '';
    let rating = 4.5;
    let reviews = [];

    if (hostname.includes('amazon.')) {
        platform = 'amazon';
        // Extract ASIN
        const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/i) || url.match(/\/gp\/product\/([A-Z0-9]{10})/i);
        externalId = asinMatch ? asinMatch[1] : 'AMZN-PROD';

        title = document.getElementById('productTitle')?.innerText.trim() || document.title;
        imageUrl = document.getElementById('landingImage')?.src || '';
        
        const ratingText = document.querySelector('#acrPopover')?.getAttribute('title');
        if (ratingText) {
            rating = parseFloat(ratingText.split(' ')[0]);
        }

        // Scrape reviews on page
        const amazonReviews = document.querySelectorAll('.a-section.review');
        amazonReviews.forEach((el, index) => {
            const author = el.querySelector('.a-profile-name')?.innerText.trim() || 'Anonymous';
            const text = el.querySelector('.review-text-content span')?.innerText.trim() || '';
            const date = el.querySelector('.review-date')?.innerText.trim() || '';
            
            const rText = el.querySelector('.review-rating')?.innerText.trim();
            const revRating = rText ? parseInt(rText.split(' ')[0]) : 5;

            if (text.length > 5) {
                reviews.push({ id: `ext_${index}`, author, text, date, rating: revRating });
            }
        });
    } else if (hostname.includes('shopee.')) {
        platform = 'shopee';
        // Extract Shopee item id from URL (strip query params first)
        const cleanUrl = url.split('?')[0]; // Remove query string
        // Shopee URLs follow pattern: ...i.{shopId}.{itemId}
        const shopeeMatch = cleanUrl.match(/i\.(\d+)\.(\d+)/);
        if (shopeeMatch) {
            externalId = shopeeMatch[2]; // Just the item ID
        } else {
            // Fallback: take last segment after splitting by '.'
            const parts = cleanUrl.split('.');
            externalId = parts[parts.length - 1] || 'SHP-PROD';
        }
        
        title = document.querySelector('h1')?.innerText 
            || document.querySelector('[class*="product-briefing"] [class*="title"]')?.innerText
            || document.querySelector('.attachement-item')?.innerText 
            || document.title;
        
        // Try to get product image (with robust domain filtering)
        imageUrl = document.querySelector('[class*="product-briefing"] img')?.src
            || document.querySelector('.image-carousel img')?.src
            || document.querySelector('img[src*="susercontent.com"]')?.src
            || document.querySelector('img[src*="cf.shopee"]')?.src
            || '';
        
        // Try to get rating
        const shopeeRatingEl = document.querySelector('[class*="product-rating-overview__filter"]');
        if (shopeeRatingEl) {
            const ratingMatch = shopeeRatingEl.textContent.match(/([\d.]+)\s*out/i);
            if (ratingMatch) rating = parseFloat(ratingMatch[1]);
        }
        
        // Shopee reviews - try multiple selector patterns for different Shopee versions
        const shopeeReviews = document.querySelectorAll('.shopee-product-rating') || [];
        const shopeeReviewsAlt = shopeeReviews.length > 0 ? shopeeReviews 
            : document.querySelectorAll('[class*="shopee-product-rating"]');
        
        shopeeReviewsAlt.forEach((el, index) => {
            const author = el.querySelector('.shopee-product-rating__author-name')?.innerText
                || el.querySelector('[class*="author"]')?.innerText
                || 'Shopee Customer';
            const text = el.querySelector('.shopee-product-rating__content')?.innerText
                || el.querySelector('[class*="content"]')?.innerText
                || '';
            const date = el.querySelector('.shopee-product-rating__time')?.innerText
                || el.querySelector('[class*="time"]')?.innerText
                || '';
            
            // Count stars
            const activeStars = el.querySelectorAll('.icon-rating-solid--active, [class*="icon-rating-solid--active"]').length;

            if (text.length > 5) {
                reviews.push({ id: `ext_${index}`, author, text, date, rating: activeStars || 5 });
            }
        });
    }

    // Fallback/Generic Scraper if no matches or zero reviews found
    if (reviews.length === 0) {
        // Scrape generic comments or paragraphs that look like reviews
        const paragraphs = document.querySelectorAll('p');
        let count = 0;
        paragraphs.forEach((p, idx) => {
            const text = p.innerText.trim();
            // Look for paragraphs with typical length
            if (text.length > 30 && text.length < 300 && count < 10) {
                reviews.push({
                    id: `gen_${idx}`,
                    author: `Shopper_${idx}`,
                    text: text,
                    rating: 5,
                    date: 'Recent'
                });
                count++;
            }
        });
        
        // Fallback IDs if empty
        if (!externalId) {
            externalId = 'GEN-PROD-' + Math.floor(Math.random() * 100000);
        }
        if (platform === 'unknown') {
            platform = hostname.split('.')[1] || 'web';
        }
    }

    return { platform, external_id: externalId, title, url, image_url: imageUrl, rating, reviews };
};

const executeAudit = async () => {
    const btnText = document.getElementById('echotrace-btn-text');
    const btn = document.getElementById('echotrace-floating-btn');

    // Check authentication FIRST before scanning
    chrome.storage.local.get(["auth_token"], (items) => {
        const token = items.auth_token;
        
        // Session validation: require login for each scan
        if (!token) {
            console.warn("[EchoTrace] No active session - login required");
            btnText.textContent = "🔒 Sign in to scan";
            btn.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
            btn.style.cursor = 'pointer';
            injectLoginPrompt();
            setTimeout(() => {
                setButtonReady(btnText, btn);
            }, 5000);
            return;
        }

        // Proceed with scan
        performScan(scrapedData, btnText, btn);
    });
};

const performScan = (scrapedData, btnText, btn) => {
    // Keep button blue while scanning
    btnText.textContent = "Scanning...";
    btn.style.background = 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)';
    btn.style.boxShadow = '0 8px 30px rgba(16, 185, 129, 0.4)';
    btn.style.cursor = 'not-allowed';

    console.log("[EchoTrace] Scraped data:", scrapedData);

    // Check if product data is valid (title must be more than just the page title or generic text)
    if (!scrapedData.title || scrapedData.title.length < 10 || scrapedData.title === 'Untitled') {
        btnText.textContent = "❌ Please click on a product first";
        btn.style.background = 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)';
        setTimeout(() => {
            btnText.textContent = "Audit with EchoTrace";
            btn.style.background = 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)';
        }, 3000);
        return;
    }

    if (scrapedData.reviews.length === 0) {
        btnText.textContent = "No Reviews Found to Audit";
        btn.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        setTimeout(() => {
            btnText.textContent = "Audit with EchoTrace";
            btn.style.background = 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)';
        }, 3000);
        return;
    }

    // Check if chrome API exists
    if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) {
        console.error("[EchoTrace] Chrome API not available");
        btnText.textContent = "Extension API unavailable";
        btn.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        return;
    }

    // Use chrome.runtime.sendMessage with proper error handling
    try {
        chrome.runtime.sendMessage(
            { action: "EXECUTE_SCAN", data: scrapedData }, 
            (response) => {
                // Check for errors
                if (chrome.runtime.lastError) {
                    console.error("[EchoTrace] Chrome runtime error:", chrome.runtime.lastError);
                    btnText.textContent = "Extension connection failed";
                    btn.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
                    return;
                }

                if (!response) {
                    console.error("[EchoTrace] No response from background");
                    btnText.textContent = "No response from extension";
                    btn.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
                    return;
                }

                handleScanResponse(response, btnText, btn);
            }
        );
    } catch (err) {
        console.error("[EchoTrace] Exception:", err);
        btnText.textContent = "Extension error";
        btn.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
    }
};

const handleScanResponse = (response, btnText, btn) => {
    // Handle login required
    if (response.error === "LOGIN_REQUIRED") {
        btnText.textContent = "⚠ Sign in via EchoTrace extension first";
        btn.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
        injectLoginPrompt();
        setTimeout(() => {
            btnText.textContent = "Audit with EchoTrace";
            btn.style.background = 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)';
        }, 5000);
        return;
    }

    if (response.success) {
        const trustScore = response.trust_score || 0;
        btnText.textContent = `EchoTrace Score: ${trustScore}%`;
        
        if (trustScore >= 80) {
            btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        } else if (trustScore >= 50) {
            btn.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
        } else {
            btn.style.background = 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)';
        }

        highlightReviewsInPage(response.results || []);
        injectSummaryBox(response.summary || { strengths: [], weaknesses: [], recommendation: '' }, trustScore);
        
        // Mark scan as complete so button can show "Scan again"
        btn._isScanning = false;
    } else {
        const errMsg = response.error || "Audit analysis failed";
        btnText.textContent = errMsg.length > 40 ? "Audit failed" : errMsg;
        btn.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        btn._isScanning = false;
    }
};

const injectLoginPrompt = () => {
    const id = 'echotrace-login-prompt';
    let prompt = document.getElementById(id);
    if (prompt) prompt.remove();

    prompt = document.createElement('div');
    prompt.id = id;
    prompt.innerHTML = `
        <div style="
            position: fixed;
            bottom: 90px;
            right: 30px;
            width: 280px;
            background: rgba(11, 15, 25, 0.97);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(245, 158, 11, 0.25);
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            border-radius: 14px;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 16px;
            z-index: 999999;
            font-size: 12px;
            animation: fadeIn 0.3s ease;
        ">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                <span style="font-size:20px;">🔒</span>
                <span style="font-weight:bold; font-size:13px; color:#fbbf24;">Login Required</span>
            </div>
            <p style="color:#d1d5db; line-height:1.5; margin:0 0 12px 0; font-size:11px;">
                Click the <b style="color:#10b981;">EchoTrace extension icon</b> in your browser toolbar and sign in with your account to start auditing reviews.
            </p>
            <div style="text-align:center; font-size:10px; color:#6b7280;">Auto-dismisses in 5 seconds</div>
        </div>
    `;
    document.body.appendChild(prompt);
    setTimeout(() => { prompt.remove(); }, 5000);
};

const highlightReviewsInPage = (results) => {
    // Attempt to match scraped reviews text with DOM elements and overlay warning borders/reasons
    const hostname = window.location.hostname;
    
    let reviewElements = [];
    if (hostname.includes('amazon.')) {
        reviewElements = document.querySelectorAll('.a-section.review');
    } else if (hostname.includes('shopee.')) {
        reviewElements = document.querySelectorAll('.shopee-product-rating');
    } else {
        reviewElements = document.querySelectorAll('p');
    }

    reviewElements.forEach((el) => {
        const text = el.innerText.toLowerCase();
        
        // Find corresponding result row based on text matching
        const match = results.find(r => text.includes(r.text.toLowerCase().substring(0, 30)));
        if (match && match.is_fake) {
            // Apply warning styling
            el.style.position = 'relative';
            el.style.border = '2px solid rgba(239, 68, 68, 0.4)';
            el.style.borderRadius = '8px';
            el.style.padding = '10px';
            el.style.backgroundColor = 'rgba(239, 68, 68, 0.03)';
            
            // Inject badge
            const badge = document.createElement('div');
            badge.style.position = 'absolute';
            badge.style.top = '-10px';
            badge.style.right = '10px';
            badge.style.backgroundColor = '#ef4444';
            badge.style.color = 'white';
            badge.style.fontSize = '9px';
            badge.style.fontWeight = 'bold';
            badge.style.padding = '3px 8px';
            badge.style.borderRadius = '4px';
            badge.style.zIndex = '999';
            badge.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
            
            const reasons = match.fake_reasons.join(', ') || 'High likelihood of spam/fake review';
            badge.textContent = `EchoTrace Warning: ${reasons}`;
            el.appendChild(badge);
        }
    });
};

const injectSummaryBox = (summary, trustScore) => {
    // Injects a floating card displaying strengths & weaknesses
    const id = 'echotrace-summary-card';
    let card = document.getElementById(id);
    
    // Don't remove existing card, just update it if it exists
    if (card) return; // Card already exists, don't remake it

    card = document.createElement('div');
    card.id = id;
    
    // Strengths & Weaknesses mapped
    let strList = '';
    summary.strengths.forEach(s => { strList += `<li style="margin-bottom:4px;">👍 ${s}</li>`; });
    let wkList = '';
    summary.weaknesses.forEach(w => { wkList += `<li style="margin-bottom:4px;">👎 ${w}</li>`; });

    card.innerHTML = `
        <div style="
            position: fixed;
            bottom: 90px;
            right: 30px;
            width: 320px;
            background: rgba(11, 15, 25, 0.95);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            border-radius: 16px;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 16px;
            z-index: 999999;
            font-size: 12px;
            animation: fadeIn 0.3s ease;
        ">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:8px; margin-bottom:10px;">
                <span style="font-weight:bold; font-size:13px; color:#10b981;">EchoTrace AI Audit Summary</span>
                <span style="font-weight:bold; color:${trustScore >= 80 ? '#10b981' : (trustScore >= 50 ? '#f59e0b' : '#ef4444')}">${trustScore}% Trust</span>
            </div>
            
            <div style="margin-bottom:10px;">
                <b style="color:#10b981; display:block; margin-bottom:4px;">Key Strengths:</b>
                <ul style="list-style:none; padding:0; margin:0; color:#d1d5db;">
                    ${strList}
                </ul>
            </div>
            
            <div style="margin-bottom:10px;">
                <b style="color:#ef4444; display:block; margin-bottom:4px;">Key Suspects/Weaknesses:</b>
                <ul style="list-style:none; padding:0; margin:0; color:#d1d5db;">
                    ${wkList}
                </ul>
            </div>
            
            <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:8px; color:#9ca3af; font-style:italic;">
                ${summary.recommendation}
            </div>
        </div>
    `;

    document.body.appendChild(card);
};

// ─── Button State Helpers ────────────────────────────────────────────────────
const setButtonReady = (btnText, btn) => {
    btnText.textContent = '🔍 Audit with EchoTrace';
    btn.style.background = 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)';
    btn.style.boxShadow = '0 8px 30px rgba(16, 185, 129, 0.4)';
    btn.style.cursor = 'pointer';
    btn.style.border = '2px solid rgba(255,255,255,0.15)';
};

const setButtonWaiting = (btnText, btn) => {
    btnText.textContent = '⏳ Loading product...';
    btn.style.background = 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)';
    btn.style.boxShadow = '0 4px 15px rgba(59, 130, 246, 0.3)';
    btn.style.cursor = 'not-allowed';
};

const setButtonDisabled = (btnText, btn) => {
    btnText.textContent = 'Choose a product first';
    btn.style.background = 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)';
    btn.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
    btn.style.border = '2px solid rgba(255,255,255,0.2)';
    btn.style.cursor = 'not-allowed';
};

// ─── Auto-select first product item ──────────────────────────────────────────
const autoSelectFirstProduct = () => {
    const hostname = window.location.hostname;
    
    if (hostname.includes('amazon.')) {
        // Try to click first product in search results
        const firstProduct = document.querySelector('[data-component-type="s-search-result"] a[href*="/dp/"], .s-result-item a[href*="/dp/"], h2 a[href*="/dp/"]');
        if (firstProduct && !window.location.href.includes('/dp/')) {
            console.log('[EchoTrace] Auto-selecting first Amazon product...');
            firstProduct.click();
            return true;
        }
    } else if (hostname.includes('shopee.')) {
        // Try to click first product in search results
        const firstProduct = document.querySelector('.shopee-product-card a, .shopee-product-item a[href*="/product/"]');
        if (firstProduct && !window.location.href.includes('/product/')) {
            console.log('[EchoTrace] Auto-selecting first Shopee product...');
            firstProduct.click();
            return true;
        }
    }
    return false;
};

// ─── Core: Detect product and manage button / auto-scan ───────────────────────
// Tracks the URL we already auto-scanned so we never double-fire
let _autoScannedUrl = null;
let _reviewPollInterval = null;

const enableButtonIfProductClicked = () => {
    const btn = document.getElementById('echotrace-floating-btn');
    const btnText = document.getElementById('echotrace-btn-text');
    if (!btn || btn._isScanning) return;

    const scrapedData = scrapeProductData();
    const currentUrl = window.location.href;

    console.log('[EchoTrace] Product check — title:', scrapedData.title?.length,
                '| reviews:', scrapedData.reviews.length,
                '| url:', currentUrl.substring(0, 60));

    // ── Case 1: Valid product WITH reviews → ready to scan ───────────────────
    if (scrapedData.title && scrapedData.title.length > 10 && scrapedData.reviews.length > 0) {

        // Attach click listener (idempotent)
        if (!btn._scanListenerAttached) {
            btn.addEventListener('click', () => {
                if (!btn._isScanning) {
                    const scrapedData = scrapeProductData();
                    executeAudit(scrapedData);
                }
            });
            btn._scanListenerAttached = true;
        }

        // Stop any pending review-wait poll
        if (_reviewPollInterval) {
            clearInterval(_reviewPollInterval);
            _reviewPollInterval = null;
        }

        // Auto-scan ONCE per unique product URL (only if authenticated)
        if (_autoScannedUrl !== currentUrl) {
            _autoScannedUrl = currentUrl;
            
            // Check authentication before auto-scan
            chrome.storage.local.get(["auth_token"], (items) => {
                const token = items.auth_token;
                
                if (!token) {
                    console.log('[EchoTrace] ⚠ Reviews found but no active session - login required');
                    setButtonReady(btnText, btn);
                    injectLoginPrompt();
                    return;
                }
                
                console.log('[EchoTrace] ✅ Reviews found & authenticated — auto-scanning:', scrapedData.title);
                btn._isScanning = true;
                btnText.textContent = 'Scanning…';
                btn.style.background = 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)';
                btn.style.boxShadow = '0 8px 30px rgba(16,185,129,0.4)';
                btn.style.cursor = 'not-allowed';
                setTimeout(async () => {
                    performScan(scrapedData, btnText, btn);
                    btn._isScanning = false;
                    setButtonReady(btnText, btn);
                }, 600);
            });
        } else {
            // Already scanned this URL — just keep button in "Audit again" ready state
            setButtonReady(btnText, btn);
        }

    // ── Case 2: Product page detected (title OK) but reviews not yet loaded ───
    } else if (scrapedData.title && scrapedData.title.length > 10) {

        setButtonWaiting(btnText, btn);

        // Start polling every 1.5 s waiting for reviews to load (only one poll at a time)
        if (!_reviewPollInterval && _autoScannedUrl !== currentUrl) {
            console.log('[EchoTrace] ⏳ Product found, waiting for reviews to load…');
            let pollAttempts = 0;
            _reviewPollInterval = setInterval(() => {
                pollAttempts++;
                const fresh = scrapeProductData();
                if (fresh.reviews.length > 0) {
                    clearInterval(_reviewPollInterval);
                    _reviewPollInterval = null;
                    console.log('[EchoTrace] ✅ Reviews now available after', pollAttempts, 'polls');
                    enableButtonIfProductClicked(); // re-run → will hit Case 1 and auto-scan
                } else if (pollAttempts >= 20) {
                    // Give up after ~30 s; let user click manually
                    clearInterval(_reviewPollInterval);
                    _reviewPollInterval = null;
                    console.log('[EchoTrace] ⚠ No reviews loaded after 30 s — enabling manual scan');
                    _autoScannedUrl = currentUrl; // mark so we don't re-poll
                    setButtonReady(btnText, btn);
                    if (!btn._scanListenerAttached) {
                        btn.addEventListener('click', () => { if (!btn._isScanning) executeAudit(); });
                        btn._scanListenerAttached = true;
                    }
                }
            }, 1500);
        }

    // ── Case 3: Not a product page — try to auto-select first product ────────
    } else {
        // Only try auto-select if we haven't already attempted it on this page
        if (!btn._autoSelectAttempted) {
            btn._autoSelectAttempted = true;
            console.log('[EchoTrace] No product selected, attempting to auto-select first item...');
            
            if (autoSelectFirstProduct()) {
                // Successfully selected, wait for page load then check again
                setTimeout(() => {
                    btn._autoSelectAttempted = false; // Reset so we can check again after navigation
                    enableButtonIfProductClicked();
                }, 1500);
                setButtonWaiting(btnText, btn);
                return;
            }
        }
        
        // Auto-select failed — still allow manual scan with generic content
        console.log('[EchoTrace] Auto-select not available, enabling manual audit mode');
        
        // Attach click listener so user can manually trigger scan (idempotent)
        if (!btn._scanListenerAttached) {
            btn.addEventListener('click', () => {
                if (!btn._isScanning) {
                    const scrapedData = scrapeProductData();
                    executeAudit(scrapedData);
                }
            });
            btn._scanListenerAttached = true;
        }
        
        // Set button to READY state so user can click to scan
        btnText.textContent = '🔍 Audit This Page';
        btn.style.background = 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)';
        btn.style.boxShadow = '0 8px 30px rgba(16, 185, 129, 0.4)';
        btn.style.cursor = 'pointer';
        btn.style.border = '2px solid rgba(255,255,255,0.15)';
        
        _autoScannedUrl = null;
        if (_reviewPollInterval) {
            clearInterval(_reviewPollInterval);
            _reviewPollInterval = null;
        }
    }
};

// Monitor for product clicks on Amazon
document.addEventListener('click', (e) => {
    // Amazon product click detection
    if (window.location.hostname.includes('amazon.')) {
        const target = e.target.closest('[data-component-type="s-search-result"], a[href*="/dp/"], .a-link-normal');
        if (target) {
            console.log("[EchoTrace] Amazon product clicked");
            setTimeout(enableButtonIfProductClicked, 500);
        }
    }
    // Shopee product click detection
    else if (window.location.hostname.includes('shopee.')) {
        const target = e.target.closest('.shopee-product-card, a[href*="/product/"]');
        if (target) {
            console.log("[EchoTrace] Shopee product clicked");
            setTimeout(enableButtonIfProductClicked, 500);
        }
    }
}, true);

// Also monitor URL changes for navigation
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        console.log("[EchoTrace] Page changed, checking for product");
        const btn = document.getElementById('echotrace-floating-btn');
        if (btn) {
            btn._autoSelectAttempted = false; // Reset auto-select flag on navigation
        }
        setTimeout(enableButtonIfProductClicked, 1000);
    }
}).observe(document, { subtree: true, childList: true });

// ============================================================================
// INITIALIZATION
// ============================================================================

const _init = () => {
    injectFloatingButton();
    setTimeout(() => enableButtonIfProductClicked(), 300);
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
} else {
    _init();
}

// Extra passes for SPAs (Shopee, Amazon SPA navigation)
setTimeout(_init, 800);
setTimeout(enableButtonIfProductClicked, 2500);
