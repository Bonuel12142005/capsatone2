(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.EchoTraceUtils = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function normalizeText(value) {
        return String(value || '').replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
            .replace(/\s+/g, ' ').trim();
    }

    function deduplicateReviews(reviews) {
        var seen = new Set();
        var output = [];
        var duplicatesRemoved = 0;
        (Array.isArray(reviews) ? reviews : []).forEach(function (review) {
            var text = normalizeText(review && review.text);
            if (!text) return;
            var key = text.toLocaleLowerCase().slice(0, 500);
            if (seen.has(key)) { duplicatesRemoved++; return; }
            seen.add(key);
            output.push(Object.assign({}, review, { text: text }));
        });
        return { reviews: output, duplicatesRemoved: duplicatesRemoved };
    }

    function classificationLabel(result) {
        var probability = Number(result && result.confidence_score);
        if (!Number.isFinite(probability) || (probability >= 40 && probability <= 60)) return 'Uncertain';
        return result && (result.is_fake === true || result.is_fake === 1 || result.is_fake === '1')
            ? 'Potentially Fake' : 'Likely Genuine';
    }

    function flaggedResults(results) {
        return (Array.isArray(results) ? results : []).filter(function (result) {
            return classificationLabel(result) === 'Potentially Fake';
        });
    }

    return { normalizeText: normalizeText, deduplicateReviews: deduplicateReviews,
        classificationLabel: classificationLabel, flaggedResults: flaggedResults };
}));
