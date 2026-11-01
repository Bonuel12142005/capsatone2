<?php

require_once __DIR__ . '/PublicHtmlMarketplaceAdapter.php';

final class ShopeeAdapter extends PublicHtmlMarketplaceAdapter {
    public function __construct() {
        parent::__construct('shopee', 'Shopee',
            ['shopee.ph', 'shopee.sg', 'shopee.com.my', 'shopee.co.id', 'shopee.co.th', 'shopee.vn', 'shopee.tw', 'shopee.com.br', 'shopee.com.mx'],
            ["//*[@data-testid='review-card']", "//*[contains(@class,'shopee-product-rating')]"],
            [".//*[contains(@class,'rating__comment')]", ".//*[contains(@class,'review-comment')]"],
            '#(?:-i[./]|/product/)(\d+)[.](\d+)(?:[/?\#]|$)#i'
        );
    }
}

final class LazadaAdapter extends PublicHtmlMarketplaceAdapter {
    public function __construct() {
        parent::__construct('lazada', 'Lazada',
            ['lazada.com.ph', 'lazada.sg', 'lazada.com.my', 'lazada.co.id', 'lazada.co.th', 'lazada.vn'],
            ["//*[contains(@class,'review-item')]"] ,
            [".//*[contains(@class,'review-content')]", ".//*[contains(@class,'item-content')]"] ,
            '#-i(\d+)-#i'
        );
    }
}

final class AmazonAdapter extends PublicHtmlMarketplaceAdapter {
    public function __construct() {
        parent::__construct('amazon', 'Amazon',
            ['amazon.com', 'amazon.ca', 'amazon.com.mx', 'amazon.com.br', 'amazon.co.uk', 'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.nl', 'amazon.se', 'amazon.pl', 'amazon.com.au', 'amazon.co.jp', 'amazon.in', 'amazon.sg', 'amazon.ae', 'amazon.sa'],
            ["//*[@data-hook='review']"],
            [".//*[@data-hook='review-body']"],
            '#/(?:dp|gp/product)/([A-Z0-9]{10})(?:[/?]|$)#i'
        );
    }
}

final class EbayAdapter extends PublicHtmlMarketplaceAdapter {
    public function __construct() {
        parent::__construct('ebay', 'eBay',
            ['ebay.com', 'ebay.ca', 'ebay.co.uk', 'ebay.com.au', 'ebay.de', 'ebay.fr', 'ebay.it', 'ebay.es'],
            ["//*[contains(@class,'review-item')]"] ,
            [".//*[contains(@class,'review-text')]", ".//*[contains(@class,'review-content')]"] ,
            '#/itm/(?:[^/]+/)?(\d{9,15})(?:[/?]|$)#i'
        );
    }
}

final class AliExpressAdapter extends PublicHtmlMarketplaceAdapter {
    public function __construct() {
        parent::__construct('aliexpress', 'AliExpress', ['aliexpress.com'],
            ["//*[contains(@class,'review-item')]"] ,
            [".//*[contains(@class,'review-content')]", ".//*[contains(@class,'review-text')]"]
        );
    }
}

final class WalmartAdapter extends PublicHtmlMarketplaceAdapter {
    public function __construct() {
        parent::__construct('walmart', 'Walmart', ['walmart.com', 'walmart.ca', 'walmart.com.mx'],
            ["//*[@data-testid='review']", "//*[contains(@class,'review-item')]"] ,
            [".//*[contains(@class,'review-text')]", ".//*[contains(@class,'review-content')]"] ,
            '#/ip/(?:[^/]+/)?(\d{6,15})(?:[/?]|$)#i'
        );
    }
}

final class TikTokShopAdapter extends PublicHtmlMarketplaceAdapter {
    public function __construct() {
        parent::__construct('tiktokshop', 'TikTok Shop', ['shop.tiktok.com', 'tiktok.com'],
            ["//*[@data-e2e='comment-item']", "//*[contains(@class,'comment-item')]"] ,
            [".//*[@data-e2e='comment-content']", ".//*[contains(@class,'comment-content')]"] ,
            '#/(?:view/product|product)/(\d+)(?:[/?\#]|$)#i'
        );
    }
}

final class ShopifyAdapter extends PublicHtmlMarketplaceAdapter {
    public function __construct() {
        parent::__construct('shopify', 'Shopify', self::configuredHosts('ECHOTRACE_SHOPIFY_HOSTS'),
            ["//*[@data-review-id]", "//*[contains(@class,'spr-review')]"] ,
            [".//*[contains(@class,'spr-review-content-body')]", ".//*[contains(@class,'review-content')]"]
        );
    }

    private static function configuredHosts(string $key): array {
        $value = trim((string)getenv($key));
        return $value === '' ? [] : array_values(array_filter(array_map('trim', explode(',', $value))));
    }
}

final class WooCommerceAdapter extends PublicHtmlMarketplaceAdapter {
    public function __construct() {
        parent::__construct('woocommerce', 'WooCommerce', self::configuredHosts('ECHOTRACE_WOOCOMMERCE_HOSTS'),
            ["//*[@itemprop='review']", "//*[contains(@class,'comment_container')]"] ,
            [".//*[@itemprop='reviewBody']", ".//*[contains(@class,'description')]"]
        );
    }

    private static function configuredHosts(string $key): array {
        $value = trim((string)getenv($key));
        return $value === '' ? [] : array_values(array_filter(array_map('trim', explode(',', $value))));
    }
}
