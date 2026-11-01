<?php

require_once __DIR__ . '/../backend/services/ReviewExtractor.php';

$extractor = new ReviewExtractor();

$blocked = $extractor->validateProductUrl('https://127.0.0.1/product/1', false);
if (($blocked['success'] ?? true) !== false) throw new RuntimeException('Direct IP SSRF validation failed.');

$unsupported = $extractor->validateProductUrl('https://example.com/product/1', false);
if (($unsupported['success'] ?? true) !== false) throw new RuntimeException('Unsupported host validation failed.');

$supported = $extractor->validateProductUrl('https://shopee.ph/product/123/456', false);
if (($supported['success'] ?? false) !== true || $supported['platform'] !== 'shopee') throw new RuntimeException('Supported host validation failed.');

$tiktok = $extractor->validateProductUrl('https://shop.tiktok.com/view/product/1234567890123456789?source=echotrace', false);
if (($tiktok['success'] ?? false) !== true || $tiktok['platform'] !== 'tiktokshop') throw new RuntimeException('TikTok Shop host validation failed.');

$registry = new MarketplaceAdapterRegistry();
foreach (['shopee', 'lazada', 'amazon', 'ebay', 'aliexpress', 'walmart', 'tiktokshop', 'shopify', 'woocommerce'] as $adapterName) {
    $adapter = $registry->forPlatform($adapterName);
    if (!$adapter || $adapter->platform() !== $adapterName || !$adapter->markupSelectors() || !$adapter->textSelectors()) {
        throw new RuntimeException('Marketplace adapter configuration failed for ' . $adapterName . '.');
    }
}
putenv('ECHOTRACE_SHOPIFY_HOSTS=store.example.test');
putenv('ECHOTRACE_WOOCOMMERCE_HOSTS=woo.example.test');
$configuredRegistry = new MarketplaceAdapterRegistry();
if ($configuredRegistry->detectPlatform('store.example.test') !== 'shopify' || $configuredRegistry->detectPlatform('woo.example.test') !== 'woocommerce') {
    throw new RuntimeException('Configured store adapter detection failed.');
}
putenv('ECHOTRACE_SHOPIFY_HOSTS');
putenv('ECHOTRACE_WOOCOMMERCE_HOSTS');

$redirectMethod = new ReflectionMethod(ReviewExtractor::class, 'resolveRedirectUrl');
$redirectMethod->setAccessible(true);
$queryRedirect = $redirectMethod->invoke($extractor, 'https://shopee.ph/item/123?old=1', '?new=2');
if ($queryRedirect !== 'https://shopee.ph/item/123?new=2') throw new RuntimeException('Query redirect resolution failed.');
$unsafeRedirect = $redirectMethod->invoke($extractor, 'https://shopee.ph/item/123', 'http://127.0.0.1/private');
if ($unsafeRedirect !== 'http://127.0.0.1/private') throw new RuntimeException('Redirect normalization failed.');
if (($extractor->validateProductUrl($unsafeRedirect, false)['success'] ?? true) !== false) throw new RuntimeException('Unsafe redirect validation failed.');

$longShopee = $extractor->extractFromHtml('', 'https://shopee.ph/XLarge-17inch-size-17inch-Unisex-Cotton-Fashion-Backpack-Waterproof-i.123456.789?utm_source=test&itemid=789', 'shopee');
if ($longShopee['external_id'] !== '123456-789') throw new RuntimeException('Long Shopee URL ID parsing failed.');

$html = file_get_contents(__DIR__ . '/fixtures/shopee-visible-reviews.html');
$parsed = $extractor->extractFromHtml($html, 'https://shopee.ph/product/123/456', 'shopee');
if (count($parsed['reviews']) !== 2) throw new RuntimeException('Expected two real fixture reviews.');
if ($parsed['reviews'][0]['text'] !== 'Maganda ang quality at maayos ang tahi.') throw new RuntimeException('Review text parsing failed.');
if (floatval($parsed['reviews'][0]['rating']) !== 5.0) throw new RuntimeException('Review rating parsing failed.');

$summaryOnly = file_get_contents(__DIR__ . '/fixtures/shopee-rating-summary-only.html');
$summaryParsed = $extractor->extractFromHtml($summaryOnly, 'https://shopee.ph/product/123/456', 'shopee');
if (count($summaryParsed['reviews']) !== 0) throw new RuntimeException('Rating summary was incorrectly treated as customer reviews.');

$tiktokHtml = '<div data-e2e="comment-item"><span data-e2e="comment-content">A real TikTok Shop customer review.</span></div>';
$tiktokParsed = $extractor->extractFromHtml($tiktokHtml, 'https://shop.tiktok.com/view/product/1234567890123456789', 'tiktokshop');
if (count($tiktokParsed['reviews']) !== 1 || $tiktokParsed['reviews'][0]['text'] !== 'A real TikTok Shop customer review.') throw new RuntimeException('TikTok Shop review parsing failed.');

$jsonLd = '<script type="application/ld+json">' . json_encode([
    '@type' => 'Product',
    'name' => 'Structured Product',
    'sku' => 'SKU-1',
    'review' => [
        ['@type' => 'Review', '@id' => 'r1', 'reviewBody' => 'A real structured customer review.', 'author' => ['name' => 'Buyer'], 'reviewRating' => ['ratingValue' => 4]],
        ['@type' => 'Review', '@id' => 'r2', 'reviewBody' => 'A real structured customer review.', 'author' => ['name' => 'Buyer'], 'reviewRating' => ['ratingValue' => 4]],
    ],
]) . '</script>';
$deduplicated = $extractor->extractFromHtml($jsonLd, 'https://amazon.com/dp/B012345678', 'amazon');
if (count($deduplicated['reviews']) !== 1) throw new RuntimeException('Review deduplication failed.');

echo "Review extractor tests passed.\n";
