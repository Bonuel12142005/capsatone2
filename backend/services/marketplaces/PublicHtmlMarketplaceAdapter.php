<?php

require_once __DIR__ . '/MarketplaceAdapterInterface.php';

abstract class PublicHtmlMarketplaceAdapter implements MarketplaceAdapterInterface {
    private string $platformName;
    private string $displayName;
    private array $domains;
    private array $reviewSelectors;
    private array $textSelectors;
    private ?string $idPattern;

    public function __construct(string $platform, string $label, array $domains, array $reviewSelectors, array $textSelectors, ?string $idPattern = null) {
        $this->platformName = $platform;
        $this->displayName = $label;
        $this->domains = $domains;
        $this->reviewSelectors = $reviewSelectors;
        $this->textSelectors = $textSelectors;
        $this->idPattern = $idPattern;
    }

    public function platform(): string { return $this->platformName; }
    public function label(): string { return $this->displayName; }
    public function markupSelectors(): array { return $this->reviewSelectors; }
    public function textSelectors(): array { return $this->textSelectors; }

    public function supportsHost(string $host): bool {
        $host = strtolower(rtrim($host, '.'));
        foreach ($this->domains as $domain) {
            $domain = strtolower(rtrim((string)$domain, '.'));
            if ($host === $domain || str_ends_with($host, '.' . $domain)) return true;
        }
        return false;
    }

    public function extractExternalId(string $url): string {
        if ($this->idPattern !== null && preg_match($this->idPattern, $url, $match)) {
            return implode('-', array_slice($match, 1));
        }
        return '';
    }
}
