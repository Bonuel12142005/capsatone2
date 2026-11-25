FROM php:8.2-cli

RUN apt-get update && apt-get install -y --no-install-recommends \
    libcurl4-openssl-dev \
    libonig-dev \
    && docker-php-ext-install pdo_mysql mysqli curl mbstring \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www/html

COPY frontend/ ./frontend/
COPY backend/ ./backend/
COPY router.php ./router.php

EXPOSE 8080

CMD ["sh", "-c", "php -S 0.0.0.0:${PORT:-8080} -t frontend router.php"]
