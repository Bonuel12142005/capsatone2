<?php

interface MarketplaceAdapterInterface {
    public function platform(): string;
    public function label(): string;
    public function supportsHost(string $host): bool;
    public function markupSelectors(): array;
    public function textSelectors(): array;
    public function extractExternalId(string $url): string;
}
