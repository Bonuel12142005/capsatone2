<?php

/**
 * Safe CSV/XLSX importer for real user-supplied review datasets.
 * Parsing is deliberately bounded because the current AI endpoint accepts
 * at most 100 reviews per analysis request.
 */
final class ReviewDatasetImporter {
    private const MAX_BYTES = 5_242_880;
    private const MAX_ROWS = 1000;
    private const MAX_REVIEW_TEXT = 10000;

    public function parseUploadedFile(array $file, array $mapping = []): array {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            return $this->failure('The review file could not be uploaded.');
        }
        $size = intval($file['size'] ?? 0);
        $path = (string)($file['tmp_name'] ?? '');
        if ($size < 1 || $size > self::MAX_BYTES || $path === '' || !is_uploaded_file($path)) {
            return $this->failure('Upload a CSV or XLSX file smaller than 5 MB.');
        }

        $name = (string)($file['name'] ?? '');
        return $this->parseFilePath($path, $name, $mapping);
    }

    /**
     * File-path entry point used by controlled server-side tests and by the
     * upload entry point after PHP has validated the multipart upload.
     */
    public function parseFilePath(string $path, string $name, array $mapping = []): array {
        if (!is_file($path) || !is_readable($path)) {
            return $this->failure('The review file could not be read.');
        }
        $size = filesize($path);
        if ($size === false || $size < 1 || $size > self::MAX_BYTES) {
            return $this->failure('Upload a CSV or XLSX file smaller than 5 MB.');
        }

        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (!in_array($extension, ['csv', 'xlsx'], true)) {
            return $this->failure('Only CSV and XLSX review files are supported.');
        }

        $table = $extension === 'csv' ? $this->parseCsv($path) : $this->parseXlsx($path);
        if (!$table['success']) return $table;
        return $this->toReviews($table['columns'], $table['rows'], $mapping, $extension);
    }

    private function parseCsv(string $path): array {
        $handle = @fopen($path, 'rb');
        if ($handle === false) return $this->failure('The CSV file could not be read.');
        $headers = fgetcsv($handle);
        if (!is_array($headers) || !$headers) { fclose($handle); return $this->failure('The CSV file has no header row.'); }
        $columns = $this->cleanColumns($headers);
        $rows = [];
        while (($row = fgetcsv($handle)) !== false) {
            if (count($rows) >= self::MAX_ROWS) break;
            if ($this->rowIsEmpty($row)) continue;
            $rows[] = $this->alignRow($columns, $row);
        }
        fclose($handle);
        return ['success' => true, 'format' => 'csv', 'columns' => $columns, 'rows' => $rows];
    }

    private function parseXlsx(string $path): array {
        if (!class_exists('ZipArchive')) return $this->failure('XLSX support is not available on this PHP installation. Use CSV instead.');
        $zip = new ZipArchive();
        if ($zip->open($path) !== true) return $this->failure('The XLSX file could not be opened.');
        $sharedStrings = $this->readSharedStrings($zip);
        $sheet = $zip->getFromName('xl/worksheets/sheet1.xml');
        $zip->close();
        if (!is_string($sheet) || $sheet === '') return $this->failure('The XLSX file has no readable first worksheet.');

        $dom = new DOMDocument();
        $dom->preserveWhiteSpace = false;
        if (!@$dom->loadXML($sheet, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING)) {
            return $this->failure('The XLSX worksheet is malformed.');
        }
        $xpath = new DOMXPath($dom);
        $xpath->registerNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
        $rawRows = [];
        foreach ($xpath->query('//x:sheetData/x:row') as $rowNode) {
            if (count($rawRows) > self::MAX_ROWS) break;
            $cells = [];
            foreach ($xpath->query('./x:c', $rowNode) as $cell) {
                $ref = $cell->getAttribute('r');
                preg_match('/^([A-Z]+)/i', $ref, $match);
                $columnIndex = $this->columnIndex($match[1] ?? 'A');
                $type = $cell->getAttribute('t');
                $value = $xpath->query('./x:v', $cell)->item(0)?->textContent ?? '';
                if ($type === 's') $value = $sharedStrings[intval($value)] ?? '';
                elseif ($type === 'inlineStr') $value = $xpath->query('./x:is//x:t', $cell)->item(0)?->textContent ?? '';
                $cells[$columnIndex] = trim((string)$value);
            }
            if ($cells) $rawRows[] = $cells;
        }
        if (!$rawRows) return $this->failure('The XLSX worksheet has no rows.');
        ksort($rawRows[0]);
        $columns = $this->cleanColumns(array_values($rawRows[0]));
        $rows = [];
        foreach (array_slice($rawRows, 1) as $rawRow) {
            if (count($rows) >= self::MAX_ROWS) break;
            ksort($rawRow);
            $values = array_values($rawRow);
            if (!$this->rowIsEmpty($values)) $rows[] = $this->alignRow($columns, $values);
        }
        return ['success' => true, 'format' => 'xlsx', 'columns' => $columns, 'rows' => $rows];
    }

    private function readSharedStrings(ZipArchive $zip): array {
        $xml = $zip->getFromName('xl/sharedStrings.xml');
        if (!is_string($xml) || $xml === '') return [];
        $dom = new DOMDocument();
        if (!@$dom->loadXML($xml, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING)) return [];
        $xpath = new DOMXPath($dom);
        $xpath->registerNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
        $values = [];
        foreach ($xpath->query('//x:si') as $item) {
            $text = '';
            foreach ($xpath->query('.//x:t', $item) as $node) $text .= $node->textContent;
            $values[] = $text;
        }
        return $values;
    }

    private function toReviews(array $columns, array $rows, array $mapping, string $format): array {
        $normalizedColumns = array_map(fn($column): string => $this->normalizeColumn($column), $columns);
        $textIndex = $this->mappingIndex($mapping['text'] ?? null, $columns, $normalizedColumns);
        if ($textIndex === null) {
            foreach (['review_text', 'review', 'text', 'comment', 'content', 'body'] as $candidate) {
                $textIndex = array_search($candidate, $normalizedColumns, true);
                if ($textIndex !== false) break;
            }
        }
        if ($textIndex === null || $textIndex === false) {
            return $this->failure('The file needs a review-text column such as review, review_text, comment, content, or body.');
        }
        $authorIndex = $this->mappingIndex($mapping['author'] ?? null, $columns, $normalizedColumns) ?? $this->candidateIndex(['author', 'username', 'name'], $normalizedColumns);
        $ratingIndex = $this->mappingIndex($mapping['rating'] ?? null, $columns, $normalizedColumns) ?? $this->candidateIndex(['rating', 'stars', 'score'], $normalizedColumns);
        $titleIndex = $this->mappingIndex($mapping['title'] ?? null, $columns, $normalizedColumns) ?? $this->candidateIndex(['title', 'review_title', 'headline'], $normalizedColumns);
        $dateIndex = $this->mappingIndex($mapping['date'] ?? null, $columns, $normalizedColumns) ?? $this->candidateIndex(['date', 'review_date', 'created_at'], $normalizedColumns);
        $reviews = [];
        $seen = [];
        $duplicatesRemoved = 0;
        foreach ($rows as $rowIndex => $row) {
            $text = trim(preg_replace('/\s+/u', ' ', strip_tags((string)($row[$textIndex] ?? ''))));
            if ($text === '') continue;
            if (mb_strlen($text) > self::MAX_REVIEW_TEXT) return $this->failure('A review exceeds the 10000-character limit.');
            $fingerprint = hash('sha256', mb_strtolower($text));
            if (isset($seen[$fingerprint])) { $duplicatesRemoved++; continue; }
            $seen[$fingerprint] = true;
            $rating = $ratingIndex === null ? null : $row[$ratingIndex] ?? null;
            $reviews[] = [
                'id' => 'upload-' . ($rowIndex + 2),
                'author' => trim(substr((string)($authorIndex === null ? 'Anonymous' : ($row[$authorIndex] ?? 'Anonymous')), 0, 100)) ?: 'Anonymous',
                'rating' => is_numeric($rating) ? floatval($rating) : null,
                'title' => trim(substr((string)($titleIndex === null ? '' : ($row[$titleIndex] ?? '')), 0, 255)),
                'date' => trim(substr((string)($dateIndex === null ? '' : ($row[$dateIndex] ?? '')), 0, 100)) ?: null,
                'text' => $text,
            ];
            if (count($reviews) >= self::MAX_ROWS) break;
        }
        if (!$reviews) return $this->failure('No actual customer review text was found in the file.');
        return ['success' => true, 'format' => $format, 'columns' => $columns, 'rows' => array_slice($rows, 0, 10), 'reviews' => array_slice($reviews, 0, 100), 'duplicates_removed' => $duplicatesRemoved, 'total_valid' => count($reviews)];
    }

    private function mappingIndex(mixed $requested, array $columns, array $normalized): ?int {
        if (!is_string($requested) || trim($requested) === '') return null;
        $index = array_search($requested, $columns, true);
        if ($index !== false) return $index;
        $index = array_search($this->normalizeColumn($requested), $normalized, true);
        return $index === false ? null : $index;
    }

    private function candidateIndex(array $candidates, array $normalized): ?int {
        foreach ($candidates as $candidate) {
            $index = array_search($candidate, $normalized, true);
            if ($index !== false) return $index;
        }
        return null;
    }

    private function cleanColumns(array $columns): array {
        $result = [];
        foreach ($columns as $index => $column) {
            $name = trim((string)$column);
            $result[] = $name !== '' ? substr($name, 0, 100) : 'Column ' . ($index + 1);
        }
        return $result;
    }

    private function normalizeColumn(string $column): string {
        return trim(strtolower(preg_replace('/[^a-z0-9]+/', '_', $column)), '_');
    }

    private function alignRow(array $columns, array $row): array {
        $aligned = [];
        foreach (array_keys($columns) as $index) $aligned[$index] = (string)($row[$index] ?? '');
        return $aligned;
    }

    private function rowIsEmpty(array $row): bool {
        foreach ($row as $value) if (trim((string)$value) !== '') return false;
        return true;
    }

    private function columnIndex(string $letters): int {
        $index = 0;
        foreach (str_split(strtoupper($letters)) as $letter) $index = ($index * 26) + (ord($letter) - 64);
        return max(0, $index - 1);
    }

    private function failure(string $error): array {
        return ['success' => false, 'status' => 422, 'error_code' => 'invalid_review_file', 'error' => $error];
    }
}
