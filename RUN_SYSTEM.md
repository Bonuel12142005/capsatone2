# EchoTrace System Startup Guide

## Prerequisites Status
- ✅ Python 3.14.3 available
- ✅ Flask, Flask-CORS, MySQL Connector, scikit-learn, NLTK installed
- ⚠️ MySQL Server NOT currently running (port 3306)
- ℹ️ PHP & Apache need to be verified via Laragon/XAMPP

---

## STEP 1: Start MySQL Server

### Option A: Via Laragon (Recommended)
1. Open Laragon application
2. Click **Start All** button (or just start MySQL/Apache)
3. Wait for services to initialize (30-60 seconds)
4. Verify in bottom-right corner that MySQL shows as running

### Option B: Via XAMPP
1. Open XAMPP Control Panel
2. Click **Start** button next to MySQL
3. Wait for it to turn green

### Option C: Via Command Line (if installed)
```powershell
# Windows Services (if registered)
Start-Service MySQL80
# or
net start MySQL80
```

---

## STEP 2: Start Python AI Microservice

Once MySQL is running, open a new PowerShell terminal and run:

```powershell
cd C:\Users\PC\OneDrive\Desktop\capsatone2
py python_ai/app.py
```

**Expected Output:**
```
 * Running on http://127.0.0.1:5000
 * Press CTRL+C to quit
```

The AI engine will:
- Auto-initialize the database (creates tables, seeds data)
- Load the fake review classifier model
- Listen on `http://localhost:5000`

---

## STEP 3: Start PHP Backend Server

Once Python AI is running, open another PowerShell terminal:

```powershell
# If using Laragon: Apache should already be running
# Verify at: http://localhost/capsatone2/backend/api/index.php

# If manual setup needed:
cd C:\Users\PC\OneDrive\Desktop\capsatone2\backend
php -S localhost:8000
```

**Expected Output:**
```
[DDD Mon Jan 01 00:00:00 2024] PHP 8.0.0 Development Server started at localhost:8000
```

**Verify API Health:**
```powershell
curl http://localhost:8000/api/index.php?action=health
```

---

## STEP 4: Access Frontend

Once both services are running, open your browser:

**Local Access:**
```
http://localhost/capsatone2/frontend/
# or if using php -S
http://localhost:8000/../frontend/
```

---

## SYSTEM ARCHITECTURE

```
EchoTrace System (Localhost)
├── Frontend (Static)
│   └── http://localhost:3000 or via PHP server
│       Files: frontend/index.html, frontend/js/*, frontend/css/*
│
├── Backend (PHP REST API)
│   └── http://localhost:8000/api/index.php (or via Laragon/Apache)
│       Controllers: backend/controllers/*
│       Database: backend/config/database.php
│
├── Python AI Engine
│   └── http://localhost:5000
│       Flask routes: python_ai/app.py
│       ML Models: python_ai/models/*.py
│
├── Database (MySQL)
│   └── 127.0.0.1:3306 (echotrace database)
│       Schema: database/echotrace.sql
│
└── Chrome Extension
    └── Load from chrome://extensions (Developer mode)
        Files: chrome_extension/manifest.json
```

---

## STEP 5: Install Chrome Extension

Once frontend is accessible:

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Navigate to `C:\Users\PC\OneDrive\Desktop\capsatone2\chrome_extension`
5. Click **Select Folder**
6. Extension will load and appear in your toolbar

---

## VERIFICATION CHECKLIST

### ✅ Database Ready
```powershell
# Check if tables exist by accessing frontend login
# Default credentials:
# - Admin: admin / Admin123!
# - User: user / User123!
```

### ✅ Python AI Service
```powershell
curl http://localhost:5000/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "EchoTrace AI Engine",
  "timestamp": 1234567890
}
```

### ✅ PHP API
```powershell
curl http://localhost:8000/api/index.php?action=health
```

### ✅ Frontend Loads
Open browser to frontend URL and verify you see login page

---

## TROUBLESHOOTING

### MySQL Connection Error
- Ensure MySQL service is running
- Check credentials in `backend/config/database.php` (root, no password)
- Verify port 3306 is available

### Python Dependencies Missing
```powershell
cd python_ai
py -m pip install -r requirements.txt
```

### Port Already in Use
- Python (5000): `netstat -ano | findstr :5000`
- PHP (8000): `netstat -ano | findstr :8000`
- MySQL (3306): `netstat -ano | findstr :3306`

### Database Tables Not Created
- The PHP backend auto-creates tables on first request
- Check `backend/config/database.php` → `runMigrations()`

### Chrome Extension Not Loading
- Ensure you're in Developer mode
- Clear browser cache (Ctrl+Shift+Del)
- Reload extension from extensions page

---

## QUICK START (All 3 Terminals)

### Terminal 1: Python AI Service
```powershell
cd C:\Users\PC\OneDrive\Desktop\capsatone2
py python_ai/app.py
```

### Terminal 2: PHP Backend (if not using Laragon)
```powershell
cd C:\Users\PC\OneDrive\Desktop\capsatone2\backend
php -S localhost:8000
```

### Terminal 3: Access Frontend
```powershell
# Open browser to:
# http://localhost:8000/../frontend/
# or via Laragon/Apache
```

---

## Next Steps

1. **Manual Scan:** Login → Dashboard → New Manual Scan → Execute Review Audit
2. **Chrome Extension:** Visit Amazon product page → Click "Audit with EchoTrace" button
3. **Admin Panel:** Login as admin → View analytics and manage users

---

**System Ready!** 🚀
