# EchoTrace - Quick Start Guide

## System Running Status
- ✅ Python 3.14.3 installed
- ✅ All dependencies installed (Flask, MySQL Connector, scikit-learn, NLTK)
- ⚠️ **MySQL must be started first** (via Laragon or XAMPP)

---

## 🚀 START HERE (Copy & Paste Commands)

### Step 1: Start MySQL Server
**Via Laragon (Recommended):**
1. Open Laragon from Start menu
2. Click **"Start All"** button
3. Wait 30 seconds

**OR Via XAMPP:**
1. Open XAMPP Control Panel
2. Click "Start" next to MySQL and Apache
3. Wait 30 seconds

---

### Step 2: Start Python AI Service
**Open PowerShell and run:**
```powershell
cd "C:\Users\PC\OneDrive\Desktop\capsatone2"
py python_ai/app.py
```

**Expected output:**
```
 * Running on http://127.0.0.1:5000
 * Press CTRL+C to quit
```

✅ **Keep this window open!**

---

### Step 3: Start Backend Server (Optional - if not using Laragon)

**Open NEW PowerShell and run:**
```powershell
cd "C:\Users\PC\OneDrive\Desktop\capsatone2\backend"
php -S localhost:8000
```

**Expected output:**
```
[MON JAN 01 00:00:00 2024] PHP 8.0.0 Development Server started at localhost:8000
```

✅ **Keep this window open!**

---

### Step 4: Open Frontend in Browser

**Open your web browser and go to:**

If using Laragon:
```
http://localhost/capsatone2/frontend/
```

If using PHP server:
```
http://localhost:8000/../frontend/
```

---

### Step 5: Login

Use these credentials:

**Admin Account:**
- Username: `admin`
- Password: `Admin123!`

**OR Demo User:**
- Username: `user`
- Password: `User123!`

---

## ✅ Verification Commands

```powershell
# Test MySQL connection
py -c "import mysql.connector; mysql.connector.connect(host='127.0.0.1', user='root', password=''); print('✓ MySQL OK')"

# Test Python AI service
curl http://127.0.0.1:5000/health

# Test PHP Backend
curl http://localhost:8000/api/index.php?action=health
```

---

## 📋 Summary

| Component | URL | Status |
|-----------|-----|--------|
| MySQL Database | 127.0.0.1:3306 | Auto-start with Python |
| Python AI Engine | http://127.0.0.1:5000 | Terminal 2 |
| Backend API | http://localhost:8000 | Terminal 3 (or Laragon) |
| Frontend | http://localhost:8000/../frontend/ | Browser |
| Chrome Extension | chrome://extensions | Load from folder |

---

## 🔧 Troubleshooting

**Q: "MySQL connection refused"**
- A: Start MySQL in Laragon/XAMPP first!

**Q: "Port 5000 already in use"**
- A: `netstat -ano | findstr :5000` then `taskkill /PID <number> /F`

**Q: "Frontend won't load"**
- A: Clear cache (Ctrl+Shift+Delete) and refresh

**Q: "Can't login"**
- A: Database auto-creates on first backend request. Reload page.

---

## 📱 Feature Quick Test

1. **Manual Scan:**
   - Dashboard → "New Manual Scan"
   - Enter Amazon product details
   - Click "Load Sample Reviews"
   - Click "Execute Review Audit"
   - See trust score and flagged reviews

2. **Chrome Extension:**
   - Go to amazon.com
   - Search and open any product
   - Click "Audit with EchoTrace" button
   - See review analysis overlay

---

**Everything is ready!** Follow Steps 1-5 above. 🎉
