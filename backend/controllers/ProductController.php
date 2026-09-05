<?php
// backend/controllers/ProductController.php

class ProductController {
    private $productModel;
    private $scanHistoryModel;

    public function __construct($db) {
        $this->productModel = new Product($db);
        $this->scanHistoryModel = new ScanHistory($db);
    }

    public function getScannedProducts() {
        $products = $this->productModel->getScannedProducts();
        return ["success" => true, "products" => $products];
    }

    public function getProductDetails($id) {
        $product = $this->productModel->findById($id);
        if (!$product) {
            return ["success" => false, "error" => "Product not found."];
        }
        return ["success" => true, "product" => $product];
    }
}
