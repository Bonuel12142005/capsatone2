<?php

require_once __DIR__ . '/marketplaces/MarketplaceAdapterRegistry.php';

/**
 * Retrieves reviews that are already present in a marketplace's public HTML.
 * It never invents reviews and deliberately does not bypass authentication,
 * CAPTCHAs, robots challenges, or platform access controls.
 */
class ReviewExtractor
{
    private const MAX_RESPONSE_BYTES = 5_242_880;
    private const MAX_REVIEWS = 100;
    private const MAX_REDIRECTS = 3;
    private const CONNECT_TIMEOUT_SECONDS = 8;
    private const REQUEST_TIMEOUT_SECONDS = 25;

    private MarketplaceAdapterRegistry $registry;
    private string $correlationId;

    public function __construct()
    {
        $this->registry = new MarketplaceAdapterRegistry();
        $this->correlationId = $this->newCorrelationId();
    }

    public function validateProductUrl(string $url, bool $resolveDns = true): array
    {
        $url = trim($url);
        if ($url === '' || strlen($url) > 2048 || !filter_var($url, FILTER_VALIDATE_URL)) {
            $this->logDiagnostic('url_rejected', ['reason' => 'invalid_url', 'length' => strlen($url)]);
            return ['success' => false, 'status' => 422, 'error' => 'Enter a valid HTTPS product URL.'];
        }

        $parts = parse_url($url);
        $scheme = strtolower((string)($parts['scheme'] ?? ''));
        $host = strtolower(rtrim((string)($parts['host'] ?? ''), '.'));
        $port = isset($parts['port']) ? intval($parts['port']) : 443;
        if ($scheme !== 'https' || $host === '' || $port !== 443 || isset($parts['user']) || isset($parts['pass'])) {
            $this->logDiagnostic('url_rejected', ['reason' => 'unsafe_scheme_or_authority', 'host' => $host, 'scheme' => $scheme, 'port' => $port]);
            return ['success' => false, 'status' => 422, 'error' => 'Only public HTTPS product URLs on the standard HTTPS port are allowed.'];
        }
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            $this->logDiagnostic('url_rejected', ['reason' => 'ip_literal', 'host' => $host]);
            return ['success' => false, 'status' => 422, 'error' => 'Direct IP addresses are not allowed.'];
        }

        $platform = $this->platformForHost($host);
        if ($platform === null) {
            $this->logDiagnostic('url_rejected', ['reason' => 'unsupported_host', 'host' => $host]);
            return ['success' => false, 'status' => 422, 'error' => 'Use a supported marketplace URL: ' . $this->registry->labels() . '.'];
        }

        $addresses = [];
        if ($resolveDns) {
            $addresses = $this->resolvePublicAddresses($host);
            if (!$addresses) {
                return $this->failure('dns_failure', 503, 'The marketplace host could not be resolved to a public address. No scan was saved.', ['host' => $host, 'platform' => $platform]);
            }
        }

        return [
            'success' => true,
            'platform' => $platform,
            'url' => $this->normalizeUrl($url),
            'host' => $host,
            'addresses' => $addresses,
        ];
    }

    public function extract(string $url): array
    {
        $this->correlationId = $this->newCorrelationId();
        $this->logDiagnostic('extraction_start', ['url_fingerprint' => $this->urlFingerprint(trim($url))]);
        $validated = $this->validateProductUrl($url, true);
        if (!$validated['success']) return $validated;

        $currentUrl = $validated['url'];
        $platform = $validated['platform'];
        $response = null;

        $cached = $this->readReviewCache($currentUrl, $platform);
        if ($cached !== null) {
            $this->logDiagnostic('reviews_cache_hit', ['platform' => $platform, 'review_count' => count($cached['reviews'] ?? [])]);
            return array_merge(['success' => true, 'source' => 'public_product_page_cache'], $cached);
        }

        for ($redirects = 0; $redirects <= self::MAX_REDIRECTS; $redirects++) {
            $target = $redirects === 0
                ? $validated
                : $this->validateProductUrl($currentUrl, true);
            if (!$target['success'] || $target['platform'] !== $platform) {
                return $this->failure('unsafe_redirect', 502, 'The marketplace redirected to an unapproved or non-HTTPS destination. No scan was saved.', ['platform' => $platform, 'redirect_count' => $redirects]);
            }

            $this->logDiagnostic('fetch_start', ['platform' => $platform, 'host' => $target['host'], 'redirect_count' => $redirects, 'url_fingerprint' => $this->urlFingerprint($currentUrl)]);
            $response = $this->fetchOnce($target);
            if (!$response['success']) {
                $response['platform'] = $platform;
                return $response;
            }

            if ($response['status'] >= 300 && $response['status'] < 400 && $response['location'] !== '') {
                $redirectUrl = $this->resolveRedirectUrl($currentUrl, $response['location']);
                $redirectParts = $redirectUrl !== '' ? parse_url($redirectUrl) : false;
                $this->logDiagnostic('redirect', [
                    'platform' => $platform,
                    'from_host' => $target['host'],
                    'to_host' => is_array($redirectParts) ? strtolower((string)($redirectParts['host'] ?? '')) : '',
                    'to_scheme' => is_array($redirectParts) ? strtolower((string)($redirectParts['scheme'] ?? '')) : '',
                    'redirect_count' => $redirects + 1,
                ]);
                if ($redirectUrl === '') {
                    return $this->failure('unsafe_redirect', 502, 'The marketplace returned an unsafe redirect. Only approved HTTPS destinations are allowed. No scan was saved.', ['platform' => $platform]);
                }
                $currentUrl = $redirectUrl;
                continue;
            }
            break;
        }

        if (!$response || ($response['status'] >= 300 && $response['status'] < 400)) {
            return $this->failure('redirect_limit', 502, 'The marketplace redirected too many times. No scan was saved.', ['platform' => $platform]);
        }
        if (in_array($response['status'], [401, 403, 429], true)) {
            $upstreamCode = $response['status'] === 429 ? 'rate_limited' : 'forbidden_access';
            return ['success' => false, 'status' => 502, 'platform' => $platform, 'error_code' => $upstreamCode, 'diagnostic_id' => $this->correlationId, 'error' => $this->blockedMessage($platform, $response['status'])];
        }
        if ($response['status'] < 200 || $response['status'] >= 300) {
            return $this->failure('http_failure', 502, ucfirst($platform) . ' returned HTTP ' . $response['status'] . '; reviews could not be accessed. No scan was saved.', ['platform' => $platform, 'http_status' => $response['status']]);
        }

        $contentType = strtolower($response['content_type']);
        if ($contentType !== '' && !str_contains($contentType, 'html') && !str_contains($contentType, 'json')) {
            return $this->failure('unsupported_content', 502, 'The marketplace did not return a product page that EchoTrace can inspect. No scan was saved.', ['platform' => $platform, 'content_type' => substr($contentType, 0, 100)]);
        }

        $parsed = $this->extractFromHtml($response['body'], $currentUrl, $platform);
        if (!$parsed['reviews']) {
            return $this->failure('reviews_unavailable', 422, ucfirst($platform) . ' did not expose customer reviews in the public product-page response. The site may require login, JavaScript, an official API, or may be blocking server access. No scan was saved.', ['platform' => $platform, 'html_bytes' => strlen($response['body'])]);
        }

        $this->logDiagnostic('reviews_extracted', ['platform' => $platform, 'review_count' => count($parsed['reviews']), 'html_bytes' => strlen($response['body'])]);
        $this->writeReviewCache($currentUrl, $platform, $parsed);

        return array_merge(['success' => true, 'source' => 'public_product_page'], $parsed);
    }

    public function extractFromHtml(string $html, string $url, string $platform): array
    {
        $reviews = [];
        $metadata = ['title' => '', 'image_url' => '', 'rating' => 0.0, 'external_id' => ''];

        $previous = libxml_use_internal_errors(true);
        $dom = new DOMDocument();
        $loaded = $html !== '' && $dom->loadHTML($html, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        if ($loaded) {
            $xpath = new DOMXPath($dom);
            $metadata['title'] = $this->firstAttribute($xpath, "//meta[@property='og:title']", 'content')
                ?: $this->firstText($xpath, '//title');
            $metadata['image_url'] = $this->firstAttribute($xpath, "//meta[@property='og:image']", 'content');

            foreach ($xpath->query("//script[@type='application/ld+json' or @id='__NEXT_DATA__' or @type='application/json']") ?: [] as $script) {
                $decoded = json_decode(trim($script->textContent), true);
                if (!is_array($decoded)) continue;
                $this->collectStructuredData($decoded, $reviews, $metadata, '');
                if (count($reviews) >= self::MAX_REVIEWS) break;
            }

            $this->collectMarkupReviews($xpath, $reviews, $platform);
        }

        $reviews = $this->deduplicateReviews($reviews);
        $metadata['title'] = $this->cleanText($metadata['title'], 255);
        if ($metadata['title'] === '') $metadata['title'] = ucfirst($platform) . ' product';
        $metadata['external_id'] = $this->cleanText($metadata['external_id'], 100)
            ?: $this->externalIdFromUrl($url, $platform);
        $metadata['image_url'] = $this->safeImageUrl($metadata['image_url']);
        $metadata['rating'] = max(0.0, min(5.0, floatval($metadata['rating'])));

        return [
            'platform' => $platform,
            'url' => $url,
            'external_id' => $metadata['external_id'],
            'title' => $metadata['title'],
            'image_url' => $metadata['image_url'],
            'rating' => $metadata['rating'],
            'reviews' => array_slice($reviews, 0, self::MAX_REVIEWS),
        ];
    }

    private function fetchOnce(array $target): array
    {
        $caBundle = $this->caBundlePath();
        if ($caBundle === null) {
            return $this->failure('tls_configuration', 503, 'EchoTrace cannot verify marketplace certificates because the server CA bundle is not configured. No scan was saved.', ['host' => $target['host']]);
        }

        // Resolve and validate the marketplace host before this method is called so
        // proxy use cannot turn the target URL into an SSRF primitive. A configured
        // HTTP(S) proxy is the only case where cURL must resolve the marketplace
        // hostname itself; CURLOPT_RESOLVE would otherwise force a direct socket
        // and bypass the server's normal outbound network route.
        $proxy = $this->proxyUrl();
        $addresses = $proxy !== null ? ['proxy'] : array_values(array_unique($target['addresses']));
        usort($addresses, static fn(string $a, string $b): int => (str_contains($a, ':') ? 1 : 0) <=> (str_contains($b, ':') ? 1 : 0));
        $lastError = null;
        $lastErrno = 0;

        foreach ($addresses as $address) {
            $body = '';
            $tooLarge = false;
            $location = '';
            $family = $proxy !== null ? 'proxy' : (str_contains($address, ':') ? 'ipv6' : 'ipv4');
            $ch = curl_init($target['url']);
            $options = [
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_RETURNTRANSFER => false,
                CURLOPT_CONNECTTIMEOUT => self::CONNECT_TIMEOUT_SECONDS,
                CURLOPT_TIMEOUT => self::REQUEST_TIMEOUT_SECONDS,
                CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
                CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
                CURLOPT_CAINFO => $caBundle,
                CURLOPT_ENCODING => '',
                CURLOPT_USERAGENT => 'EchoTraceReviewAuditor/1.0',
                CURLOPT_HTTPHEADER => ['Accept: text/html,application/xhtml+xml,application/json;q=0.9', 'Accept-Language: en-US,en;q=0.8'],
                CURLOPT_HEADERFUNCTION => static function ($curl, string $header) use (&$location): int {
                    if (stripos($header, 'Location:') === 0) $location = trim(substr($header, 9));
                    return strlen($header);
                },
                CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$body, &$tooLarge): int {
                    if (strlen($body) + strlen($chunk) > self::MAX_RESPONSE_BYTES) {
                        $tooLarge = true;
                        return 0;
                    }
                    $body .= $chunk;
                    return strlen($chunk);
                },
            ];
            if ($proxy !== null) {
                $options[CURLOPT_PROXY] = $proxy;
                $options[CURLOPT_PROXYTYPE] = CURLPROXY_HTTP;
            } else {
                $resolveAddress = $target['host'] . ':443:' . (str_contains($address, ':') ? '[' . $address . ']' : $address);
                $options[CURLOPT_RESOLVE] = [$resolveAddress];
                $options[CURLOPT_IPRESOLVE] = $family === 'ipv6' ? CURL_IPRESOLVE_V6 : CURL_IPRESOLVE_V4;
            }
            curl_setopt_array($ch, $options);

            $startedAt = microtime(true);
            $ok = curl_exec($ch);
            $error = curl_error($ch);
            $errno = curl_errno($ch);
            $info = curl_getinfo($ch);
            $status = intval($info['http_code'] ?? 0);
            $contentType = (string)($info['content_type'] ?? '');
            $primaryIp = (string)($info['primary_ip'] ?? '');
            $sslVerifyResult = intval($info['ssl_verifyresult'] ?? 0);
            $nameLookupMs = intval(floatval($info['namelookup_time'] ?? 0) * 1000);
            $connectMs = intval(floatval($info['connect_time'] ?? 0) * 1000);
            $totalTimeMs = intval((microtime(true) - $startedAt) * 1000);
            curl_close($ch);

            $this->logDiagnostic($ok === false ? 'http_failure' : 'http_response', [
                'host' => $target['host'],
                'address_family' => $family,
                'address' => $proxy !== null ? null : $address,
                'transport' => $proxy !== null ? 'configured_proxy' : 'direct',
                'http_status' => $status,
                'curl_errno' => $errno,
                'duration_ms' => $totalTimeMs,
                'name_lookup_ms' => $nameLookupMs,
                'connect_ms' => $connectMs,
                'primary_ip' => $primaryIp,
                'ssl_verify_result' => $sslVerifyResult,
                'content_type' => substr($contentType, 0, 100),
                'error' => $error !== '' ? $this->safeCurlError($error) : null,
            ]);

            if ($tooLarge) return $this->failure('response_too_large', 502, 'The marketplace response was too large to inspect safely. No scan was saved.', ['host' => $target['host']]);
            if ($ok !== false) return ['success' => true, 'status' => $status, 'content_type' => $contentType, 'location' => $location, 'body' => $body];

            $lastError = $error;
            $lastErrno = $errno;
        }

        $code = $this->curlFailureCode($lastErrno);
        $message = match ($code) {
            'dns_failure' => 'The marketplace DNS lookup failed. Check the server DNS configuration and try again. No scan was saved.',
            'timeout' => 'The marketplace connection timed out. Shopee may be slow, unavailable, or blocking this server. No scan was saved.',
            'tls_failure' => 'The marketplace TLS certificate could not be verified. Update the server CA bundle without disabling certificate verification. No scan was saved.',
            default => 'The marketplace connection was refused or unavailable from this server. No scan was saved.',
        };
        // 502 is reserved for an upstream HTTP response. A connection that
        // never reached the marketplace is a local/upstream availability
        // problem, so expose the more useful 503/504 status to the frontend.
        $httpStatus = $code === 'timeout' ? 504 : (in_array($code, ['dns_failure', 'connection_failure', 'tls_failure'], true) ? 503 : 502);
        return $this->failure($code, $httpStatus, $message, ['host' => $target['host'], 'curl_errno' => $lastErrno, 'error' => $lastError ? $this->safeCurlError($lastError) : null]);
    }

    private function collectStructuredData($node, array &$reviews, array &$metadata, string $path): void
    {
        if (!is_array($node) || count($reviews) >= self::MAX_REVIEWS) return;
        $type = strtolower(is_string($node['@type'] ?? null) ? $node['@type'] : '');
        if ($type === 'product') {
            $metadata['title'] = $metadata['title'] ?: ($node['name'] ?? '');
            $image = $node['image'] ?? '';
            $metadata['image_url'] = $metadata['image_url'] ?: (is_array($image) ? (is_string($image[0] ?? null) ? $image[0] : ($image['url'] ?? '')) : $image);
            $metadata['external_id'] = $metadata['external_id'] ?: ($node['sku'] ?? $node['productID'] ?? $node['mpn'] ?? '');
            $metadata['rating'] = $metadata['rating'] ?: floatval($node['aggregateRating']['ratingValue'] ?? 0);
        }

        $isReview = $type === 'review' || str_contains(strtolower($path), 'review');
        $body = $node['reviewBody'] ?? $node['reviewText'] ?? $node['review_content'] ?? null;
        if ($isReview && is_string($body) && trim(strip_tags($body)) !== '') {
            $reviews[] = [
                'id' => $node['@id'] ?? $node['reviewId'] ?? $node['review_id'] ?? $node['id'] ?? null,
                'author' => is_array($node['author'] ?? null) ? ($node['author']['name'] ?? 'Anonymous') : ($node['author'] ?? $node['reviewerName'] ?? 'Anonymous'),
                'rating' => $node['reviewRating']['ratingValue'] ?? $node['rating'] ?? $node['ratingValue'] ?? null,
                'title' => $node['name'] ?? $node['title'] ?? '',
                'date' => $node['datePublished'] ?? $node['reviewTime'] ?? $node['date'] ?? null,
                'text' => $body,
            ];
        }

        foreach ($node as $key => $value) {
            if (is_array($value)) $this->collectStructuredData($value, $reviews, $metadata, $path . '/' . (string)$key);
            if (count($reviews) >= self::MAX_REVIEWS) break;
        }
    }

    private function collectMarkupReviews(DOMXPath $xpath, array &$reviews, string $platform): void
    {
        $adapter = $this->registry->forPlatform($platform);
        $selectors = array_merge([
            "//*[@itemprop='review']",
            "//*[@data-hook='review']",
            "//*[@data-testid='review-card']",
            "//*[@data-e2e='comment-item']",
            "//*[contains(@class,'shopee-product-rating')]",
            "//*[contains(concat(' ', normalize-space(@class), ' '), ' review-item ')]",
            "//*[contains(@class,'product-review')]",
            "//*[contains(@class,'comment-item')]",
        ], $adapter?->markupSelectors() ?? []);
        $selectors = array_values(array_unique($selectors));
        $nodes = $xpath->query(implode(' | ', $selectors));
        if (!$nodes) return;

        foreach ($nodes as $node) {
            if (count($reviews) >= self::MAX_REVIEWS) break;
            $text = $this->relativeText($xpath, $node, array_merge([
                ".//*[@itemprop='reviewBody']",
                ".//*[@data-hook='review-body']",
                ".//*[@data-testid='review-text']",
                ".//*[@data-e2e='comment-content']",
                ".//*[contains(@class,'rating__comment')]",
                ".//*[contains(@class,'review-comment')]",
                ".//*[contains(@class,'review-text')]",
                ".//*[contains(@class,'review-content')]",
                ".//*[contains(@class,'comment-content')]",
            ], $adapter?->textSelectors() ?? []));
            if ($text === '') continue;
            $ratingText = $this->relativeText($xpath, $node, [".//*[@itemprop='ratingValue']", ".//*[@data-hook='review-star-rating']", ".//*[@aria-label]", ".//*[contains(@class,'rating')]"]);
            preg_match('/([1-5](?:\.\d+)?)/', $ratingText, $ratingMatch);
            $reviews[] = [
                'id' => $node instanceof DOMElement ? ($node->getAttribute('id') ?: $node->getAttribute('data-review-id') ?: null) : null,
                'author' => $this->relativeText($xpath, $node, [".//*[@itemprop='author']", ".//*[@data-hook='review-author']", ".//*[contains(@class,'buyer-name')]", ".//*[contains(@class,'author')]"]) ?: 'Anonymous',
                'rating' => isset($ratingMatch[1]) ? floatval($ratingMatch[1]) : null,
                'title' => $this->relativeText($xpath, $node, [".//*[@itemprop='name']", ".//*[@data-hook='review-title']", ".//*[contains(@class,'review-title')]"]),
                'date' => $this->relativeText($xpath, $node, [".//*[@itemprop='datePublished']", ".//*[@data-hook='review-date']", ".//*[contains(@class,'review-date')]"]) ?: null,
                'text' => $text,
            ];
        }
    }

    private function deduplicateReviews(array $reviews): array
    {
        $unique = [];
        $seen = [];
        foreach ($reviews as $review) {
            $text = $this->cleanText($review['text'] ?? '', 10000);
            if ($text === '') continue;
            $fingerprint = hash('sha256', mb_strtolower(preg_replace('/\s+/u', ' ', $text)));
            if (isset($seen[$fingerprint])) continue;
            $seen[$fingerprint] = true;
            $rating = is_numeric($review['rating'] ?? null) ? floatval($review['rating']) : null;
            if ($rating !== null && ($rating < 1 || $rating > 5)) $rating = null;
            $externalId = $this->cleanText($review['id'] ?? '', 100) ?: substr($fingerprint, 0, 40);
            $unique[] = [
                'id' => $externalId,
                'author' => $this->cleanText($review['author'] ?? 'Anonymous', 100) ?: 'Anonymous',
                'rating' => $rating,
                'title' => $this->cleanText($review['title'] ?? '', 255),
                'date' => $this->cleanText($review['date'] ?? '', 100) ?: null,
                'text' => $text,
            ];
            if (count($unique) >= self::MAX_REVIEWS) break;
        }
        return $unique;
    }

    private function resolvePublicAddresses(string $host): array
    {
        $addresses = [];
        $records = @dns_get_record($host, DNS_A | DNS_AAAA);
        if (is_array($records)) {
            foreach ($records as $record) {
                $address = $record['ip'] ?? $record['ipv6'] ?? null;
                if (is_string($address)) $addresses[] = $address;
            }
        }
        if (!$addresses) $addresses = @gethostbynamel($host) ?: [];
        $addresses = array_values(array_unique($addresses));
        if (!$addresses) {
            $this->logDiagnostic('dns_failure', ['host' => $host, 'reason' => 'no_public_dns_records']);
            return [];
        }
        foreach ($addresses as $address) {
            if (!filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                $this->logDiagnostic('dns_rejected', ['host' => $host, 'address' => $address, 'reason' => 'private_or_reserved_address']);
                return [];
            }
        }
        $this->logDiagnostic('dns_resolved', ['host' => $host, 'addresses' => $addresses, 'address_count' => count($addresses)]);
        return $addresses;
    }

    private function platformForHost(string $host): ?string
    {
        return $this->registry->detectPlatform($host);
    }

    private function normalizeUrl(string $url): string
    {
        $parts = parse_url($url);
        $path = $parts['path'] ?? '/';
        $normalized = 'https://' . strtolower(rtrim($parts['host'], '.')) . ($path === '' ? '/' : $path);
        if (!empty($parts['query'])) $normalized .= '?' . $parts['query'];
        return $normalized;
    }

    private function resolveRedirectUrl(string $base, string $location): string
    {
        $location = trim($location);
        if ($location === '' || preg_match('/[\r\n]/', $location)) return '';
        if (preg_match('#^https?://#i', $location)) return $location;
        $parts = parse_url($base);
        if (!is_array($parts) || empty($parts['host'])) return '';
        if (str_starts_with($location, '//')) return 'https:' . $location;
        $basePath = (string)($parts['path'] ?? '/');
        if (str_starts_with($location, '?')) return 'https://' . $parts['host'] . ($basePath === '' ? '/' : $basePath) . $location;
        if (str_starts_with($location, '#')) return '';
        if (str_starts_with($location, '/')) {
            $path = $location;
        } else {
            $directory = preg_replace('#/[^/]*$#', '/', $basePath) ?: '/';
            $path = $directory . $location;
        }
        $query = '';
        $pathWithoutFragment = explode('#', $path, 2)[0];
        if (str_contains($pathWithoutFragment, '?')) {
            [$pathWithoutFragment, $query] = explode('?', $pathWithoutFragment, 2);
            $query = '?' . $query;
        }
        $segments = [];
        foreach (explode('/', $pathWithoutFragment) as $segment) {
            if ($segment === '' || $segment === '.') continue;
            if ($segment === '..') {
                array_pop($segments);
                continue;
            }
            $segments[] = $segment;
        }
        return 'https://' . $parts['host'] . '/' . implode('/', $segments) . $query;
    }

    private function externalIdFromUrl(string $url, string $platform): string
    {
        $adapter = $this->registry->forPlatform($platform);
        $externalId = $adapter?->extractExternalId($url) ?? '';
        if ($externalId !== '') return $externalId;
        return substr(hash('sha256', $this->normalizeUrl($url)), 0, 32);
    }

    private function firstText(DOMXPath $xpath, string $query): string
    {
        $node = $xpath->query($query)?->item(0);
        return $node ? trim($node->textContent) : '';
    }

    private function firstAttribute(DOMXPath $xpath, string $query, string $attribute): string
    {
        $node = $xpath->query($query)?->item(0);
        return $node instanceof DOMElement ? trim($node->getAttribute($attribute)) : '';
    }

    private function relativeText(DOMXPath $xpath, DOMNode $context, array $queries): string
    {
        foreach ($queries as $query) {
            $node = $xpath->query($query, $context)?->item(0);
            if ($node) {
                if ($node instanceof DOMElement && $node->hasAttribute('content')) return trim($node->getAttribute('content'));
                if ($node instanceof DOMElement && $node->hasAttribute('aria-label')) return trim($node->getAttribute('aria-label'));
                $text = trim($node->textContent);
                if ($text !== '') return $text;
            }
        }
        return '';
    }

    private function cleanText($value, int $maxLength): string
    {
        if (!is_scalar($value)) return '';
        $text = html_entity_decode(strip_tags((string)$value), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = trim(preg_replace('/\s+/u', ' ', $text));
        return mb_substr($text, 0, $maxLength);
    }

    private function safeImageUrl($value): string
    {
        if (!is_string($value) || !filter_var($value, FILTER_VALIDATE_URL)) return '';
        return strtolower((string)parse_url($value, PHP_URL_SCHEME)) === 'https' ? $value : '';
    }

    private function blockedMessage(string $platform, int $status): string
    {
        $reason = $status === 429 ? 'rate-limited the request' : 'requires authentication or blocked server-side access';
        $this->logDiagnostic($status === 429 ? 'rate_limited' : 'forbidden_access', ['platform' => $platform, 'http_status' => $status]);
        return ucfirst($platform) . ' ' . $reason . '. EchoTrace did not fabricate reviews and no scan was saved. You can still use the optional Chrome extension on reviews visible in your browser.';
    }

    private function caBundlePath(): ?string
    {
        $configured = trim((string)(echotrace_env('ECHOTRACE_CA_BUNDLE') ?: ini_get('curl.cainfo')));
        $candidates = array_values(array_filter([
            $configured,
            (defined('PHP_WINDOWS_VERSION_BUILD') ? 'C:\\laragon\\etc\\ssl\\cacert.pem' : '/etc/ssl/certs/ca-certificates.crt'),
            '/etc/ssl/cert.pem',
        ], static fn($path): bool => is_string($path) && $path !== ''));
        foreach ($candidates as $path) {
            if (is_file($path) && is_readable($path)) return $path;
        }
        $this->logDiagnostic('tls_configuration', ['configured_bundle' => $configured !== '' ? $configured : null, 'reason' => 'no_readable_ca_bundle']);
        return null;
    }

    /**
     * Return only an explicitly configured HTTP(S) proxy. Proxy credentials,
     * if present in the environment, are passed to cURL but never logged.
     */
    private function proxyUrl(): ?string
    {
        $configured = trim((string)(echotrace_env('ECHOTRACE_HTTPS_PROXY') ?: getenv('HTTPS_PROXY') ?: getenv('HTTP_PROXY') ?: ''));
        if ($configured === '') return null;

        $parts = parse_url($configured);
        $scheme = strtolower((string)($parts['scheme'] ?? ''));
        $host = (string)($parts['host'] ?? '');
        $port = isset($parts['port']) ? intval($parts['port']) : null;
        if (!in_array($scheme, ['http', 'https'], true) || $host === '' || ($port !== null && ($port < 1 || $port > 65535))) {
            $this->logDiagnostic('proxy_configuration', ['configured' => true, 'valid' => false, 'reason' => 'unsupported_proxy_url']);
            return null;
        }

        $this->logDiagnostic('proxy_configuration', ['configured' => true, 'valid' => true]);
        return $configured;
    }

    private function curlFailureCode(int $errno): string
    {
        return match ($errno) {
            5, 6 => 'dns_failure',
            28 => 'timeout',
            35, 51, 53, 58, 60, 66, 77 => 'tls_failure',
            default => 'connection_failure',
        };
    }

    private function failure(string $code, int $status, string $message, array $context = []): array
    {
        $this->logDiagnostic($code, array_merge(['public_message' => $message], $context));
        return ['success' => false, 'status' => $status, 'error_code' => $code, 'diagnostic_id' => $this->correlationId, 'error' => $message];
    }

    private function newCorrelationId(): string
    {
        try {
            return bin2hex(random_bytes(12));
        } catch (Throwable $error) {
            return substr(hash('sha256', uniqid('', true)), 0, 24);
        }
    }

    private function urlFingerprint(string $url): string
    {
        return substr(hash('sha256', $url), 0, 16);
    }

    private function reviewCachePath(string $url, string $platform): string
    {
        return rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR
            . 'echotrace-review-' . $platform . '-' . $this->urlFingerprint($url) . '.json';
    }

    private function readReviewCache(string $url, string $platform): ?array
    {
        $path = $this->reviewCachePath($url, $platform);
        if (!is_file($path) || @filemtime($path) < (time() - 300)) return null;
        $contents = @file_get_contents($path);
        $cached = is_string($contents) ? json_decode($contents, true) : null;
        if (!is_array($cached) || !is_array($cached['reviews'] ?? null) || count($cached['reviews']) < 1) return null;
        return $cached;
    }

    private function writeReviewCache(string $url, string $platform, array $parsed): void
    {
        if (empty($parsed['reviews']) || count($parsed['reviews']) > self::MAX_REVIEWS) return;
        $payload = [
            'platform' => $platform,
            'url' => $url,
            'title' => $parsed['title'] ?? '',
            'image_url' => $parsed['image_url'] ?? '',
            'rating' => $parsed['rating'] ?? 0,
            'external_id' => $parsed['external_id'] ?? '',
            'reviews' => $parsed['reviews'],
            'cached_at' => gmdate('c'),
        ];
        @file_put_contents($this->reviewCachePath($url, $platform), json_encode($payload, JSON_UNESCAPED_SLASHES), LOCK_EX);
    }

    private function safeCurlError(string $error): string
    {
        return substr(preg_replace('/https?:\/\/[^\s]+/i', '[url]', $error), 0, 300);
    }

    private function logDiagnostic(string $event, array $context = []): void
    {
        $context['correlation_id'] = $this->correlationId;
        $context['event'] = $event;
        $context['component'] = 'review-extractor';
        $context['timestamp'] = gmdate('c');
        error_log('EchoTrace review extractor ' . json_encode($context, JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR));
    }
}
