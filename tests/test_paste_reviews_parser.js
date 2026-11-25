// tests/test_paste_reviews_parser.js
const assert = require('assert');

// Mock window environment for review-parser.js
const mockWindow = {};
global.window = mockWindow;

// Load the review parser
require('../frontend/js/review-parser.js');
const parser = mockWindow.EchoTraceReviewParser;

console.log('--- Testing EchoTraceReviewParser ---');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
    try {
        fn();
        console.log(`  PASS: ${name}`);
        passed++;
    } catch (err) {
        console.error(`  FAIL: ${name}`);
        console.error(`    ${err.message}`);
        failed++;
    }
}

// 1. Empty input
runTest('Empty input returns zero counts', () => {
    const res = parser.parse('');
    assert.strictEqual(res.totalDetected, 0);
    assert.strictEqual(res.validReviews.length, 0);
    assert.strictEqual(res.duplicateCount, 0);
    assert.strictEqual(res.invalidCount, 0);
});

// 2. Single review
runTest('Single review parsed correctly', () => {
    const res = parser.parse('The product arrived quickly and works perfectly.');
    assert.strictEqual(res.validReviews.length, 1);
    assert.strictEqual(res.validReviews[0].text, 'The product arrived quickly and works perfectly.');
    assert.strictEqual(res.duplicateCount, 0);
});

// 3. Blank-line separated reviews
runTest('Blank-line separated reviews', () => {
    const input = `The product arrived quickly and works perfectly.

Very bad quality. The seller did not respond.

Good product, worth the price.`;
    const res = parser.parse(input);
    assert.strictEqual(res.validReviews.length, 3);
    assert.strictEqual(res.validReviews[0].text, 'The product arrived quickly and works perfectly.');
    assert.strictEqual(res.validReviews[1].text, 'Very bad quality. The seller did not respond.');
    assert.strictEqual(res.validReviews[2].text, 'Good product, worth the price.');
});

// 4. Numbered reviews (1., 2., 3.)
runTest('Numbered reviews (1., 2., 3.)', () => {
    const input = `1. The product arrived quickly and works perfectly.
2. Very bad quality. The seller did not respond.
3. Good product, worth the price.`;
    const res = parser.parse(input);
    assert.strictEqual(res.validReviews.length, 3);
    assert.strictEqual(res.validReviews[0].text, 'The product arrived quickly and works perfectly.');
    assert.strictEqual(res.validReviews[1].text, 'Very bad quality. The seller did not respond.');
    assert.strictEqual(res.validReviews[2].text, 'Good product, worth the price.');
});

// 5. Labeled reviews (Review 1:, Customer 2:, Buyer 3:)
runTest('Labeled reviews with prefixes', () => {
    const input = `Review 1: The product arrived quickly and works perfectly.
Review 2: Very bad quality. The seller did not respond.
Review 3: Good product, worth the price.`;
    const res = parser.parse(input);
    assert.strictEqual(res.validReviews.length, 3);
    assert.strictEqual(res.validReviews[0].text, 'The product arrived quickly and works perfectly.');
    assert.strictEqual(res.validReviews[1].text, 'Very bad quality. The seller did not respond.');
    assert.strictEqual(res.validReviews[2].text, 'Good product, worth the price.');
});

// 6. Duplicate detection
runTest('Duplicate reviews detected and counted', () => {
    const input = `The product arrived quickly and works perfectly.

The product arrived quickly and works perfectly.

Good product, worth the price.`;
    const res = parser.parse(input);
    assert.strictEqual(res.validReviews.length, 2);
    assert.strictEqual(res.duplicateCount, 1);
});

// 7. Case-insensitive and whitespace-tolerant duplicate detection
runTest('Case-insensitive duplicate detection', () => {
    const input = `The product arrived quickly and works perfectly.

the product arrived quickly   and works perfectly.

Good product, worth the price.`;
    const res = parser.parse(input);
    assert.strictEqual(res.validReviews.length, 2);
    assert.strictEqual(res.duplicateCount, 1);
});

// 8. Too-short / invalid review rejection
runTest('Too-short review rejected (less than 2 chars)', () => {
    const input = `k

The product arrived quickly and works perfectly.

a`;
    const res = parser.parse(input);
    assert.strictEqual(res.validReviews.length, 1);
    assert.strictEqual(res.invalidCount, 2);
});

// 9. Extra blank lines and whitespace trimmed
runTest('Extra whitespace and blank lines handled gracefully', () => {
    const input = `   

  The product arrived quickly and works perfectly.   

     
  Good product, worth the price.  
  
`;
    const res = parser.parse(input);
    assert.strictEqual(res.validReviews.length, 2);
    assert.strictEqual(res.validReviews[0].text, 'The product arrived quickly and works perfectly.');
    assert.strictEqual(res.validReviews[1].text, 'Good product, worth the price.');
});

// 10. Multi-line reviews separated by multiple newlines
runTest('Multi-line reviews with internal single newlines preserved', () => {
    const input = `Review 1:
Item arrived on time.
Packaging was neat.

Review 2:
Quality could be better.
Broke after two days.`;
    const res = parser.parse(input);
    assert.strictEqual(res.validReviews.length, 2);
    assert.ok(res.validReviews[0].text.includes('Item arrived on time.'));
    assert.ok(res.validReviews[1].text.includes('Quality could be better.'));
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
