# EchoTrace: AI-Powered Fake Product Review Detection System

EchoTrace is a comprehensive, responsive, and secure web application integrated with an AI-powered Python microservice and a Google Chrome Extension (Manifest Version 3) designed to detect fake, paid, duplicate, toxic, and manipulated product reviews in real time on e-commerce sites (such as Amazon and Shopee).

---

## Folder Structure

```
EchoTrace/
├── frontend/                  # Responsive Glassmorphic Single Page App UI
│   ├── css/style.css          # Design system & glassmorphism
│   ├── js/                    # Modular JS (api.js, auth.js, charts.js, app.js)
│   └── index.html             # Main entry point
├── backend/                   # REST API in PHP 8 (MVC-like)
│   ├── api/index.php          # Main API entry router gateway
│   ├── config/database.php    # PDO connection wrapper
│   ├── middleware/            # JWT validation
│   ├── controllers/           # Business logic (Auth, Product, Scan, Admin)
│   └── models/                # DB Models (User, Product, Review, ScanHistory)
├── python_ai/                 # Python NLP & Machine Learning Engine
│   ├── app.py                 # Flask server (Port 5000)
│   ├── requirements.txt       # Python dependencies
│   ├── preprocessing/         # Text Cleaner (lemmatization & stop words)
│   └── models/                # NLPAnalyzer & FakeReviewClassifier (TF-IDF + LR)
├── chrome_extension/          # Google Chrome Extension (MV3)
│   ├── manifest.json          # MV3 configuration
│   ├── scripts/               # content.js & background.js
│   └── popup/                 # Ext popup panel UI, js, css
└── database/
    └── echotrace.sql          # MySQL Schema & seed settings/accounts
```

---

## System Requirements

1. **Backend / Web Server:** PHP 8.0+ and MySQL (recommended via Laragon or XAMPP).
2. **AI Microservice:** Python 3.8+ with pip.
3. **Browser:** Google Chrome (for the Extension).

---

## Installation & Setup Guide

### 1. Database Configuration
1. Open your MySQL client (e.g., phpMyAdmin inside Laragon).
2. Create a database named `echotrace` (or let the script handle it).
3. Import the file `database/echotrace.sql`.
4. If your MySQL credentials differ from the default (`root` with no password), update them in `backend/config/database.php`.

### 2. Launch PHP Server (Laragon)
- Place the project folder in your root server directory (e.g., `C:/laragon/www/capsatone2/`).
- Start Laragon services (Apache and MySQL).
- Access the web app at `http://localhost/capsatone2/frontend/` or `http://localhost/EchoTrace/frontend/`.

### 3. Launch Python AI Service
1. Open terminal in the `python_ai` directory.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the Flask server:
   ```bash
   python app.py
   ```
   *The microservice will start listening on `http://127.0.0.1:5000`.*
   *Note: On first execution, the classifier will automatically generate, train, and save the TF-IDF and Logistic Regression model parameters using seed training data.*

### 4. Install Chrome Extension
1. Open Google Chrome and go to `chrome://extensions/`.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the `chrome_extension` folder.
5. Pin the **EchoTrace** extension to your toolbar.
6. Open the extension popup, click the settings cog icon ⚙️, make sure the API URL points correctly to your local server (e.g. `http://localhost/capsatone2/backend/api/index.php`), and save settings.

---

## Running Verification

### Manual Frontend Scan (No Extension needed)
1. Register a new account or log in with the default credentials:
   - **Admin Account:** Username: `admin` | Password: `Admin123!`
   - **User Account:** Username: `user` | Password: `User123!`
2. In the dashboard, click **New Manual Scan**.
3. Select a platform (e.g. Amazon), fill in details, and click **Load sample reviews** to auto-inject test reviews.
4. Click **Execute Review Audit**.
5. You will see a detailed glassmorphic report displaying the trust score dial, key strengths/weaknesses extracted, and a color-coded annotated reviews list flagging duplicates and spam.

### Chrome Extension Scan
1. Go to any product page on Amazon (e.g. search for any product, open its details page).
2. A floating **"Audit with EchoTrace"** button will appear in the bottom-right corner.
3. Click it. The button changes to "Analyzing..." and queries the PHP API.
4. Once completed, a summary drawer slides out, the floating button updates to show the trust percentage, and fake/duplicate reviews in the page will be highlighted with red borders and detailed badge reasons.
5. In the extension popup, log in with your credentials to sync scans directly to your account history.
