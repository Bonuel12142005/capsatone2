// chrome_extension/scripts/content.js
// EchoTrace — Content Script
// Shopee fix: structural DOM traversal for hashed/obfuscated class names

'use strict';

var echoTraceInstanceId = 'et-' + Date.now() + '-' + Math.random().toString(16).slice(2);
var echoTraceIntervalIds = [];
var echoTraceNavigationTimeout = null;
var echoTraceDisposed = false;

function isExtensionContextValid() {
    try {
        return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
    } catch (_error) {
        return false;
    }
}

function disposeInvalidExtensionContext() {
    if (echoTraceDisposed) return;
    echoTraceDisposed = true;
    echoTraceIntervalIds.forEach(function(intervalId) { clearInterval(intervalId); });
    echoTraceIntervalIds = [];
    if (echoTraceNavigationTimeout) {
        clearTimeout(echoTraceNavigationTimeout);
        echoTraceNavigationTimeout = null;
    }
    document.removeEventListener('DOMContentLoaded', injectFloatingButton);
    var ownButton = document.getElementById('echotrace-btn');
    if (ownButton && ownButton.dataset.echotraceInstance === echoTraceInstanceId) {
        ownButton.remove();
        removeEchoTraceModal();
    }
}

function safeStorageGet(keys, callback) {
    if (!isExtensionContextValid()) {
        disposeInvalidExtensionContext();
        callback(null, new Error('Extension context invalidated'));
        return;
    }
    try {
        chrome.storage.local.get(keys, function(items) {
            var runtimeError = null;
            try { runtimeError = chrome.runtime.lastError; } catch (_error) {
                runtimeError = { message: 'Extension context invalidated' };
            }
            if (runtimeError || !isExtensionContextValid()) {
                disposeInvalidExtensionContext();
                callback(null, new Error(runtimeError ? runtimeError.message : 'Extension context invalidated'));
                return;
            }
            callback(items || {}, null);
        });
    } catch (error) {
        disposeInvalidExtensionContext();
        callback(null, error);
    }
}

function safeRuntimeSendMessage(message, callback) {
    if (!isExtensionContextValid()) {
        disposeInvalidExtensionContext();
        callback(null, new Error('Extension context invalidated'));
        return;
    }
    try {
        chrome.runtime.sendMessage(message, function(response) {
            var runtimeError = null;
            try { runtimeError = chrome.runtime.lastError; } catch (_error) {
                runtimeError = { message: 'Extension context invalidated' };
            }
            if (runtimeError || !isExtensionContextValid()) {
                disposeInvalidExtensionContext();
                callback(null, new Error(runtimeError ? runtimeError.message : 'Extension context invalidated'));
                return;
            }
            callback(response, null);
        });
    } catch (error) {
        disposeInvalidExtensionContext();
        callback(null, error);
    }
}

// ── Text utilities ────────────────────────────────────────────────────────────

function normalizeText(t) {
    return EchoTraceUtils.normalizeText(t);
}

function deduplicateReviews(reviews) {
    return EchoTraceUtils.deduplicateReviews(reviews).reviews;
}

function safeText(str) {
    return String(str || '');
}

// ── Site detection ────────────────────────────────────────────────────────────

function getSite() {
    var h = window.location.hostname.toLowerCase();
    if (h.includes('shopee.')) return 'shopee';
    if (h.includes('lazada.')) return 'lazada';
    if (h.includes('amazon.')) return 'amazon';
    if (h.includes('tiktok.com') || h.includes('tiktokshop.')) return 'tiktokshop';
    if (h.includes('ebay.')) return 'ebay';
    if (h.includes('aliexpress.')) return 'aliexpress';
    if (h.includes('walmart.')) return 'walmart';
    return 'generic';
}

function isProductPage() {
    var url = window.location.href;
    var site = getSite();
    if (site === 'shopee') {
        return /i\.\d+\.\d+/.test(url) ||
               url.includes('/product/') ||
               !!document.querySelector('[class*="product-briefing"], .product-briefing');
    }
    if (site === 'lazada') {
        return url.includes('/products/') ||
               /-i\d+/.test(url) ||
               !!document.querySelector('.pdp-product-title, #module_product_title_1');
    }
    if (site === 'amazon') {
        return url.includes('/dp/') ||
               url.includes('/gp/product/') ||
               url.includes('/product-reviews/') ||
               !!document.getElementById('productTitle');
    }
    if (site === 'tiktokshop') {
        return url.includes('/product/') ||
               url.includes('/view/') ||
               url.includes('/shop/') ||
               !!document.querySelector('[data-e2e*="review"], [class*="review"], [class*="ReviewItem"]');
    }
    if (site === 'ebay')       return url.includes('/itm/');
    if (site === 'aliexpress') return url.includes('/item/');
    if (site === 'walmart')    return url.includes('/ip/');
    // Generic ecommerce product page detection
    return !!document.querySelector('[itemtype*="schema.org/Product"], meta[property="og:type"][content="product"], [class*="product-detail"], [class*="product-page"]');
}

// ── Shopee review extraction ──────────────────────────────────────────────────
// Extracts individual customer reviews from a Shopee product page.
// Uses structural DOM traversal to survive hashed/obfuscated class names.
// Returns array of {id, author, text, rating, date} objects.
// No fallback text is fabricated. If extraction yields nothing, returns [].

function extractShopeeReviews() {
    var reviews = [];
    var startTime = Date.now();
    var rejected = 0;
    var reasons = {};
    var diagnostics = {
        site: 'shopee', page_state: isProductPage() ? 'product' : 'unsupported_page',
        review_section: 'missing', candidate_containers: 0,
        candidates_with_text: 0, valid_reviews: 0,
        duplicates_removed: 0, rejection_reasons: reasons
    };
    window.__echoTraceLastDiagnostics = diagnostics;

    var section = findShopeeRatingsSection();
    if (!section) {
        console.warn('[EchoTrace][Shopee] Diagnostic:', diagnostics);
        return reviews;
    }
    diagnostics.review_section = 'found';

    var cards = findShopeeReviewCards(section);
    console.log('[EchoTrace][Shopee] Found', cards.length, 'review cards in', Date.now() - startTime, 'ms');

    if (cards.length === 0) {
        // Log first container for diagnostic
        console.warn('[EchoTrace][Shopee] No review cards extracted. First container outerHTML:',
            section.outerHTML ? section.outerHTML.slice(0, 500) : '(unavailable)');
        return reviews;
    }

    cards.forEach(function(card, i) {
        var text = extractTextFromCard(card);

        if (!text) {
            rejected++; reasons.no_text = (reasons.no_text || 0) + 1; return;
        }
        if (text.length < 4) {
            rejected++; reasons.too_short = (reasons.too_short || 0) + 1; return;
        }

        // Extract star rating from SVG count or filled-star selectors
        var filledStars = card.querySelectorAll(
            'svg[fill="currentColor"], [class*="star--active"], [class*="star-active"], ' +
            '[class*="filled"], [class*="active"] svg, .active svg'
        ).length;
        // Also try numeric rating text like "4.5" or "4/5"
        var ratingNum = null;
        if (filledStars > 0 && filledStars <= 5) {
            ratingNum = filledStars;
        } else {
            var rEl = card.querySelector('[class*="rating-number"], [class*="score"]');
            if (rEl) ratingNum = parseFloat(rEl.innerText || rEl.textContent) || null;
        }

        // Extract author name
        var authorSelectors = [
            '[class*="reviewer-name"]', '[class*="buyer-name"]',
            '[class*="author"]', '[class*="user-name"]', '[class*="username"]'
        ];
        var authorEl = null;
        for (var ai = 0; ai < authorSelectors.length; ai++) {
            authorEl = card.querySelector(authorSelectors[ai]);
            if (authorEl) break;
        }
        var author = normalizeText(authorEl ? (authorEl.innerText || authorEl.textContent || '') : '');
        if (!author) author = 'Shopee Buyer';

        // Extract date
        var dateEl = card.querySelector('[class*="date"], [class*="time"], time');
        var date = normalizeText(dateEl ? (dateEl.innerText || dateEl.textContent || '') : '');

        var stableId = card.getAttribute('data-review-id') || card.getAttribute('data-rating-id') || card.id;
        reviews.push({
            id: stableId ? ('shp_' + stableId) : ('shp_' + i),
            author: author,
            text: text,
            rating: ratingNum,
            date: date
        });
    });

    if (rejected > 0) {
        console.log('[EchoTrace][Shopee] Rejected', rejected, 'cards. Reasons:', JSON.stringify(reasons));
    }

    diagnostics.candidate_containers = cards.length;
    diagnostics.candidates_with_text = cards.length - (reasons.no_text || 0);
    diagnostics.valid_reviews = reviews.length;
    console.log('[EchoTrace][Shopee] Diagnostic:', diagnostics);

    return reviews;
}

// Extract the main review text content from a card element.
// Tries known content selectors first, then falls back to the card's own text
// minus any text from child elements that look like metadata (author, date, stars).
function extractTextFromCard(card) {
    var contentSelectors = [
        // Shopee has used each of these names for the buyer's written comment.
        // Keep these ahead of generic "content" matches so a surrounding
        // metadata container is not mistaken for the review body.
        '[class*="review-comment"]', '[class*="rating__comment"]',
        '[class*="rating-comment"]', '[class*="comment-text"]',
        '[data-testid*="comment"]',
        '[class*="review-content"]', '[class*="review-body"]', '[class*="content"]',
        '[class*="comment-content"]', '[class*="cmt-content"]',
        'p', 'span[class*="text"]'
    ];

    for (var ci = 0; ci < contentSelectors.length; ci++) {
        var els = Array.from(card.querySelectorAll(contentSelectors[ci]));
        // Pick the one with the most text that isn't just a rating number
        for (var ei = 0; ei < els.length; ei++) {
            var t = normalizeText(els[ei].innerText || els[ei].textContent || '');
            if (t.length >= 10 && !/^[\d.]+$/.test(t)) {
                return t;
            }
        }
    }

    // Final fallback: use innerText of the whole card, minus very short lines
    var lines = (card.innerText || card.textContent || '').split('\r\n')
        .map(function(l) { return l.trim(); })
        .filter(function(l) { return l.length > 15 && !/^[\d.★☆\s]+$/.test(l); });
    return lines.join(' ').trim();
}

// ── Shopee DOM diagnostic helper ──────────────────────────────────────────────
// Logs a human-readable map of the review section structure.
// Run window.__echoTraceDiag() in DevTools console when reviews are visible.

function installShopeeDiagnostic() {
    window.__echoTraceDiag = function() {
        console.group('[EchoTrace][Shopee] DOM Diagnostic');
        console.log('URL:', window.location.href);

        // Find ratings section candidates
        var candidates = Array.from(document.querySelectorAll('*')).filter(function(el) {
            var cls = typeof el.className === 'string' ? el.className : '';
            return cls.includes('product-ratings') || cls.includes('product-rating');
        });
        console.log('Ratings section candidates:', candidates.length);
        candidates.forEach(function(el, i) {
            console.log('  Candidate', i, '| tag:', el.tagName, '| class:', el.className.slice(0, 80),
                '| children:', el.children.length, '| text preview:', el.innerText.slice(0, 60));
        });

        // Find the main ratings section
        var section = findShopeeRatingsSection();
        if (!section) { console.warn('  No ratings section found'); console.groupEnd(); return; }
        console.log('Ratings section found:', section.tagName, section.className.slice(0, 80));
        console.log('Direct children count:', section.children.length);

        // Walk direct children
        Array.from(section.children).forEach(function(child, i) {
            var starCount = child.querySelectorAll('svg').length;
            var textLen = (child.innerText || '').trim().length;
            console.log('  Child', i, '| tag:', child.tagName,
                '| class:', (child.className || '').slice(0, 60),
                '| svgs:', starCount, '| textLen:', textLen,
                '| text:', (child.innerText || '').slice(0, 60));
        });

        // Run the structural extractor and show what it found
        var cards = findShopeeReviewCards(section);
        console.log('Structural extractor found cards:', cards.length);
        cards.forEach(function(card, i) {
            var txt = extractTextFromCard(card);
            console.log('  Card', i, '| class:', (card.className || '').slice(0, 60),
                '| text:', txt.slice(0, 80) || '(no text)');
        });

        console.groupEnd();
    };
    console.log('[EchoTrace][Shopee] Diagnostic ready — run window.__echoTraceDiag() in console');
}

// ── Shopee: find the ratings/reviews section ──────────────────────────────────
// Shopee may name it "product-ratings", "ratings-section", or use hashed classes.
// We try semantic selectors, then fall back to the element whose text contains
// the most review-like content relative to its size.

function findShopeeRatingsSection() {
    // Strategy 1: known semantic class names (may work on some Shopee versions)
    var semantic = [
        '.product-ratings',
        '[class*="product-ratings"]',
        '[class*="ratings-section"]',
        '[class*="review-section"]',
        '[class*="reviews-section"]',
        '[class*="product-review__list"]',
        '[class*="comment-section"]',
        '[class*="cmt-list"]'
    ];
    for (var i = 0; i < semantic.length; i++) {
        var el = document.querySelector(semantic[i]);
        if (el && el.children.length > 1) return el;
    }

    // Strategy 2: find a section heading that says "Ratings & Reviews" / "Product Ratings"
    var headings = Array.from(document.querySelectorAll('h2,h3,h4,[class*="heading"],[class*="title"]'));
    for (var j = 0; j < headings.length; j++) {
        var ht = (headings[j].innerText || headings[j].textContent || '').trim().toLowerCase();
        if (ht.includes('rating') && (ht.includes('review') || ht.includes('comment'))) {
            // Return the parent container
            var parent = headings[j].parentElement;
            if (parent && parent.children.length > 2) return parent;
        }
    }

    // Strategy 3: anchor on the star-overview block, then find its parent
    // The overview block usually has aggregate stars + counts
    var overviewSelectors = [
        '[class*="product-rating-overview"]',
        '[class*="rating-overview"]',
        '[class*="ratings-overview"]',
        '[class*="review-overview"]'
    ];
    for (var k = 0; k < overviewSelectors.length; k++) {
        var ov = document.querySelector(overviewSelectors[k]);
        if (ov) {
            // The parent of the overview likely contains the individual review cards too
            var ovParent = ov.parentElement;
            if (ovParent && ovParent.children.length >= 2) return ovParent;
        }
    }

    return null;
}

// ── Shopee: structural review-card detection ──────────────────────────────────
// Instead of relying on class names, we look for structural patterns:
//   - Repeated sibling elements
//   - Each contains ≥1 SVG (star icons)
//   - Each has meaningful text content (≥5 chars)
//   - Ignores the overview/summary block
// This survives Shopee's obfuscated/hashed class names.

function findShopeeReviewCards(section) {
    if (!section) return [];

    // First try known semantic card selectors within the section
    var semanticCardSelectors = [
        '.product-review',
        '[class*="product-review__item"]',
        '[class*="shopee-product-rating"]',
        '[class*="review-item"]',
        '[class*="cmt-item"]',
        '[class*="comment-item"]',
        '[class*="rating-item"]',
        '[class*="review__card"]',
        '[class*="review-card"]'
    ];
    for (var si = 0; si < semanticCardSelectors.length; si++) {
        var found = Array.from(section.querySelectorAll(semanticCardSelectors[si]));
        // A substring selector such as "shopee-product-rating" also matches
        // the overview's rating-filter buttons (All, 5 star, 4 star, ...).
        // Keep the outer card when both a card and its descendants match, then
        // require actual card structure/text before accepting this selector.
        found = found.filter(function(el) {
            return !found.some(function(other) { return other !== el && other.contains(el); });
        });
        found = found.filter(function(el) {
            return isReviewCardElement(el) && extractTextFromCard(el).length >= 4;
        });
        if (found.length >= 1) {
            console.log('[EchoTrace][Shopee] Card selector matched:', semanticCardSelectors[si], '| count:', found.length);
            return found;
        }
    }

    // Structural fallback: walk down from the section to find a list container
    // then check its direct children as candidate cards
    var listContainer = findReviewListContainer(section);
    if (!listContainer) {
        console.warn('[EchoTrace][Shopee] No list container found inside section');
        return [];
    }

    var candidates = Array.from(listContainer.children);
    console.log('[EchoTrace][Shopee] Structural: list container children:', candidates.length,
        '| container class:', (listContainer.className || '').slice(0, 60));

    var cards = candidates.filter(function(el) {
        return isReviewCardElement(el);
    });

    // If direct children don't match, try one level deeper
    if (cards.length === 0) {
        candidates.forEach(function(child) {
            var grandchildren = Array.from(child.children).filter(isReviewCardElement);
            if (grandchildren.length > cards.length) cards = grandchildren;
        });
    }

    return cards;
}

// Find the container element that holds the list of individual review cards.
// We look for the element that has the most repeated same-structure children.
function findReviewListContainer(section) {
    // BFS through children to find a node whose children look like a repeated list
    var queue = [section];
    var bestContainer = null;
    var bestScore = 0;

    for (var depth = 0; depth < 4 && queue.length > 0; depth++) {
        var nextQueue = [];
        for (var i = 0; i < queue.length; i++) {
            var node = queue[i];
            var children = Array.from(node.children);

            if (children.length < 2) {
                children.forEach(function(c) { nextQueue.push(c); });
                continue;
            }

            // Skip the overview block
            var cls = typeof node.className === 'string' ? node.className : '';
            if (cls.includes('overview') || cls.includes('filter') || cls.includes('nav')) {
                continue;
            }

            // Score: count children that look like review cards
            var cardLike = children.filter(isReviewCardElement).length;
            if (cardLike > bestScore) {
                bestScore = cardLike;
                bestContainer = node;
            }
            children.forEach(function(c) { nextQueue.push(c); });
        }
        queue = nextQueue;
    }

    return bestContainer;
}

// Heuristic: does this element look like an individual customer review card?
function isReviewCardElement(el) {
    if (!el || el.nodeType !== 1) return false;

    var cls = typeof el.className === 'string' ? el.className.toLowerCase() : '';

    // Explicitly exclude overview / filter / navigation elements
    if (cls.includes('overview') || cls.includes('filter') || cls.includes('nav') ||
        cls.includes('summary') || cls.includes('pagination') || cls.includes('sort') ||
        cls.includes('tab') || cls.includes('header')) {
        return false;
    }

    var text = (el.innerText || el.textContent || '').trim();

    // Must have some text content
    if (text.length < 10) return false;

    // Must contain at least one SVG (star icon) — rating cards always have stars
    var svgs = el.querySelectorAll('svg');
    if (svgs.length === 0) return false;

    // Should not be a simple number-only element (e.g. "4.8" rating display)
    if (/^[\d.\s★☆]+$/.test(text)) return false;

    return true;
}

function extractLazadaReviews() {
    var reviews = [];
    var containerSelectors = [
        '[class*="item-review"]',
        '[class*="mod-reviews"]',
        '[class*="pdp-review-item"]',
        '[data-review-id]',
        '[class*="review-item"]'
    ];

    var nodes = [];
    for (var ci = 0; ci < containerSelectors.length; ci++) {
        nodes = Array.from(document.querySelectorAll(containerSelectors[ci]));
        if (nodes.length > 0) break;
    }

    var textSelectors = [
        '[class*="review-content"]',
        '[class*="review-body"]',
        '[class*="content"]'
    ];
    var authorSelectors = [
        '[class*="reviewer-name"]',
        '[class*="buyer-name"]',
        '[class*="author"]',
        '[class*="user-name"]'
    ];

    nodes.forEach(function(el, i) {
        var textEl = null;
        for (var ti = 0; ti < textSelectors.length; ti++) {
            textEl = el.querySelector(textSelectors[ti]);
            if (textEl) break;
        }
        var text = normalizeText(textEl ? (textEl.innerText || textEl.textContent || '') : '');
        if (text.length < 8) return;

        var authorEl = null;
        for (var ai = 0; ai < authorSelectors.length; ai++) {
            authorEl = el.querySelector(authorSelectors[ai]);
            if (authorEl) break;
        }
        var author = normalizeText(authorEl ? (authorEl.innerText || authorEl.textContent || '') : '');
        if (!author) author = 'Lazada Buyer';

        var starActive = el.querySelectorAll('[class*="star-active"], [class*="filled"]').length;

        reviews.push({
            id: 'lzd_' + i,
            author: author,
            text: text,
            rating: starActive > 0 ? starActive : null,
            date: ''
        });
    });

    return reviews;
}

function extractAmazonReviews() {
    var reviews = [];
    var nodes = Array.from(document.querySelectorAll(
        '.a-section.review[data-hook="review"], [data-hook="review"]'
    ));

    nodes.forEach(function(el, i) {
        var textEl = el.querySelector('[data-hook="review-body"] span, .review-text-content span');
        var text = normalizeText(textEl ? (textEl.innerText || textEl.textContent || '') : '');
        if (text.length < 8) return;

        var authorEl = el.querySelector('.a-profile-name');
        var author = normalizeText(authorEl ? (authorEl.innerText || authorEl.textContent || '') : 'Amazon Reviewer');

        var ratingEl = el.querySelector('[data-hook="review-star-rating"] .a-icon-alt, .review-rating .a-icon-alt');
        var rating = null;
        if (ratingEl) {
            var m = (ratingEl.innerText || ratingEl.textContent || '').match(/^([\d.]+)/);
            if (m) rating = parseFloat(m[1]);
        }

        reviews.push({ id: 'amz_' + i, author: author, text: text, rating: rating, date: '' });
    });

    return reviews;
}

function extractGenericMarketplaceReviews(site) {
    var selectors = {
        ebay: ['[data-testid="review-item"]', '[class*="review-item"]', '[class*="review-card"]'],
        aliexpress: ['[class*="feedback-item"]', '[class*="review-item"]', '[data-review-id]'],
        walmart: ['[data-testid="review"]', '[data-testid="review-card"]', '[class*="review-item"]'],
        tiktokshop: ['[data-e2e="review-item"]', '[data-e2e*="review"]', '[class*="review-item"]']
    }[site] || [];
    var nodes = [];
    selectors.forEach(function(selector) {
        if (!nodes.length) nodes = Array.from(document.querySelectorAll(selector));
    });
    return nodes.map(function(el, index) {
        var textEl = el.querySelector('[data-testid="review-text"], [data-e2e*="comment"], [class*="review-text"], [class*="review-content"], [class*="comment-content"]');
        var text = normalizeText(textEl ? (textEl.innerText || textEl.textContent || '') : (el.innerText || el.textContent || ''));
        if (text.length < 8 || text.length > 10000) return null;
        var authorEl = el.querySelector('[class*="author"], [class*="user-name"], [data-testid="review-author"]');
        return {
            id: el.getAttribute('data-review-id') || el.id || site + '_' + index,
            author: normalizeText(authorEl ? (authorEl.innerText || authorEl.textContent || '') : 'Anonymous'),
            text: text,
            rating: null,
            date: ''
        };
    }).filter(Boolean);
}

// extractReviews: site-dispatch, no fallback fabrication
function extractTikTokShopReviews() {
    var reviews = [];
    var containerSelectors = [
        '[data-e2e="review-item"]', '[data-e2e*="review"]',
        '[class*="ReviewItem"]', '[class*="review-item"]',
        '[class*="feedback-card"]', '[class*="review-card"]'
    ];
    var nodes = [];
    for (var ci = 0; ci < containerSelectors.length; ci++) {
        nodes = Array.from(document.querySelectorAll(containerSelectors[ci]));
        if (nodes.length > 0) break;
    }
    nodes.forEach(function(el, i) {
        var textEl = el.querySelector('[data-e2e*="comment"], [data-e2e*="text"], [class*="review-text"], [class*="review-content"], [class*="comment-text"], p');
        var text = normalizeText(textEl ? (textEl.innerText || textEl.textContent || '') : el.innerText);
        if (text.length < 4) return;
        var authorEl = el.querySelector('[data-e2e*="user"], [data-e2e*="author"], [class*="username"], [class*="author"]');
        var author = normalizeText(authorEl ? (authorEl.innerText || authorEl.textContent || '') : 'TikTok Buyer');
        var dateEl = el.querySelector('[data-e2e*="date"], [data-e2e*="time"], [class*="date"], [class*="time"], time');
        var date = normalizeText(dateEl ? (dateEl.innerText || dateEl.textContent || '') : '');
        var starCount = el.querySelectorAll('svg[fill*="currentColor"], [class*="star-active"], [class*="star--active"], [class*="filled"]').length;
        reviews.push({
            id: el.getAttribute('data-review-id') || el.id || ('ttk_' + i),
            author: author,
            text: text,
            rating: (starCount > 0 && starCount <= 5) ? starCount : null,
            date: date
        });
    });
    return reviews;
}

function scrollToReviewSection(site) {
    var section = null;
    if (site === 'shopee') {
        section = findShopeeRatingsSection() || document.querySelector('[class*="product-rating"], .product-ratings');
    } else if (site === 'lazada') {
        section = document.querySelector('#module_product_review, [class*="mod-reviews"], [class*="pdp-review"]');
    } else if (site === 'amazon') {
        section = document.querySelector('#cm-cr-dp-review-list, #reviews-medley-footer, #customerReviews');
    } else if (site === 'tiktokshop') {
        section = document.querySelector('[data-e2e*="review"], [class*="review-container"], [class*="ReviewSection"]');
    } else {
        section = document.querySelector('[class*="review"], #reviews, [itemprop="review"]');
    }
    if (section && typeof section.scrollIntoView === 'function') {
        try {
            section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (_) {
            section.scrollIntoView(true);
        }
    }
}

function tryAdvanceReviews(site) {
    var nextBtn = null;
    if (site === 'shopee') {
        var shopeeNext = document.querySelector(
            '.shopee-page-controller button.shopee-icon-button--right:not([disabled]):not(.shopee-button-outline--disabled), ' +
            '[class*="page-controller"] [class*="icon-button--right"]:not([disabled]), ' +
            '.shopee-page-controller button.shopee-button-solid--primary + button:not([disabled])'
        );
        if (shopeeNext) nextBtn = shopeeNext;
    } else if (site === 'lazada') {
        var lazadaNext = document.querySelector(
            '.next-pagination-item.next:not(.next-disabled) button, ' +
            '.ant-pagination-next:not(.ant-pagination-disabled) button, ' +
            '[class*="pagination"] [class*="next"]:not([class*="disabled"])'
        );
        if (lazadaNext) nextBtn = lazadaNext;
    } else if (site === 'amazon') {
        var amazonNext = document.querySelector(
            '#cm_cr-pagination_bar .a-last:not(.a-disabled) a, ' +
            'ul.a-pagination li.a-last:not(.a-disabled) a'
        );
        if (amazonNext) nextBtn = amazonNext;
    } else if (site === 'tiktokshop') {
        var tiktokNext = document.querySelector(
            '[data-e2e*="next"]:not([disabled]), ' +
            'button[class*="load-more"]:not([disabled]), ' +
            'button[class*="view-more"]:not([disabled])'
        );
        if (tiktokNext) nextBtn = tiktokNext;
    }

    if (nextBtn) {
        try {
            nextBtn.click();
            return true;
        } catch (_) {}
    }

    // Fallback: scroll down smoothly to trigger dynamic lazy loading
    window.scrollBy({ top: 450, behavior: 'smooth' });
    return true;
}

function extractReviewsForSite(site) {
    var reviews = [];
    if (site === 'shopee')          reviews = extractShopeeReviews();
    else if (site === 'lazada')     reviews = extractLazadaReviews();
    else if (site === 'amazon')     reviews = extractAmazonReviews();
    else if (site === 'tiktokshop') reviews = extractTikTokShopReviews();
    else reviews = extractGenericMarketplaceReviews(site);
    return reviews;
}

function extractReviews(target) {
    var site = getSite();
    var reviews = extractReviewsForSite(site);
    var deduplication = EchoTraceUtils.deduplicateReviews(reviews);
    var maxTarget = target ? parseInt(target, 10) : 50;
    return deduplication.reviews.slice(0, maxTarget);
}

// ── Product metadata ──────────────────────────────────────────────────────────

function scrapeProductData() {
    var site = getSite();
    var url = window.location.href;
    var platform = site;
    var externalId = '';
    var title = '';
    var imageUrl = '';
    var rating = null;

    if (site === 'shopee') {
        var m = url.split('?')[0].match(/i\.(\d+)\.(\d+)/);
        externalId = m ? m[2] : ('shp_' + Date.now());
        var titleEl = document.querySelector('[class*="product-briefing"] [class*="title"]') ||
                      document.querySelector('h1');
        title = normalizeText(titleEl ? (titleEl.innerText || titleEl.textContent || '') : document.title);
        imageUrl = (document.querySelector('meta[property="og:image"]') || {}).content || '';
        var rEl = document.querySelector('[class*="rating-number"]');
        if (rEl) rating = parseFloat(rEl.innerText || rEl.textContent) || null;

    } else if (site === 'lazada') {
        var m2 = url.match(/-i(\d+)/);
        externalId = m2 ? m2[1] : ('lzd_' + Date.now());
        var titleEl2 = document.querySelector('.pdp-product-title') ||
                       document.getElementById('module_product_title_1') ||
                       document.querySelector('h1');
        title = normalizeText(titleEl2 ? (titleEl2.innerText || titleEl2.textContent || '') : document.title);
        imageUrl = (document.querySelector('meta[property="og:image"]') || {}).content || '';
        var rEl2 = document.querySelector('[class*="score"]');
        if (rEl2) rating = parseFloat(rEl2.innerText || rEl2.textContent) || null;

    } else if (site === 'amazon') {
        var m3 = url.match(/\/dp\/([A-Z0-9]{10})/i);
        externalId = m3 ? m3[1] : ('amz_' + Date.now());
        var titleEl3 = document.getElementById('productTitle');
        title = normalizeText(titleEl3 ? (titleEl3.innerText || titleEl3.textContent || '') : document.title);
        var imgEl = document.getElementById('landingImage');
        imageUrl = imgEl ? imgEl.src : '';
        var rEl3 = document.querySelector('#acrPopover');
        if (rEl3) rating = parseFloat(rEl3.getAttribute('title')) || null;

    } else {
        externalId = 'gen_' + Date.now();
        title = normalizeText(document.title);
    }

    var targetCount = window.__echoTraceConfiguredTarget || 10;
    var reviews = extractReviews(targetCount);

    var extractionFailed = false;
    if (reviews.length === 0 && site === 'shopee') {
        var cards = document.querySelectorAll('.shopee-product-rating, [class*="product-rating"], .product-review');
        if (cards.length > 0) {
            extractionFailed = true;
        }
    }

    return {
        platform: platform,
        external_id: externalId,
        title: title.slice(0, 200),
        url: url,
        image_url: imageUrl,
        rating: rating,
        reviews: reviews,
        reviews_extracted: reviews.length,
        reviews_accessible: reviews.length,
        target: targetCount,
        extraction_failed: extractionFailed,
        extraction_note: extractionFailed
            ? 'Containers found but text extraction failed — review DOM structure may have changed.'
            : reviews.length === 0
                ? 'No customer reviews were visible in the DOM at time of scan.'
                : (reviews.length < targetCount
                    ? (reviews.length + ' of ' + targetCount + ' target reviews collected. Only ' + reviews.length + ' reviews were accessible.')
                    : (reviews.length + ' reviews analyzed.'))
    };
}

// ── Floating button ───────────────────────────────────────────────────────────

function injectStyles() {
    if (document.getElementById('echotrace-injected-styles')) return;
    var s = document.createElement('style');
    s.id = 'echotrace-injected-styles';
    s.textContent = [
        '#echotrace-btn{all:unset;box-sizing:border-box;cursor:pointer;position:fixed;bottom:26px;right:26px;z-index:2147483647;display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:999px;background:linear-gradient(135deg,#065f46 0%,#0f766e 50%,#0369a1 100%);color:#ffffff;border:1px solid rgba(56,189,248,.35);box-shadow:0 8px 30px rgba(0,0,0,.45),0 0 16px rgba(16,185,129,.22);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:12px;font-weight:700;line-height:1.2;user-select:none;transition:transform .2s ease,box-shadow .2s ease,background .3s ease;max-width:calc(100vw - 36px);}',
        '#echotrace-btn:hover{transform:translateY(-2px);box-shadow:0 12px 36px rgba(0,0,0,.55),0 0 22px rgba(16,185,129,.35);}',
        '#echotrace-btn:focus-visible{outline:3px solid #38bdf8;outline-offset:3px;}',
        '#echotrace-btn .et-btn-shield{width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;flex-shrink:0;}',
        '#echotrace-btn .et-label-wrap{display:flex;flex-direction:column;gap:1px;min-width:0;}',
        '#echotrace-btn #et-btn-label{font-size:12px;font-weight:800;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '#echotrace-btn #et-btn-support{font-size:9.5px;font-weight:500;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '#echotrace-btn #et-btn-action{font-size:9.5px;font-weight:850;color:#6ee7b7;text-decoration:underline;text-underline-offset:2px;}',
        '@keyframes etPulse{0%,100%{box-shadow:0 8px 30px rgba(0,0,0,.45),0 0 0 0 rgba(16,185,129,.4);}50%{box-shadow:0 8px 30px rgba(0,0,0,.45),0 0 0 8px rgba(16,185,129,0);}}',
        '@keyframes etShimmer{0%{background-position:0% 50%;}50%{background-position:100% 50%;}100%{background-position:0% 50%;}}',
        '@keyframes etSlide{from{opacity:0;transform:translateY(10px) scale(.98);}to{opacity:1;transform:translateY(0) scale(1);}}',
        '@keyframes etStatus{0%,100%{opacity:.6;transform:scale(1);}50%{opacity:1;transform:scale(1.25);}}',
        '.et-btn-pulse{animation:etPulse 2.8s infinite cubic-bezier(.4,0,.6,1);}',
        '.et-btn-scanning{background:linear-gradient(90deg,#059669,#0284c7,#7c3aed,#059669)!important;background-size:250% 100%!important;animation:etShimmer 2s infinite linear!important;}',
        '.et-card-anim{animation:etSlide .3s cubic-bezier(.16,1,.3,1) forwards;}',
        '.et-fake-hl{outline:2px solid rgba(239,68,68,.7)!important;border-radius:6px!important;background:rgba(239,68,68,.06)!important;position:relative!important;}',
        '.et-genuine-hl{outline:1px solid rgba(16,185,129,.4)!important;border-radius:6px!important;background:rgba(16,185,129,.03)!important;}',
        '.et-uncertain-hl{outline:1px dashed rgba(245,158,11,.6)!important;border-radius:6px!important;}',
        '.et-status-dot{width:7px;height:7px;flex:0 0 auto;border-radius:50%;background:#34d399;box-shadow:0 0 6px #10b981;}.et-btn-scanning .et-status-dot{background:#fff;animation:etStatus .8s ease-in-out infinite;}.et-btn-error .et-status-dot{background:#f87171;box-shadow:0 0 6px #ef4444;}',
        '@media(prefers-reduced-motion:reduce){#echotrace-btn,.et-btn-pulse,.et-btn-scanning,.et-card-anim{animation:none!important;transition:none!important;}}',
        '@media(max-width:480px){#echotrace-btn{right:14px!important;bottom:14px!important;padding:8px 12px!important;}#echotrace-btn #et-btn-support{display:none!important;}}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(s);
}

function setBtn(btn, state, _legacyLabel, supportingLabel) {
    var textEl = btn.querySelector('#et-btn-label');
    var supportEl = btn.querySelector('#et-btn-support');
    var actionEl = btn.querySelector('#et-btn-action');
    btn.classList.remove('et-btn-pulse', 'et-btn-scanning', 'et-btn-error');

    var defaultLabels = {
        ready: 'Scan Reviews',
        scanning: 'Scanning customer reviews...',
        result: 'EchoTrace Review Analysis',
        no_flags: 'EchoTrace Review Analysis',
        disabled: 'Open a product page first',
        login: 'Sign in to Scan Reviews',
        error: 'Review Analysis Incomplete'
    };
    var defaultSupport = {
        ready: 'EchoTrace • Multi-Platform Review Scanner',
        scanning: 'Scanning customer reviews...',
        disabled: 'EchoTrace works on supported ecommerce product pages',
        login: 'Open the extension to authenticate',
        error: 'Select to view details or retry'
    };
    var text = defaultLabels[state] || defaultLabels.ready;
    var support = supportingLabel || defaultSupport[state] || '';

    switch (state) {
        case 'ready':
            btn.classList.add('et-btn-pulse');
            btn.style.background = 'linear-gradient(135deg,#10b981 0%,#3b82f6 100%)';
            btn.style.cursor = 'pointer';
            btn.style.opacity = '1';
            break;
        case 'scanning':
            btn.classList.add('et-btn-scanning');
            btn.style.cursor = 'wait';
            btn.style.opacity = '1';
            break;
        case 'result':
            btn.style.background = 'linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%)';
            btn.style.cursor = 'pointer';
            btn.style.opacity = '1';
            break;
        case 'no_flags':
            btn.style.background = 'linear-gradient(135deg,#064e3b 0%,#059669 100%)';
            btn.style.cursor = 'pointer';
            btn.style.opacity = '1';
            break;
        case 'disabled':
            btn.style.background = 'linear-gradient(135deg,#4b5563 0%,#374151 100%)';
            btn.style.cursor = 'not-allowed';
            btn.style.opacity = '0.65';
            break;
        case 'login':
            btn.style.background = 'linear-gradient(135deg,#f59e0b 0%,#d97706 100%)';
            btn.style.cursor = 'pointer';
            btn.style.opacity = '1';
            break;
        case 'error':
            btn.classList.add('et-btn-error');
            btn.style.background = 'linear-gradient(135deg,#ef4444 0%,#b91c1c 100%)';
            btn.style.cursor = 'pointer';
            btn.style.opacity = '1';
            break;
    }
    if (textEl && text) textEl.textContent = text;
    if (supportEl) {
        supportEl.textContent = support;
        supportEl.style.display = support ? 'block' : 'none';
    }
    if (actionEl) {
        var showAction = state === 'result' || state === 'no_flags';
        actionEl.textContent = showAction ? 'View Results' : '';
        actionEl.style.display = showAction ? 'block' : 'none';
    }
    btn.setAttribute('aria-label', (support ? text + '. ' + support : text) + (showAction ? '. View Results' : ''));
}

function injectFloatingButton() {
    if (!isExtensionContextValid()) {
        disposeInvalidExtensionContext();
        return;
    }
    injectStyles();

    var existing = document.getElementById('echotrace-btn');
    if (existing) {
        if (existing.dataset.echotraceInstance !== echoTraceInstanceId) {
            existing.remove();
        } else {
            if (!existing._scanning && !existing._result) {
                setBtn(existing, isProductPage() ? 'ready' : 'disabled');
            }
            return;
        }
    }

    var onProduct = isProductPage();
    var btn = document.createElement('button');
    btn.id = 'echotrace-btn';
    btn.dataset.echotraceInstance = echoTraceInstanceId;
    btn.type = 'button';
    btn.setAttribute('aria-label', 'EchoTrace Multi-Platform Review Scanner');

    var shieldWrap = document.createElement('span');
    shieldWrap.className = 'et-btn-shield';
    shieldWrap.setAttribute('aria-hidden', 'true');

    var iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    iconSvg.setAttribute('width', '14');
    iconSvg.setAttribute('height', '14');
    iconSvg.setAttribute('viewBox', '0 0 24 24');
    iconSvg.setAttribute('fill', 'none');
    iconSvg.setAttribute('stroke', 'currentColor');
    iconSvg.setAttribute('stroke-width', '2.5');
    iconSvg.setAttribute('stroke-linecap', 'round');
    iconSvg.setAttribute('stroke-linejoin', 'round');
    var iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    iconPath.setAttribute('d', 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z');
    iconSvg.appendChild(iconPath);
    shieldWrap.appendChild(iconSvg);

    var labelWrap = document.createElement('span');
    labelWrap.className = 'et-label-wrap';

    var labelSpan = document.createElement('span');
    labelSpan.id = 'et-btn-label';
    labelSpan.textContent = 'Scan Reviews';

    var supportSpan = document.createElement('span');
    supportSpan.id = 'et-btn-support';
    supportSpan.textContent = 'EchoTrace • Multi-Platform Review Scanner';

    var actionSpan = document.createElement('span');
    actionSpan.id = 'et-btn-action';
    actionSpan.style.display = 'none';

    labelWrap.appendChild(labelSpan);
    labelWrap.appendChild(supportSpan);
    labelWrap.appendChild(actionSpan);

    var statusDot = document.createElement('span');
    statusDot.className = 'et-status-dot';
    statusDot.setAttribute('aria-hidden', 'true');

    btn.appendChild(shieldWrap);
    btn.appendChild(statusDot);
    btn.appendChild(labelWrap);

    setBtn(btn, onProduct ? 'ready' : 'disabled');

    btn.addEventListener('click', function() {
        if (btn._scanning) {
            if (!document.getElementById('echotrace-modal-host')) {
                openAnalysisStateModal('loading', 'Reviews are being extracted and analyzed.');
            }
            return;
        }

        if (btn._result) {
            var existing = document.getElementById('echotrace-modal-host');
            if (existing) return;
            openResultsModal(btn._result);
            return;
        }
        if (btn._errorMessage) {
            openAnalysisStateModal(btn._errorState || 'error', btn._errorMessage);
            return;
        }

        if (!isProductPage()) return;

        safeStorageGet(['auth_token'], function(items, error) {
            if (error || !items) return;
            if (!items.auth_token) {
                setBtn(btn, 'login');
                showLoginPrompt();
                setTimeout(function() { setBtn(btn, 'ready'); }, 5000);
                return;
            }
            startScan(btn);
        });
    });

    document.body.appendChild(btn);

    safeStorageGet(['review_target'], function(items) {
        if (items && items.review_target) {
            window.__echoTraceConfiguredTarget = parseInt(items.review_target, 10);
        }
    });

    safeStorageGet(['last_scan_result'], function(items, error) {
        if (error || !items || btn._scanning || btn._result) return;
        var stored = items.last_scan_result;
        if (!stored || !stored.success || !stored.source_url || stored.source_url !== window.location.href) return;
        btn._result = stored;
        var analyzed = stored.metrics && stored.metrics.total_scanned != null
            ? stored.metrics.total_scanned : (stored.results || []).length;
        var flagged = EchoTraceUtils.flaggedResults(stored.results || []).length;
        setBtn(btn, flagged > 0 ? 'result' : 'no_flags', null, analyzed + ' reviews analyzed');
    });
}

function startScan(btn, targetArg) {
    var chosenTarget = targetArg ? parseInt(targetArg, 10) : (window.__echoTraceConfiguredTarget || 10);
    window.__echoTraceConfiguredTarget = chosenTarget;
    window.__echoTraceScanCancelled = false;

    btn._scanning = true;
    btn._result = null;
    btn._errorMessage = null;
    btn._errorState = null;
    setBtn(btn, 'scanning');
    removeEchoTraceModal();
    openAnalysisStateModal('loading', 'Scanning customer reviews on this page (target: ' + chosenTarget + ')…');

    var site = getSite();
    var labelEl = btn.querySelector('#et-btn-label');

    safeRuntimeSendMessage({ action: 'SCAN_PROGRESS', stage: 'detecting', target: chosenTarget }, function(){});

    waitForReviews(site, labelEl, function(data) {
        if (window.__echoTraceScanCancelled) {
            btn._scanning = false;
            setBtn(btn, 'ready');
            removeEchoTraceModal();
            return;
        }

        if (data.reviews.length === 0) {
            btn._scanning = false;
            var errMsg = (data.extraction_failed)
                ? '⚠ Extraction failed — check console for details'
                : '⚠ No reviews found — scroll down first';
            setBtn(btn, 'error', null, '0 reviews analyzed · View Details');
            btn._errorState = 'no_reviews';
            btn._errorMessage = errMsg + '. No reviews were analyzed.';
            openAnalysisStateModal('no_reviews', btn._errorMessage);
            return;
        }

        var supportEl = btn.querySelector('#et-btn-support');
        if (supportEl) supportEl.textContent = data.reviews.length + ' extracted reviews awaiting model analysis';

        safeRuntimeSendMessage({ action: 'SCAN_PROGRESS', stage: 'analyzing', count: data.reviews.length, target: chosenTarget }, function(){});

        data.client_scan_id = (self.crypto && typeof self.crypto.randomUUID === 'function')
            ? self.crypto.randomUUID()
            : `scan-${Date.now()}-${Math.random().toString(16).slice(2)}`;

        safeRuntimeSendMessage({ action: 'EXECUTE_SCAN', data: data }, function(response, runtimeError) {
            btn._scanning = false;

            if (window.__echoTraceScanCancelled) {
                setBtn(btn, 'ready');
                removeEchoTraceModal();
                return;
            }

            if (runtimeError) {
                if (!isExtensionContextValid()) return;
                setBtn(btn, 'error', null, 'Extension communication failed · View Details');
                btn._errorMessage = 'The extension could not complete the review analysis. Reload the page and try again.';
                btn._errorState = 'error';
                openAnalysisStateModal('error', btn._errorMessage);
                return;
            }
            if (!response) {
                setBtn(btn, 'error', null, 'Analysis service did not respond · View Details');
                btn._errorMessage = 'The analysis service did not return a result. No detection counts were generated.';
                btn._errorState = 'error';
                openAnalysisStateModal('error', btn._errorMessage);
                return;
            }
            if (response.error === 'LOGIN_REQUIRED') {
                setBtn(btn, 'login');
                showLoginPrompt();
                setTimeout(function() { setBtn(btn, 'ready'); }, 5000);
                return;
            }
            if (!response.success) {
                var errText = (response.error && response.error.length < 45) ? response.error : 'Analysis failed';
                setBtn(btn, 'error', null, 'Analysis could not be completed · View Details');
                btn._errorMessage = errText + '. No results were fabricated.';
                btn._errorState = 'error';
                openAnalysisStateModal('error', btn._errorMessage);
                return;
            }

            safeRuntimeSendMessage({ action: 'SCAN_PROGRESS', stage: 'saving', target: chosenTarget }, function(){});

            btn._result = response;
            var analyzed = (response.metrics != null && response.metrics.total_scanned != null)
                ? response.metrics.total_scanned
                : (response.results ? response.results.length : data.reviews.length);
            var targetCount = data.target || window.__echoTraceConfiguredTarget || 10;
            var subText = (analyzed < targetCount)
                ? (analyzed + ' of ' + targetCount + ' target reviews collected. Only ' + analyzed + ' reviews were accessible.')
                : (analyzed + ' reviews analyzed');
            var flaggedCount = EchoTraceUtils.flaggedResults(response.results || []).length;
            setBtn(btn, flaggedCount > 0 ? 'result' : 'no_flags', null, subText);

            highlightReviews(response.results || []);
            openResultsModal(response);
        });
    });
}

// Async wait for reviews to appear — polls DOM with bounded retries
// Observes the review section for mutations as well (Shopee lazy-loads)
function waitForReviews(site, labelEl, callback) {
    var target = window.__echoTraceConfiguredTarget || 10;
    var collectedMap = new Map();
    var cycle = 0;
    var maxCycles = Math.min(Math.ceil(target / 4) + 2, 12);
    var consecutiveNoNew = 0;

    if (labelEl) labelEl.textContent = 'Detecting platform…';

    scrollToReviewSection(site);

    function addReviewsToMap(list) {
        var added = 0;
        (list || []).forEach(function(r) {
            if (!r || !r.text || r.text.length < 4) return;
            var key = (r.id || '') + '|' + (r.author || '') + '|' + r.text.trim().toLowerCase().slice(0, 80);
            if (!collectedMap.has(key)) {
                collectedMap.set(key, r);
                added++;
            }
        });
        return added;
    }

    function step() {
        if (window.__echoTraceScanCancelled) {
            finish();
            return;
        }

        cycle++;
        var batch = extractReviewsForSite(site);
        var added = addReviewsToMap(batch);
        var count = collectedMap.size;

        if (labelEl) {
            labelEl.textContent = count > 0
                ? 'Collecting reviews (' + count + '/' + target + ')…'
                : 'Waiting for reviews (' + cycle + '/' + maxCycles + ')…';
        }

        safeRuntimeSendMessage({ action: 'SCAN_PROGRESS', stage: 'collecting', count: count, target: target }, function(){});

        if (count >= target || cycle >= maxCycles) {
            finish();
            return;
        }

        if (added === 0 && count > 0) {
            consecutiveNoNew++;
            if (consecutiveNoNew >= 2) {
                finish();
                return;
            }
        } else {
            consecutiveNoNew = 0;
        }

        tryAdvanceReviews(site);
        setTimeout(step, 900);
    }

    function finish() {
        var allUnique = Array.from(collectedMap.values());
        var finalSubset = allUnique.slice(0, target);
        var baseData = scrapeProductData();

        baseData.reviews = finalSubset;
        baseData.reviews_extracted = finalSubset.length;
        baseData.reviews_accessible = allUnique.length;
        baseData.target = target;
        baseData.extraction_note = finalSubset.length === 0
            ? 'No customer reviews were visible in the DOM at time of scan.'
            : (finalSubset.length < target
                ? (finalSubset.length + ' of ' + target + ' target reviews collected. Only ' + finalSubset.length + ' reviews were accessible.')
                : (finalSubset.length + ' reviews analyzed.'));

        callback(baseData);
    }

    setTimeout(step, 400);
}

function highlightReviews(results) {
    if (!results || !results.length) return;
    var site = getSite();
    var reviewNodes = [];

    if (site === 'shopee') {
        var sels = ['.shopee-product-rating', '[class*="shopee-product-rating"]', '[class*="comment-item"]', '[class*="review-item"]'];
        for (var i = 0; i < sels.length; i++) {
            reviewNodes = Array.from(document.querySelectorAll(sels[i]));
            if (reviewNodes.length) break;
        }
    } else if (site === 'lazada') {
        var sels2 = ['[class*="review-item"]', '[data-review-id]', '[class*="pdp-review"]'];
        for (var j = 0; j < sels2.length; j++) {
            reviewNodes = Array.from(document.querySelectorAll(sels2[j]));
            if (reviewNodes.length) break;
        }
    } else if (site === 'amazon') {
        reviewNodes = Array.from(document.querySelectorAll('[data-hook="review"]'));
    }

    reviewNodes.forEach(function(el) {
        var elText = (el.innerText || el.textContent || '').toLowerCase();
        var match = null;
        for (var k = 0; k < results.length; k++) {
            var snippet = results[k].text ? results[k].text.toLowerCase().slice(0, 45) : '';
            if (snippet.length > 5 && elText.includes(snippet)) {
                match = results[k];
                break;
            }
        }
        if (!match) return;

        // Remove old badges
        var oldBadge = el.querySelector('.et-badge');
        if (oldBadge) oldBadge.remove();
        el.classList.remove('et-fake-hl', 'et-genuine-hl', 'et-uncertain-hl');

        var label = getClassificationLabel(match);
        var badge = document.createElement('div');
        badge.className = 'et-badge';
        badge.style.cssText = 'position:absolute;top:-10px;right:8px;font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;z-index:9999;white-space:nowrap;color:#fff;';

        if (label === 'Potentially Fake') {
            el.classList.add('et-fake-hl');
            badge.style.background = '#ef4444';
            var reason = (match.fake_reasons && match.fake_reasons[0]) ? match.fake_reasons[0].slice(0, 60) : 'Suspicious pattern';
            badge.textContent = '⚠ EchoTrace: ' + reason;
            el.style.position = 'relative';
            el.appendChild(badge);
        } else if (label === 'Uncertain') {
            el.classList.add('et-uncertain-hl');
            badge.style.background = '#92400e';
            badge.textContent = '? EchoTrace: Low confidence';
            el.style.position = 'relative';
            el.appendChild(badge);
        } else {
            el.classList.add('et-genuine-hl');
        }
    });
}

// Map ML output to display label
// confidence_score = P(fake) × 100 (see classifier.py)
// For is_fake=0: confidence_score = P(fake)×100, so P(genuine) = 100 - confidence_score
// Uncertain = P(fake) between 40-60 (near the 50% decision boundary)
function getClassificationLabel(result) {
    return EchoTraceUtils.classificationLabel(result);
}

// ── Result card (XSS-safe DOM construction) ───────────────────────────────────

function showAnalysisState(state, message) {
    var existing = document.getElementById('echotrace-card');
    if (existing) existing.remove();
    var card = document.createElement('section');
    card.id = 'echotrace-card';
    card.className = 'et-card-anim';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'false');
    card.setAttribute('aria-labelledby', 'et-panel-title');
    var inner = document.createElement('div');
    inner.style.cssText = [
        'position:fixed', 'bottom:100px', 'right:28px', 'width:min(380px,calc(100vw - 32px))',
        'background:rgba(8,15,27,.98)', 'backdrop-filter:blur(18px)',
        'border:1px solid rgba(148,163,184,.22)', 'border-radius:18px',
        'color:#f8fafc', 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
        'padding:18px', 'z-index:2147483646', 'box-sizing:border-box',
        'box-shadow:0 24px 70px rgba(0,0,0,.55)'
    ].join(';');
    var header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;';
    var heading = document.createElement('div');
    heading.id = 'et-panel-title';
    heading.style.cssText = 'font-size:14px;font-weight:800;letter-spacing:-.01em;';
    heading.textContent = state === 'loading' ? 'Analyzing Product Reviews...' : 'Review Analysis Incomplete';
    var close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close review analysis');
    close.style.cssText = 'width:30px;height:30px;border-radius:8px;border:1px solid rgba(148,163,184,.2);background:rgba(255,255,255,.04);color:#cbd5e1;cursor:pointer;font-size:16px;';
    close.textContent = '×';
    close.addEventListener('click', function () { card.remove(); });
    header.appendChild(heading);
    header.appendChild(close);
    var status = document.createElement('div');
    status.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px;border-radius:12px;background:' +
        (state === 'loading' ? 'rgba(37,99,235,.12)' : 'rgba(220,38,38,.10)') + ';border:1px solid ' +
        (state === 'loading' ? 'rgba(96,165,250,.22)' : 'rgba(248,113,113,.22)') + ';';
    var indicator = document.createElement('span');
    indicator.setAttribute('aria-hidden', 'true');
    indicator.style.cssText = state === 'loading'
        ? 'width:16px;height:16px;border:2px solid rgba(147,197,253,.3);border-top-color:#60a5fa;border-radius:50%;animation:etSpin .8s linear infinite;flex:0 0 auto;'
        : 'color:#f87171;font-size:18px;font-weight:900;flex:0 0 auto;';
    if (state !== 'loading') indicator.textContent = '!';
    var copy = document.createElement('div');
    copy.style.cssText = 'font-size:11px;line-height:1.55;color:#cbd5e1;';
    copy.textContent = message;
    status.appendChild(indicator);
    status.appendChild(copy);
    inner.appendChild(header);
    inner.appendChild(status);
    if (state === 'error') {
        var retry = document.createElement('button');
        retry.type = 'button';
        retry.style.cssText = 'width:100%;margin-top:12px;padding:10px 12px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-size:11px;font-weight:800;cursor:pointer;';
        retry.textContent = 'Retry Analysis';
        retry.addEventListener('click', function () {
            var btn = document.getElementById('echotrace-btn');
            if (!btn || btn._scanning) return;
            btn._errorMessage = null;
            startScan(btn);
        });
        inner.appendChild(retry);
    }
    card.appendChild(inner);
    document.body.appendChild(card);
}

function showCard(data) {
    var existing = document.getElementById('echotrace-card');
    if (existing) existing.remove();

    var score = parseFloat(data.trust_score);
    if (isNaN(score)) score = 0;

    // Metrics — use explicit null/undefined checks, not || which masks 0
    var totalScanned = (data.metrics != null && data.metrics.total_scanned != null)
        ? data.metrics.total_scanned
        : (data.results ? data.results.length : 0);
    var flaggedResults = EchoTraceUtils.flaggedResults(data.results || []);
    var fakeCount = flaggedResults.length;
    var genuineCount = (data.metrics != null && data.metrics.genuine_detected != null)
        ? data.metrics.genuine_detected
        : (totalScanned - fakeCount);

    // Compute uncertain count from results array
    var uncertainCount = data.results
        ? data.results.filter(function(r) { return getClassificationLabel(r) === 'Uncertain'; }).length
        : 0;
    // Also use server-provided uncertain count if available
    if (data.metrics && data.metrics.uncertain_detected != null) {
        uncertainCount = data.metrics.uncertain_detected;
    }

    var sampleWarning = data.metrics && data.metrics.sample_warning;
    var scoreNote = (data.metrics && data.metrics.score_note) || '';

    var gPct = totalScanned > 0 ? Math.round(genuineCount / totalScanned * 100) : 0;
    var fPct = totalScanned > 0 ? Math.round(fakeCount / totalScanned * 100) : 0;

    var risk = data.overall_risk_level || (score >= 80 ? 'Low Risk' : score >= 50 ? 'Moderate Risk' : 'High Risk');
    var riskColor = risk.toUpperCase().includes('HIGH') ? '#ef4444'
                  : (risk.toUpperCase().includes('MOD') || risk.toUpperCase().includes('MED')) ? '#f59e0b'
                  : '#10b981';
    var scoreColor = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';

    // Root container
    var card = document.createElement('div');
    card.id = 'echotrace-card';
    card.className = 'et-card-anim';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'false');
    card.setAttribute('aria-label', 'EchoTrace Review Analysis');

    var inner = document.createElement('div');
    inner.style.cssText = [
        'position:fixed', 'bottom:100px', 'right:28px', 'width:min(400px,calc(100vw - 32px))',
        'max-height:78vh', 'overflow-y:auto',
        'background:rgba(9,13,22,.97)', 'backdrop-filter:blur(16px)',
        'border:1px solid rgba(255,255,255,.12)', 'border-radius:18px',
        'color:#f3f4f6',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
        'padding:16px', 'z-index:2147483646', 'box-sizing:border-box',
        'box-shadow:0 20px 60px rgba(0,0,0,.8)'
    ].join(';');

    // ─ Header ─
    var header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:10px;margin-bottom:12px;';

    var headerLeft = document.createElement('div');
    headerLeft.style.cssText = 'display:flex;align-items:center;gap:8px;';

    var shieldEmoji = document.createElement('span');
    shieldEmoji.textContent = '🛡️';
    shieldEmoji.style.fontSize = '18px';

    var headerMeta = document.createElement('div');
    var titleDiv = document.createElement('div');
    titleDiv.style.cssText = 'font-weight:800;font-size:13px;color:#10b981;';
    titleDiv.textContent = 'EchoTrace Review Analysis';

    var countDiv = document.createElement('div');
    countDiv.style.cssText = 'font-size:9px;color:#6b7280;';
    countDiv.textContent = totalScanned + ' of ' + (data.reviews_extracted || totalScanned) + ' extracted reviews analyzed';

    headerMeta.appendChild(titleDiv);
    headerMeta.appendChild(countDiv);
    headerLeft.appendChild(shieldEmoji);
    headerLeft.appendChild(headerMeta);

    var headerRight = document.createElement('div');
    headerRight.style.cssText = 'display:flex;align-items:center;gap:8px;';

    var scoreDiv = document.createElement('div');
    scoreDiv.style.cssText = 'text-align:right;';
    var scoreVal = document.createElement('div');
    scoreVal.style.cssText = 'font-weight:900;font-size:18px;color:' + scoreColor + ';';
    scoreVal.textContent = Math.round(score) + '%';
    var riskDiv = document.createElement('div');
    riskDiv.style.cssText = 'font-size:8px;font-weight:800;color:' + riskColor + ';text-transform:uppercase;';
    riskDiv.textContent = risk;
    scoreDiv.appendChild(scoreVal);
    scoreDiv.appendChild(riskDiv);

    var closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:#6b7280;font-size:12px;cursor:pointer;width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', function() { card.remove(); });

    headerRight.appendChild(scoreDiv);
    headerRight.appendChild(closeBtn);
    header.appendChild(headerLeft);
    header.appendChild(headerRight);

    // ─ Trust score caveat ─
    var caveat = document.createElement('div');
    caveat.style.cssText = 'font-size:9px;color:#6b7280;margin-bottom:10px;font-style:italic;line-height:1.4;';
    var caveatText = scoreNote ||
        ('Based on ' + totalScanned + ' of ' + (data.reviews_extracted || totalScanned) + ' extracted review' +
        (totalScanned !== 1 ? 's' : '') + '. Scores reflect model classification only, not verified authenticity.');
    if (sampleWarning) caveatText = '⚠ Small sample — results may not be representative. ' + caveatText;
    caveat.textContent = caveatText;

    // ─ Ratio bar ─
    var ratioBox = document.createElement('div');
    ratioBox.style.cssText = 'background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);border-radius:8px;padding:8px 10px;margin-bottom:12px;';

    var ratioLabels = document.createElement('div');
    ratioLabels.style.cssText = 'display:flex;justify-content:space-between;font-size:9px;font-weight:700;margin-bottom:5px;';
    var genLabel = document.createElement('span');
    genLabel.style.color = '#34d399';
    genLabel.textContent = '✅ Likely Genuine: ' + gPct + '% (' + genuineCount + ')';
    var fakeLabel = document.createElement('span');
    fakeLabel.style.color = '#f87171';
    fakeLabel.textContent = '🚨 Potentially Fake: ' + fPct + '% (' + fakeCount + ')';
    if (uncertainCount > 0) {
        var uncLabel = document.createElement('span');
        uncLabel.style.color = '#fbbf24';
        uncLabel.textContent = '? Uncertain: ' + uncertainCount;
        ratioLabels.appendChild(genLabel);
        ratioLabels.appendChild(uncLabel);
        ratioLabels.appendChild(fakeLabel);
    } else {
        ratioLabels.appendChild(genLabel);
        ratioLabels.appendChild(fakeLabel);
    }

    var ratioBar = document.createElement('div');
    ratioBar.style.cssText = 'height:6px;border-radius:3px;background:rgba(255,255,255,.08);display:flex;overflow:hidden;';
    var fillGen = document.createElement('div');
    fillGen.style.cssText = 'width:' + gPct + '%;background:linear-gradient(90deg,#10b981,#059669);transition:width .8s;';
    var fillFake = document.createElement('div');
    fillFake.style.cssText = 'width:' + fPct + '%;background:linear-gradient(90deg,#f87171,#ef4444);transition:width .8s;';
    ratioBar.appendChild(fillGen);
    ratioBar.appendChild(fillFake);

    ratioBox.appendChild(ratioLabels);
    ratioBox.appendChild(ratioBar);

    // ─ Strengths ─
    var strengthsSection = buildListSection(
        '✅ Key Strengths', '#34d399',
        (data.summary && data.summary.strengths) ? data.summary.strengths : []
    );

    // ─ Weaknesses ─
    var weaknessesSection = buildListSection(
        '⚠️ Risk Flags', '#fbbf24',
        (data.summary && data.summary.weaknesses) ? data.summary.weaknesses : []
    );

    // ─ Flagged reviews ─
    var flaggedSection = buildFlaggedSection(data.results || []);

    // ─ Recommendation ─
    var rec = document.createElement('div');
    if (data.summary && data.summary.recommendation) {
        rec.style.cssText = 'font-size:10px;color:#9ca3af;font-style:italic;border-top:1px solid rgba(255,255,255,.05);padding-top:8px;margin-top:8px;line-height:1.5;';
        rec.textContent = data.summary.recommendation;
    }

    // Assemble
    inner.appendChild(header);
    inner.appendChild(caveat);
    inner.appendChild(ratioBox);
    if (strengthsSection) inner.appendChild(strengthsSection);
    if (weaknessesSection) inner.appendChild(weaknessesSection);
    if (flaggedSection) inner.appendChild(flaggedSection);
    inner.appendChild(rec);

    card.appendChild(inner);
    document.body.appendChild(card);
}

function buildListSection(heading, color, items) {
    if (!items || items.length === 0) return null;
    var section = document.createElement('div');
    section.style.marginBottom = '10px';
    var title = document.createElement('div');
    title.style.cssText = 'font-size:10px;font-weight:700;color:' + color + ';margin-bottom:5px;';
    title.textContent = heading;
    var ul = document.createElement('ul');
    ul.style.cssText = 'list-style:none;margin:0;padding:0;';
    items.forEach(function(item) {
        var li = document.createElement('li');
        li.style.cssText = 'font-size:10px;color:#d1d5db;padding:2px 0 2px 12px;position:relative;line-height:1.5;';
        li.textContent = safeText(item); // textContent — no HTML injection
        ul.appendChild(li);
    });
    section.appendChild(title);
    section.appendChild(ul);
    return section;
}

function buildFlaggedSection(results) {
    var flagged = EchoTraceUtils.flaggedResults(results);

    if (flagged.length === 0) {
        var none = document.createElement('div');
        none.style.cssText = 'border-top:1px solid rgba(255,255,255,.06);padding-top:10px;margin-top:8px;font-size:10px;color:#34d399;';
        none.textContent = 'No reviews in the inspected sample were flagged as potentially fake.';
        return none;
    }

    var section = document.createElement('div');
    section.style.cssText = 'border-top:1px solid rgba(255,255,255,.06);padding-top:10px;margin-top:8px;';

    var heading = document.createElement('div');
    heading.style.cssText = 'font-size:10px;font-weight:700;color:#f87171;margin-bottom:8px;';
    heading.textContent = 'Potentially Fake Reviews (' + flagged.length + ')';
    section.appendChild(heading);

    flagged.forEach(function(r) {
        var item = document.createElement('div');
        item.style.cssText = 'border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:8px;margin-bottom:6px;font-size:11px;';

        var label = getClassificationLabel(r);
        var pFake = Number(r.confidence_score);
        var hasValidConfidence = Number.isFinite(pFake) && pFake >= 0 && pFake <= 100;

        var meta = document.createElement('div');
        meta.style.cssText = 'font-size:9px;font-weight:700;margin-bottom:4px;color:' + (label === 'Potentially Fake' ? '#f87171' : '#fbbf24') + ';';
        meta.textContent = label + (hasValidConfidence ? ' · ' + pFake.toFixed(1) + '% model probability' : '');

        var snippet = document.createElement('div');
        snippet.style.cssText = 'color:#d1d5db;font-style:italic;margin-bottom:5px;line-height:1.4;word-break:break-word;';
        var rawText = r.text || '';
        snippet.textContent = '"' + rawText + '"';

        var reasons = (Array.isArray(r.fake_reasons) ? r.fake_reasons : [])
            .filter(function(reason) { return typeof reason === 'string' && reason.trim(); })
            .slice(0, 2);
        var reasonsDiv = document.createElement('div');
        reasonsDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';
        reasons.forEach(function(reason) {
            var tag = document.createElement('span');
            tag.style.cssText = 'background:rgba(239,68,68,.15);color:#f87171;font-size:8px;font-weight:700;padding:2px 6px;border-radius:4px;border:1px solid rgba(239,68,68,.2);';
            tag.textContent = reason.slice(0, 65);
            reasonsDiv.appendChild(tag);
        });

        item.appendChild(meta);
        item.appendChild(snippet);
        item.appendChild(reasonsDiv);
        section.appendChild(item);
    });

    return section;
}

// Shadow DOM modal keeps EchoTrace presentation isolated from Shopee styles.
function createEchoTraceModal(title) {
    removeEchoTraceModal();

    var host = document.createElement('div');
    host.id = 'echotrace-modal-host';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
    var shadow = host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = [
        ':host{all:initial}',
        '*,*::before,*::after{box-sizing:border-box}',
        '.overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(2,6,23,.58);backdrop-filter:blur(3px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#e5e7eb}',
        '.modal{width:min(560px,100%);max-height:min(72vh,620px);display:flex;flex-direction:column;background:linear-gradient(180deg,#111827 0%,#080d18 100%);border:1px solid rgba(148,163,184,.22);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.62);overflow:hidden}',
        '.header{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:15px 17px;border-bottom:1px solid rgba(148,163,184,.14)}',
        '.brand{display:flex;align-items:center;gap:12px;min-width:0}.shield{width:38px;height:38px;display:grid;place-items:center;border-radius:11px;background:linear-gradient(135deg,#2563eb,#0f766e);color:white;box-shadow:0 8px 24px rgba(37,99,235,.24)}',
        '.eyebrow{font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#60a5fa}.title{margin-top:2px;font-size:18px;font-weight:800;color:#f8fafc;letter-spacing:-.02em}',
        '.close{width:36px;height:36px;display:grid;place-items:center;border:1px solid rgba(148,163,184,.18);border-radius:10px;background:rgba(255,255,255,.04);color:#cbd5e1;font-size:20px;cursor:pointer}',
        '.close:hover{background:rgba(255,255,255,.09);color:white}.close:focus-visible,.retry:focus-visible{outline:3px solid rgba(96,165,250,.8);outline-offset:2px}',
        '.body{padding:15px 17px 17px;overflow:auto}.summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:14px}.metric{padding:10px;border:1px solid rgba(148,163,184,.14);border-radius:11px;background:rgba(255,255,255,.035)}',
        '.metric-label{font-size:9px;line-height:1.3;color:#94a3b8}.metric-value{margin-top:3px;font-size:20px;font-weight:850;color:#f8fafc}.metric.fake .metric-value{color:#f87171}.metric.genuine .metric-value{color:#34d399}',
        '.section-title{font-size:11px;font-weight:800;color:#e2e8f0;margin-bottom:8px}.list{display:grid;gap:8px;max-height:30vh;overflow:auto;padding-right:4px}',
        '.review{padding:11px;border:1px solid rgba(248,113,113,.24);border-radius:11px;background:rgba(127,29,29,.12)}.review-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:7px}.classification{font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.06em;color:#fca5a5}.confidence{font-size:9px;font-weight:700;color:#cbd5e1}',
        '.review-text{font-size:11px;line-height:1.5;color:#f1f5f9;white-space:pre-wrap;overflow-wrap:anywhere}.reason{margin-top:8px;padding-top:8px;border-top:1px solid rgba(248,113,113,.14);font-size:10px;line-height:1.45;color:#cbd5e1}',
        '.empty,.state{padding:30px 20px;text-align:center;border:1px dashed rgba(148,163,184,.22);border-radius:16px;background:rgba(255,255,255,.025)}.empty-title,.state-title{font-size:15px;font-weight:850;color:#f8fafc}.empty-copy,.state-copy{max-width:500px;margin:8px auto 0;font-size:12px;line-height:1.6;color:#94a3b8}.success{color:#34d399}.error{color:#f87171}',
        '.spinner{width:28px;height:28px;margin:0 auto 14px;border:3px solid rgba(52,211,153,.2);border-top-color:#34d399;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}',
        '.modal{animation:etModalIn .25s cubic-bezier(.16,1,.3,1) both}.metric,.review{animation:etCardIn .3s cubic-bezier(.16,1,.3,1) both}.metric:nth-child(2){animation-delay:.05s}.metric:nth-child(3){animation-delay:.1s}.review:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(0,0,0,.2)}@keyframes etModalIn{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}@keyframes etCardIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
        '.retry{margin-top:16px;padding:10px 16px;border:0;border-radius:10px;background:#2563eb;color:white;font-size:12px;font-weight:800;cursor:pointer}.report-footer{display:flex;justify-content:flex-end;margin-top:14px;padding-top:12px;border-top:1px solid rgba(148,163,184,.14)}.full-report{padding:9px 13px;border:1px solid rgba(96,165,250,.35);border-radius:9px;background:#2563eb;color:#fff;font-size:11px;font-weight:850;cursor:pointer}.full-report:hover{background:#1d4ed8}.full-report:focus-visible{outline:3px solid rgba(96,165,250,.8);outline-offset:2px}',
        '@media(max-width:640px){.overlay{padding:12px;align-items:flex-end}.modal{max-height:90vh;border-radius:18px}.header,.body{padding-left:16px;padding-right:16px}.summary{grid-template-columns:1fr}.metric{display:flex;align-items:center;justify-content:space-between}.metric-value{margin:0;font-size:20px}.list{max-height:48vh}}',
        '@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}'
    ].join('');

    var overlay = document.createElement('div');
    overlay.className = 'overlay';
    var modal = document.createElement('section');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'et-shadow-title');
    var header = document.createElement('header');
    header.className = 'header';
    var brand = document.createElement('div');
    brand.className = 'brand';
    var shield = document.createElement('div');
    shield.className = 'shield';
    shield.setAttribute('aria-hidden', 'true');
    shield.textContent = '🛡';
    var titles = document.createElement('div');
    var eyebrow = document.createElement('div');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'EchoTrace Security';
    var heading = document.createElement('div');
    heading.className = 'title';
    heading.id = 'et-shadow-title';
    heading.textContent = title;
    titles.appendChild(eyebrow);
    titles.appendChild(heading);
    brand.appendChild(shield);
    brand.appendChild(titles);
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'close';
    close.setAttribute('aria-label', 'Close EchoTrace results');
    close.textContent = '×';
    var body = document.createElement('main');
    body.className = 'body';
    header.appendChild(brand);
    header.appendChild(close);
    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    shadow.appendChild(style);
    shadow.appendChild(overlay);
    document.body.appendChild(host);

    function closeModal() {
        document.removeEventListener('keydown', onKeyDown, true);
        host.remove();
        var floating = document.getElementById('echotrace-btn');
        if (floating) floating.focus();
    }
    function onKeyDown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeModal();
        } else if (event.key === 'Tab') {
            var focusable = Array.from(shadow.querySelectorAll('button:not([disabled])'));
            if (!focusable.length) return;
            var first = focusable[0];
            var last = focusable[focusable.length - 1];
            if (event.shiftKey && shadow.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && shadow.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    }
    host._closeModal = closeModal;
    close.addEventListener('click', closeModal);
    overlay.addEventListener('click', function(event) {
        if (event.target === overlay) closeModal();
    });
    document.addEventListener('keydown', onKeyDown, true);
    setTimeout(function() { close.focus(); }, 0);
    return { host: host, body: body, shadow: shadow };
}

function removeEchoTraceModal() {
    var host = document.getElementById('echotrace-modal-host');
    if (!host) return;
    if (typeof host._closeModal === 'function') host._closeModal();
    else host.remove();
}

function openAnalysisStateModal(state, message) {
    var isLoading = state === 'loading';
    var noReviews = state === 'no_reviews';
    var shell = createEchoTraceModal(isLoading ? 'Analyzing Reviews...' : 'Review Analysis Results');
    var stateBox = document.createElement('div');
    stateBox.className = 'state';
    if (isLoading) {
        var spinner = document.createElement('div');
        spinner.className = 'spinner';
        spinner.setAttribute('aria-hidden', 'true');
        stateBox.appendChild(spinner);
    }
    var title = document.createElement('div');
    title.className = 'state-title ' + (isLoading ? '' : 'error');
    title.textContent = isLoading ? 'Analyzing Reviews...' :
        (noReviews ? 'No Reviews Available for Analysis' : 'Review Analysis Incomplete');
    var copy = document.createElement('div');
    copy.className = 'state-copy';
    copy.textContent = message;
    stateBox.appendChild(title);
    stateBox.appendChild(copy);
    if (!isLoading) {
        var retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'retry';
        retry.textContent = 'Retry Analysis';
        retry.addEventListener('click', function() {
            var btn = document.getElementById('echotrace-btn');
            if (!btn || btn._scanning) return;
            removeEchoTraceModal();
            btn._errorMessage = null;
            btn._errorState = null;
            startScan(btn);
        });
        stateBox.appendChild(retry);
    }
    shell.body.appendChild(stateBox);
}

function openResultsModal(data) {
    var results = data && Array.isArray(data.results) ? data.results : [];
    if (!results.length) {
        openAnalysisStateModal('no_reviews', 'No successfully analyzed review text was returned for this scan.');
        return;
    }
    var flagged = EchoTraceUtils.flaggedResults(results);
    var genuine = results.filter(function(result) {
        return getClassificationLabel(result) === 'Likely Genuine';
    });
    var uncertain = results.filter(function(result) {
        return getClassificationLabel(result) === 'Uncertain';
    });
    var qualifying = genuine.length + flagged.length;
    var trustEstimate = qualifying > 0
        ? (genuine.length / qualifying * 100).toFixed(1) + '%'
        : 'Insufficient Evidence';
    var shell = createEchoTraceModal('Review Analysis Results');
    var summary = document.createElement('div');
    summary.className = 'summary';
    [
        { label: 'Successfully analyzed', value: results.length, kind: '' },
        { label: 'Potentially fake', value: flagged.length, kind: 'fake' },
        { label: 'Likely genuine', value: genuine.length, kind: 'genuine' },
        { label: 'Uncertain', value: uncertain.length, kind: '' },
        { label: 'Trust estimate', value: trustEstimate, kind: 'genuine' }
    ].forEach(function(metric) {
        var card = document.createElement('div');
        card.className = 'metric ' + metric.kind;
        var label = document.createElement('div');
        label.className = 'metric-label';
        label.textContent = metric.label;
        var value = document.createElement('div');
        value.className = 'metric-value';
        animateResultCount(value, metric.value);
        card.appendChild(label);
        card.appendChild(value);
        summary.appendChild(card);
    });
    shell.body.appendChild(summary);

    if (!flagged.length) {
        var empty = document.createElement('div');
        empty.className = 'empty';
        var emptyTitle = document.createElement('div');
        emptyTitle.className = 'empty-title success';
        emptyTitle.textContent = 'No Potentially Fake Reviews Detected';
        var emptyCopy = document.createElement('div');
        emptyCopy.className = 'empty-copy';
        emptyCopy.textContent = 'None of the successfully analyzed reviews crossed the model threshold for potentially fake content.';
        empty.appendChild(emptyTitle);
        empty.appendChild(emptyCopy);
        shell.body.appendChild(empty);
        appendFullReportButton(shell.body, data);
        return;
    }

    var sectionTitle = document.createElement('div');
    sectionTitle.className = 'section-title';
    sectionTitle.textContent = 'Potentially Fake Reviews';
    var list = document.createElement('div');
    list.className = 'list';
    flagged.forEach(function(result, index) {
        var review = document.createElement('article');
        review.className = 'review';
        review.style.animationDelay = Math.min(index, 6) * 45 + 'ms';
        var meta = document.createElement('div');
        meta.className = 'review-meta';
        var classification = document.createElement('span');
        classification.className = 'classification';
        classification.textContent = 'Potentially Fake';
        meta.appendChild(classification);
        var probability = Number(result.confidence_score);
        if (Number.isFinite(probability) && probability >= 0 && probability <= 100) {
            var confidence = document.createElement('span');
            confidence.className = 'confidence';
            confidence.textContent = probability.toFixed(1) + '% model probability';
            meta.appendChild(confidence);
        }
        var text = document.createElement('div');
        text.className = 'review-text';
        text.textContent = String(result.text || '');
        review.appendChild(meta);
        review.appendChild(text);
        var reasons = Array.isArray(result.fake_reasons) ? result.fake_reasons.filter(function(reason) {
            return typeof reason === 'string' && reason.trim();
        }) : [];
        if (reasons.length) {
            var reason = document.createElement('div');
            reason.className = 'reason';
            reason.textContent = reasons.slice(0, 2).join(' · ');
            review.appendChild(reason);
        }
        list.appendChild(review);
    });
    shell.body.appendChild(sectionTitle);
    shell.body.appendChild(list);
    appendFullReportButton(shell.body, data);
}

function animateResultCount(element, rawValue) {
    var target = Number(rawValue);
    if (!Number.isFinite(target) || target < 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        element.textContent = String(rawValue);
        return;
    }
    var started = null;
    function frame(now) {
        if (!started) started = now;
        var progress = Math.min((now - started) / 300, 1);
        element.textContent = String(Math.round(target * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

function appendFullReportButton(container, data) {
    var footer = document.createElement('div');
    footer.className = 'report-footer';
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'full-report';
    button.textContent = 'View Full Report';
    button.setAttribute('aria-label', 'View full EchoTrace report');
    button.addEventListener('click', function() {
        button.disabled = true;
        button.textContent = 'Opening Dashboard…';
        safeRuntimeSendMessage({
            action: 'OPEN_FULL_REPORT',
            scan_id: data && data.scan_id != null ? data.scan_id : null
        }, function(response, runtimeError) {
            button.disabled = false;
            if (runtimeError || !response || !response.success) {
                button.textContent = 'Unable to Open Report';
            } else {
                button.textContent = 'Dashboard Opened';
                setTimeout(function() { if (button.isConnected) button.textContent = 'View Full Report'; }, 1200);
            }
        });
    });
    footer.appendChild(button);
    container.appendChild(footer);
}

// ── Empty state (no reviews found) ───────────────────────────────────────────

function showEmptyState(platform, site, extractionFailed) {
    var old = document.getElementById('echotrace-empty');
    if (old) old.remove();

    var el = document.createElement('div');
    el.id = 'echotrace-empty';
    el.className = 'et-card-anim';

    var inner = document.createElement('div');
    inner.style.cssText = [
        'position:fixed', 'bottom:85px', 'right:28px', 'width:300px',
        'background:rgba(9,13,22,.97)', 'backdrop-filter:blur(12px)',
        'border:1px solid rgba(245,158,11,.3)', 'border-radius:14px',
        'color:#f3f4f6',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
        'padding:14px', 'z-index:2147483646', 'box-sizing:border-box',
        'font-size:12px'
    ].join(';');

    var icon = document.createElement('div');
    icon.style.cssText = 'font-size:20px;margin-bottom:6px;';
    icon.textContent = '📭';

    var title = document.createElement('div');
    title.style.cssText = 'font-weight:700;color:#fbbf24;margin-bottom:6px;';
    title.textContent = 'No reviews found on this page';

    var msg = document.createElement('div');
    msg.style.cssText = 'color:#9ca3af;line-height:1.5;font-size:11px;';

    var messages = {
        shopee: extractionFailed
            ? 'Reviews are visible on the page but could not be extracted — Shopee may have updated their layout. Check the browser console for "[EchoTrace][Shopee]" diagnostic logs.'
            : 'Scroll down to load reviews first, then scan again. Shopee loads reviews dynamically.',
        lazada: 'Make sure you are on a product page and reviews have loaded. Try scrolling to the review section.',
        amazon: 'Scroll down to the customer reviews section and try scanning again.',
        tiktokshop: 'Make sure you are on a TikTok Shop product page and the review tab is visible.',
        generic: 'No customer reviews found. Ensure the product page displays accessible customer reviews.'
    };
    msg.textContent = messages[site] || messages[platform] || 'No customer review text was found in the page at this time.';

    var dismiss = document.createElement('div');
    dismiss.style.cssText = 'font-size:9px;color:#4b5563;margin-top:8px;text-align:right;cursor:pointer;';
    dismiss.textContent = 'Dismiss';
    dismiss.addEventListener('click', function() { el.remove(); });

    inner.appendChild(icon);
    inner.appendChild(title);
    inner.appendChild(msg);
    inner.appendChild(dismiss);
    el.appendChild(inner);
    document.body.appendChild(el);
    setTimeout(function() { if (el.parentNode) el.remove(); }, 8000);
}

// ── Login prompt ──────────────────────────────────────────────────────────────

function showLoginPrompt() {
    var id = 'echotrace-login-prompt';
    var old = document.getElementById(id);
    if (old) old.remove();

    var el = document.createElement('div');
    el.id = id;
    el.className = 'et-card-anim';

    var inner = document.createElement('div');
    inner.style.cssText = [
        'position:fixed', 'bottom:90px', 'right:28px', 'width:270px',
        'background:rgba(9,13,22,.97)', 'backdrop-filter:blur(12px)',
        'border:1px solid rgba(245,158,11,.25)', 'border-radius:14px',
        'color:#fff',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
        'padding:14px', 'z-index:2147483647', 'font-size:12px'
    ].join(';');

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
    var lockIcon = document.createElement('span');
    lockIcon.style.fontSize = '18px';
    lockIcon.textContent = '🔒';
    var lockTitle = document.createElement('span');
    lockTitle.style.cssText = 'font-weight:700;color:#fbbf24;';
    lockTitle.textContent = 'Login Required';
    row.appendChild(lockIcon);
    row.appendChild(lockTitle);

    var p = document.createElement('p');
    p.style.cssText = 'color:#d1d5db;line-height:1.5;margin:0 0 8px;font-size:11px;';
    p.textContent = 'Click the EchoTrace icon in your toolbar and sign in to start scanning.';

    var timer = document.createElement('div');
    timer.style.cssText = 'font-size:9px;color:#6b7280;text-align:center;';
    timer.textContent = 'Auto-dismisses in 5 seconds';

    inner.appendChild(row);
    inner.appendChild(p);
    inner.appendChild(timer);
    el.appendChild(inner);
    document.body.appendChild(el);
    setTimeout(function() { if (el.parentNode) el.remove(); }, 5000);
}

// ── Message listener ──────────────────────────────────────────────────────────

function handleEchoTraceMessage(msg, _sender, sendResponse) {
    if (msg.action === 'TRIGGER_SCAN') {
        var btn = document.getElementById('echotrace-btn');
        if (!btn || !isProductPage()) {
            sendResponse({ success: false, error: 'Not a product page' });
            return;
        }
        if (msg.target) {
            window.__echoTraceConfiguredTarget = parseInt(msg.target, 10);
        }
        safeStorageGet(['auth_token', 'review_target'], function(items, error) {
            if (error) return;
            if (!items || !items.auth_token) {
                showLoginPrompt();
                sendResponse({ success: false, error: 'Not logged in' });
                return;
            }
            var target = msg.target || items.review_target || 10;
            startScan(btn, target);
            sendResponse({ success: true });
        });
        return true;
    }

    if (msg.action === 'CANCEL_SCAN') {
        window.__echoTraceScanCancelled = true;
        var btn = document.getElementById('echotrace-btn');
        if (btn) {
            btn._scanning = false;
            setBtn(btn, 'ready');
        }
        removeEchoTraceModal();
        sendResponse({ success: true, cancelled: true });
        return true;
    }

    if (msg.action === 'OPEN_RESULTS_MODAL') {
        var btn = document.getElementById('echotrace-btn');
        if (btn && btn._result) {
            openResultsModal(btn._result);
            sendResponse({ success: true });
        } else {
            safeStorageGet(['last_scan_result'], function(items) {
                if (items && items.last_scan_result) {
                    openResultsModal(items.last_scan_result);
                    sendResponse({ success: true });
                } else {
                    sendResponse({ success: false, error: 'No recent scan result found' });
                }
            });
        }
        return true;
    }

    if (msg.action === 'GET_REVIEWS') {
        var extracted = scrapeProductData();
        sendResponse({ success: true, data: extracted });
        return true;
    }

    if (msg.action === 'EXTRACT_VISIBLE_REVIEWS') {
        if (!isProductPage()) {
            sendResponse({ success: false, error: 'The selected tab is not a supported product page.' });
            return true;
        }
        if (msg.target) {
            window.__echoTraceConfiguredTarget = parseInt(msg.target, 10);
        }
        waitForReviews(getSite(), null, function(data) {
            sendResponse({ success: true, data: data });
        });
        return true;
    }
}

try {
    if (isExtensionContextValid()) chrome.runtime.onMessage.addListener(handleEchoTraceMessage);
} catch (_error) {
    disposeInvalidExtensionContext();
}

// ── Init ──────────────────────────────────────────────────────────────────────

(function init() {
    if (!isExtensionContextValid()) return;
    // Inject button after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectFloatingButton);
    } else {
        injectFloatingButton();
    }

    // SPA navigation: poll href instead of observing body mutations
    // Observing body subtree on Shopee fires thousands of times and removes injected elements
    var lastUrl = location.href;
    echoTraceIntervalIds.push(setInterval(function() {
        if (!isExtensionContextValid()) {
            disposeInvalidExtensionContext();
            return;
        }
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            var oldBtn = document.getElementById('echotrace-btn');
            if (oldBtn) oldBtn.remove();
            var oldCard = document.getElementById('echotrace-card');
            if (oldCard) oldCard.remove();
            removeEchoTraceModal();
            // Wait for SPA page to settle before injecting
            if (echoTraceNavigationTimeout) clearTimeout(echoTraceNavigationTimeout);
            echoTraceNavigationTimeout = setTimeout(function() {
                echoTraceNavigationTimeout = null;
                injectFloatingButton();
            }, 1800);
        }
    }, 800));

    // Safety net: if Shopee removes the button from DOM, re-inject it
    echoTraceIntervalIds.push(setInterval(function() {
        if (!isExtensionContextValid()) {
            disposeInvalidExtensionContext();
            return;
        }
        if (!document.getElementById('echotrace-btn')) {
            injectFloatingButton();
        }
    }, 3000));
}());
