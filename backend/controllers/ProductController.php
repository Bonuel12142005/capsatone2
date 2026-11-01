<?php
// backend/controllers/ProductController.php

class ProductController {
    private Product $productModel;
    private ScanHistory $scanHistoryModel;

    public function __construct(PDO $db) {
        $this->productModel = new Product($db);
        $this->scanHistoryModel = new ScanHistory($db);
    }

    public function getScannedProducts(): array {
        $products = $this->productModel->getScannedProducts();
        return ["success" => true, "products" => $products];
    }

    public function getProductDetails(int|string $id): array {
        $product = $this->productModel->findById($id);
        if (!$product) {
            return ["success" => false, "error" => "Product not found."];
        }
        return ["success" => true, "product" => $product];
    }
}
