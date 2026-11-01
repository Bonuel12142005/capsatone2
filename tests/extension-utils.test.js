'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const utils = require('../chrome_extension/scripts/review-utils.js');

test('normalizes and removes duplicate or empty reviews', () => {
    const result = utils.deduplicateReviews([
        { id: 'a', text: '  Maganda   ang quality  ' },
        { id: 'b', text: 'maganda ang quality' },
        { id: 'c', text: '' },
        { id: 'd', text: 'Arrived on time and works well.' }
    ]);
    assert.equal(result.reviews.length, 2);
    assert.equal(result.duplicatesRemoved, 1);
    assert.equal(result.reviews[0].id, 'a');
});

test('maps labels without reversing fake probability semantics', () => {
    assert.equal(utils.classificationLabel({ is_fake: 1, confidence_score: 82 }), 'Potentially Fake');
    assert.equal(utils.classificationLabel({ is_fake: 0, confidence_score: 18 }), 'Likely Genuine');
    assert.equal(utils.classificationLabel({ is_fake: 1, confidence_score: 52 }), 'Uncertain');
    assert.equal(utils.classificationLabel({ is_fake: 0 }), 'Uncertain');
});

test('primary flagged results exclude genuine and uncertain predictions', () => {
    const flagged = utils.flaggedResults([
        { id: 1, is_fake: 1, confidence_score: 85 },
        { id: 2, is_fake: 0, confidence_score: 12 },
        { id: 3, is_fake: 1, confidence_score: 55 }
    ]);
    assert.deepEqual(flagged.map((item) => item.id), [1]);
});
