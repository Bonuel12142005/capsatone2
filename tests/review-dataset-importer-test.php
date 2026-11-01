<?php
declare(strict_types=1);

require_once __DIR__ . '/../backend/services/ReviewDatasetImporter.php';

$importer = new ReviewDatasetImporter();
$fixture = __DIR__ . '/fixtures/review-dataset.csv';
$result = $importer->parseFilePath($fixture, 'review-dataset.csv');

if (!$result['success']) throw new RuntimeException($result['error'] ?? 'CSV import failed.');
if ($result['format'] !== 'csv') throw new RuntimeException('CSV format was not detected.');
if ($result['total_valid'] !== 2) throw new RuntimeException('Expected duplicate removal to leave two reviews.');
if ($result['duplicates_removed'] !== 1) throw new RuntimeException('Expected one duplicate review to be removed.');
if (count($result['reviews']) !== 2) throw new RuntimeException('Expected two normalized reviews.');
if ($result['reviews'][0]['author'] !== 'Ana') throw new RuntimeException('Author mapping failed.');

$mapped = $importer->parseFilePath($fixture, 'review-dataset.csv', ['text' => 'review_text', 'rating' => 'rating']);
if (!$mapped['success'] || $mapped['reviews'][1]['rating'] !== 2.0) throw new RuntimeException('Explicit column mapping failed.');

$invalid = $importer->parseFilePath($fixture, 'reviews.txt');
if ($invalid['success'] || $invalid['error_code'] !== 'invalid_review_file') throw new RuntimeException('Unsupported file type was accepted.');

echo "review-dataset-importer-test: PASS\n";
