// frontend/js/review-parser.js
/**
 * EchoTrace - Review Parser Engine
 * Handles splitting pasted customer reviews from ecommerce platforms (Shopee, Lazada, Amazon, TikTok Shop, etc.)
 * Supports:
 *  - Blank-line-separated reviews (\n\n+)
 *  - Numbered reviews (e.g., 1. / 1) / [1] / #1)
 *  - Labeled reviews (e.g., "Review 1:", "Customer 2:", "Review:", "Buyer:")
 *  - Whitespace normalization and duplicate detection
 */

const EchoTraceReviewParser = (() => {
    /**
     * Splits raw text input into individual review candidates.
     * @param {string} rawText
     * @returns {Array<{ text: string, originalIndex: number, label?: string }>}
     */
    const parse = (rawText) => {
        if (!rawText || typeof rawText !== 'string') {
            return {
                reviews: [],
                totalDetected: 0,
                validReviews: [],
                duplicateCount: 0,
                invalidCount: 0
            };
        }

        const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        let candidates = [];

        // Check if input uses explicit "Review X:" or "Review:" or numbered lines as boundaries
        const labeledPattern = /(?:^|\n+)(?=(?:Review\s*\d*[:.-]|Customer\s*\d*[:.-]|Buyer\s*\d*[:.-]|Feedback\s*\d*[:.-]|\b\d+[\.\)\:-]\s+))/i;

        if (labeledPattern.test(normalized)) {
            // Split by labeled / numbered headings
            const rawChunks = normalized.split(labeledPattern);
            for (let chunk of rawChunks) {
                const trimmed = chunk.trim();
                if (trimmed) {
                    candidates.push(trimmed);
                }
            }
        }

        // If split didn't yield multiple or didn't match labeled pattern, split by 1 or more blank lines
        if (candidates.length <= 1) {
            const blankLineChunks = normalized.split(/\n{2,}/);
            if (blankLineChunks.length > 1) {
                candidates = blankLineChunks.map(c => c.trim()).filter(Boolean);
            } else if (candidates.length === 0 && normalized.trim()) {
                candidates = [normalized.trim()];
            }
        }

        // If still only 1 candidate, check for line-by-line numbering if lines are distinct
        if (candidates.length === 1) {
            const lines = candidates[0].split('\n').map(l => l.trim()).filter(Boolean);
            const numberedLines = lines.filter(l => /^(?:\d+[\.\)\:-]|Review\s*\d*[:.-])/i.test(l));
            if (numberedLines.length > 1 && numberedLines.length === lines.length) {
                candidates = lines;
            }
        }

        const validReviews = [];
        const seenFingerprints = new Set();
        let duplicateCount = 0;
        let invalidCount = 0;

        candidates.forEach((chunk, index) => {
            // Strip leading label prefixes like "Review 1:", "[1]", "1.", "Buyer 1 -"
            let cleanText = chunk.replace(/^(?:(?:Review|Customer|Buyer|Feedback)\s*\d*[:.-]?|\d+[\.\)\:-]|\[\d+\]|\#\d+)[:.-]?\s*/i, '').trim();

            // If empty after stripping, check original
            if (!cleanText && chunk.trim()) {
                cleanText = chunk.trim();
            }

            if (!cleanText || cleanText.length < 2) {
                invalidCount++;
                return;
            }

            // Fingerprint for duplicate detection
            const fingerprint = cleanText.toLowerCase().replace(/\s+/g, ' ');
            if (seenFingerprints.has(fingerprint)) {
                duplicateCount++;
                return;
            }
            seenFingerprints.add(fingerprint);

            validReviews.push({
                id: `paste-${index + 1}`,
                text: cleanText,
                author: `Pasted Review #${validReviews.length + 1}`,
                rating: null,
                selected: true
            });
        });

        return {
            totalDetected: candidates.length,
            validReviews,
            duplicateCount,
            invalidCount
        };
    };

    return {
        parse
    };
})();

if (typeof window !== 'undefined') {
    window.EchoTraceReviewParser = EchoTraceReviewParser;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EchoTraceReviewParser;
}

