<?php

require_once __DIR__ . '/StandardMarketplaceAdapters.php';

final class MarketplaceAdapterRegistry {
    /** @var MarketplaceAdapterInterface[] */
    private array $adapters;

    public function __construct() {
        $this->adapters = [
            new ShopeeAdapter(),
            new LazadaAdapter(),
            new AmazonAdapter(),
            new EbayAdapter(),
            new AliExpressAdapter(),
            new WalmartAdapter(),
            new TikTokShopAdapter(),
            new ShopifyAdapter(),
            new WooCommerceAdapter(),
        ];
    }

    public function detectPlatform(string $host): ?string {
        foreach ($this->adapters as $adapter) {
            if ($adapter->supportsHost($host)) return $adapter->platform();
        }
        return null;
    }

    public function forPlatform(string $platform): ?MarketplaceAdapterInterface {
        foreach ($this->adapters as $adapter) {
            if ($adapter->platform() === $platform) return $adapter;
        }
        return null;
    }

    public function labels(): string {
        return implode(', ', array_map(static fn(MarketplaceAdapterInterface $adapter): string => $adapter->label(), $this->adapters));
    }
}
