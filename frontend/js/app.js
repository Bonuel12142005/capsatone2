// frontend/js/app.js

document.addEventListener('DOMContentLoaded', () => {
    // Initial setup
    initApp();
    
    // Listen for auth state changes
    window.addEventListener('authChange', () => {
        updateNavbar();
        
        // If logged out and on a protected page, navigate to landing
        const currentHash = window.location.hash.substring(1) || 'landing';
        const protectedPages = ['dashboard', 'report', 'profile', 'admin', 'rag-assistant'];
        if (!EchoTraceAuth.isAuthenticated() && protectedPages.includes(currentHash)) {
            navigateTo('landing');
        } else if (EchoTraceAuth.isAuthenticated() && currentHash === 'login') {
            navigateTo('dashboard');
        }
    });

    // Hash change listener for browser navigation
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.substring(1) || 'landing';
        handleRoute(hash);
    });
});

let currentActiveSection = 'view-landing';
let loadedReportReviews = []; // Cache reviews for filtering
let loadedReportData = null; // Cache report data for export

const initApp = () => {
    // Check if token is passed in URL (from extension redirect)
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    
    console.log("[App] Initializing... Token from URL:", tokenFromUrl ? tokenFromUrl.substring(0, 20) + "..." : "NO");
    
    if (tokenFromUrl) {
        // Auto-login with token from extension
        console.log("[App] Setting token to localStorage...");
        localStorage.setItem('echotrace_token', tokenFromUrl);
        sessionStorage.setItem('session_initialized', 'true');
        
        console.log("[App] Token stored. Now fetching user profile...");
        
        // Fetch user profile with explicit headers
        fetch('http://localhost:8000/api/index.php?route=auth/profile', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokenFromUrl}`
            }
        })
        .then(res => {
            console.log("[App] Profile response status:", res.status);
            return res.json();
        })
        .then(response => {
            console.log("[App] Profile response:", response);
            if (response.success && response.user) {
                console.log("[App] Setting user data and dispatching authChange");
                localStorage.setItem('echotrace_user', JSON.stringify(response.user));
                window.dispatchEvent(new Event('authChange'));
                
                // Remove token from URL to clean it up
                window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
            } else {
                console.warn("[App] Profile response not successful:", response.error);
            }
        })
        .catch(err => {
            console.error("[App] Failed to fetch user profile:", err.message);
        });
    } else {
        console.log("[App] No token in URL, proceeding with normal init");
    }
    
    // Render Icons
    lucide.createIcons();
    
    // Check initial auth
    updateNavbar();
    
    // Handle initial route
    const hash = window.location.hash.substring(1) || 'landing';
    console.log("[App] Navigating to route:", hash);
    handleRoute(hash);
};

const updateNavbar = () => {
    const isAuth = EchoTraceAuth.isAuthenticated();
    const isAdmin = EchoTraceAuth.isAdmin();
    
    // Show/hide guest vs auth nav links (Desktop)
    const guestOnly = document.getElementById('nav-auth-guest');
    const userOnly = document.getElementById('nav-auth-user');
    
    // Show/hide guest vs auth nav links (Mobile Sidebar)
    const sidebarGuestOnly = document.getElementById('sidebar-auth-guest');
    const sidebarUserOnly = document.getElementById('sidebar-auth-user');
    
    if (isAuth) {
        if (guestOnly) guestOnly.classList.add('hidden');
        if (userOnly) userOnly.classList.remove('hidden');
        if (sidebarGuestOnly) sidebarGuestOnly.classList.add('hidden');
        if (sidebarUserOnly) sidebarUserOnly.classList.remove('hidden');
        
        const user = EchoTraceAuth.getUser();
        const username = user ? user.username : 'Profile';
        
        const navUsernameEl = document.getElementById('nav-username');
        if (navUsernameEl) navUsernameEl.textContent = username;
        
        const sidebarUsernameEl = document.getElementById('sidebar-username');
        if (sidebarUsernameEl) sidebarUsernameEl.textContent = username;
        
        // Show auth links
        document.querySelectorAll('.auth-only').forEach(el => el.classList.remove('hidden'));
    } else {
        if (guestOnly) guestOnly.classList.remove('hidden');
        if (userOnly) userOnly.classList.add('hidden');
        if (sidebarGuestOnly) sidebarGuestOnly.classList.remove('hidden');
        if (sidebarUserOnly) sidebarUserOnly.classList.add('hidden');
        
        // Hide auth links
        document.querySelectorAll('.auth-only').forEach(el => el.classList.add('hidden'));
    }

    if (isAdmin) {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    } else {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
    }
    
    lucide.createIcons();
};

const toggleMobileMenu = () => {
    const sidebar = document.getElementById('mobile-sidebar');
    const panel = document.getElementById('mobile-sidebar-panel');
    if (!sidebar || !panel) return;

    if (sidebar.classList.contains('hidden')) {
        // Open Mobile Sidebar
        sidebar.classList.remove('hidden');
        // Force reflow
        void sidebar.offsetWidth;
        panel.classList.remove('translate-x-full');
        panel.classList.add('translate-x-0');
    } else {
        // Close Mobile Sidebar
        panel.classList.remove('translate-x-0');
        panel.classList.add('translate-x-full');
        // Wait for slide-out animation to complete (300ms) before hiding block
        setTimeout(() => {
            sidebar.classList.add('hidden');
        }, 300);
    }
    
    // Ensure Lucide icon elements render inside the sidebar
    lucide.createIcons();
};

const navigateTo = (pageName, params = '') => {
    window.location.hash = pageName + (params ? `?${params}` : '');
};

const handleRoute = (routeString) => {
    // Parse params if any
    const parts = routeString.split('?');
    const page = parts[0];
    const params = new URLSearchParams(parts[1] || '');

    const targetSectionId = `view-${page}`;
    const targetElement = document.getElementById(targetSectionId);

    if (!targetElement) {
        // Fallback to landing if section doesn't exist
        showSection('view-landing');
        return;
    }

    // Auth Route Guard
    const protectedPages = ['dashboard', 'profile', 'admin', 'rag-assistant'];
    if (protectedPages.includes(page) && !EchoTraceAuth.isAuthenticated()) {
        navigateTo('login');
        return;
    }

    // Admin Route Guard
    if (page === 'admin' && !EchoTraceAuth.isAdmin()) {
        navigateTo('dashboard');
        return;
    }

    showSection(targetSectionId);

    // Route-specific loader actions
    if (page === 'dashboard') {
        loadDashboardData();
    } else if (page === 'report') {
        const scanId = params.get('scan_id');
        if (scanId) {
            loadReportData(scanId);
        } else {
            navigateTo('dashboard');
        }
    } else if (page === 'profile') {
        loadProfileData();
    } else if (page === 'admin') {
        loadAdminData();
    } else if (page === 'rag-assistant') {
        loadRagAssistant();
    }
};

const showSection = (sectionId) => {
    document.querySelectorAll('.view-section').forEach(sec => {
        sec.classList.add('hidden');
    });
    const activeSec = document.getElementById(sectionId);
    activeSec.classList.remove('hidden');
    
    // Update active nav link styles if necessary
    lucide.createIcons();
};

// --- AUTHENTICATION ACTIONS ---

const submitLogin = async (e) => {
    e.preventDefault();
    const loginInput = document.getElementById('login-input').value;
    const loginPass = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    
    errorEl.classList.add('hidden');
    
    const res = await EchoTraceAuth.login(loginInput, loginPass);
    if (res.success) {
        navigateTo('dashboard');
    } else {
        errorEl.textContent = res.error || "Login credentials incorrect.";
        errorEl.classList.remove('hidden');
    }
};

const submitRegister = async (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const errorEl = document.getElementById('register-error');
    const successEl = document.getElementById('register-success');
    
    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');
    
    const res = await EchoTraceAuth.register(username, email, password);
    if (res.success) {
        successEl.textContent = res.message || "Registration completed. You can login now!";
        successEl.classList.remove('hidden');
        document.getElementById('register-form').reset();
        setTimeout(() => navigateTo('login'), 2000);
    } else {
        errorEl.textContent = res.error || "Failed to create account.";
        errorEl.classList.remove('hidden');
    }
};

const handleLogout = () => {
    EchoTraceAuth.logout();
    navigateTo('landing');
};

// --- PROFILE & SETTINGS ---

const loadProfileData = () => {
    const user = EchoTraceAuth.getUser();
    if (user) {
        document.getElementById('profile-username').value = user.username || '';
        document.getElementById('profile-email').value = user.email || '';
    }
};

const submitContactForm = async (e) => {
    e.preventDefault();
    const name = document.getElementById('contact-name').value;
    const email = document.getElementById('contact-email').value;
    const subject = document.getElementById('contact-subject').value;
    const message = document.getElementById('contact-message').value;
    const msgEl = document.getElementById('contact-msg');
    
    msgEl.classList.add('hidden');
    
    try {
        const res = await EchoTraceAPI.post('support/contact', { name, email, subject, message });
        if (res.success) {
            msgEl.className = "p-3 text-xs rounded-xl text-center bg-emerald-500/10 text-emerald-400";
            msgEl.textContent = res.message || "Thank you! Your message has been sent successfully.";
            msgEl.classList.remove('hidden');
            document.getElementById('contact-form').reset();
        } else {
            msgEl.className = "p-3 text-xs rounded-xl text-center bg-rose-500/10 text-rose-400";
            msgEl.textContent = res.error || "Failed to submit message.";
            msgEl.classList.remove('hidden');
        }
    } catch (err) {
        msgEl.className = "p-3 text-xs rounded-xl text-center bg-rose-500/10 text-rose-400";
        msgEl.textContent = err.message || "An unexpected error occurred.";
        msgEl.classList.remove('hidden');
    }
};

const submitProfile = async (e) => {
    e.preventDefault();
    const username = document.getElementById('profile-username').value;
    const email = document.getElementById('profile-email').value;
    const msgEl = document.getElementById('profile-msg');
    
    msgEl.classList.add('hidden');
    
    const res = await EchoTraceAuth.updateProfile(username, email);
    if (res.success) {
        msgEl.className = "p-3 text-xs rounded-xl text-center bg-emerald-500/10 text-emerald-400";
        msgEl.textContent = res.message;
        msgEl.classList.remove('hidden');
    } else {
        msgEl.className = "p-3 text-xs rounded-xl text-center bg-rose-500/10 text-rose-400";
        msgEl.textContent = res.error;
        msgEl.classList.remove('hidden');
    }
};

const submitPassword = async (e) => {
    e.preventDefault();
    const oldPass = document.getElementById('pass-old').value;
    const newPass = document.getElementById('pass-new').value;
    const confirmPass = document.getElementById('pass-confirm').value;
    const msgEl = document.getElementById('password-msg');
    
    msgEl.classList.add('hidden');
    
    if (newPass !== confirmPass) {
        msgEl.className = "p-3 text-xs rounded-xl text-center bg-rose-500/10 text-rose-400";
        msgEl.textContent = "New passwords do not match.";
        msgEl.classList.remove('hidden');
        return;
    }
    
    const res = await EchoTraceAuth.changePassword(oldPass, newPass);
    if (res.success) {
        msgEl.className = "p-3 text-xs rounded-xl text-center bg-emerald-500/10 text-emerald-400";
        msgEl.textContent = res.message;
        msgEl.classList.remove('hidden');
        document.getElementById('password-form').reset();
    } else {
        msgEl.className = "p-3 text-xs rounded-xl text-center bg-rose-500/10 text-rose-400";
        msgEl.textContent = res.error;
        msgEl.classList.remove('hidden');
    }
};

// --- USER DASHBOARD ACTIONS ---

let allScans = [];
const loadDashboardData = async () => {
    try {
        const user = EchoTraceAuth.getUser();
        if (user) {
            document.getElementById('dashboard-welcome').textContent = `Welcome back, ${user.username}`;
        }
        
        const data = await EchoTraceAPI.get('scan/history');
        if (data.success) {
            allScans = data.history;
            populateHistoryTable(allScans);
            
            // Calculate stats based on history
            const totalScans = allScans.length;
            let fakeCount = 0;
            let genuineCount = 0;
            let sumTrust = 0.0;
            
            allScans.forEach(s => {
                fakeCount += parseInt(s.fake_count || 0);
                genuineCount += parseInt(s.genuine_count || 0);
                sumTrust += parseFloat(s.trust_score || 0.0);
            });
            
            const avgTrust = totalScans > 0 ? (sumTrust / totalScans) : 0;
            
            document.getElementById('stat-scans').textContent = totalScans;
            document.getElementById('stat-fakes').textContent = fakeCount;
            document.getElementById('stat-genuines').textContent = genuineCount;
            document.getElementById('stat-accuracy').textContent = totalScans > 0 ? `${avgTrust.toFixed(2)}%` : "0.00%";
            
            // Build Charts
            // Create a small list of platforms for distribution
            const platforms = {};
            allScans.forEach(s => {
                const plat = s.platform || 'unknown';
                platforms[plat] = (platforms[plat] || 0) + 1;
            });
            const platformList = Object.keys(platforms).map(k => ({ platform: k, count: platforms[k] }));

            // Take last 7 scans chronologically (reverse to show left-to-right)
            const recentScansForChart = [...allScans].slice(0, 7).reverse();
            
            EchoTraceCharts.renderDashboardCharts(recentScansForChart, platformList);
        }
    } catch (e) {
        console.error("Dashboard error:", e);
    }
};

const populateHistoryTable = (scans) => {
    const tbody = document.getElementById('history-table-body');
    tbody.innerHTML = '';
    
    if (scans.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-8 text-center text-gray-500">No scan history found. Run a new scan above.</td>
            </tr>
        `;
        return;
    }
    
    scans.forEach(s => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-glassBorder/10 transition-colors";
        
        const platformBadge = `<span class="px-2.5 py-1 text-[10px] font-bold rounded-lg border uppercase ${
            s.platform === 'amazon' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
            s.platform === 'shopee' ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' :
            'bg-sky-500/10 border-sky-500/20 text-sky-400'
        }">${s.platform}</span>`;
        
        const trustPct = parseFloat(s.trust_score);
        const trustClass = trustPct >= 80 ? 'text-emerald-400' : (trustPct >= 50 ? 'text-amber-400' : 'text-rose-400');
        
        const date = new Date(s.scan_date).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        tr.innerHTML = `
            <td class="p-4">${platformBadge}</td>
            <td class="p-4 font-semibold text-white max-w-xs truncate">${s.product_title}</td>
            <td class="p-4 font-bold ${trustClass}">${trustPct.toFixed(2)}%</td>
            <td class="p-4 text-rose-400">${s.fake_count} / ${parseInt(s.fake_count) + parseInt(s.genuine_count)}</td>
            <td class="p-4 text-gray-400 text-xs">${date}</td>
            <td class="p-4 text-center">
                <button onclick="navigateTo('report', 'scan_id=${s.id}')" class="text-xs bg-emeraldGreen/10 border border-emeraldGreen/30 text-emeraldGreen px-3 py-1 rounded-lg hover:bg-emeraldGreen hover:text-white transition-all">
                    View Report
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

const filterHistory = () => {
    const q = document.getElementById('history-search').value.toLowerCase();
    const filtered = allScans.filter(s => 
        s.product_title.toLowerCase().includes(q) || 
        s.platform.toLowerCase().includes(q)
    );
    populateHistoryTable(filtered);
};

// --- MANUAL SCAN ACTIONS ---

const openScanModal = () => {
    document.getElementById('scan-modal').classList.remove('hidden');
};

const closeScanModal = () => {
    document.getElementById('scan-modal').classList.add('hidden');
    document.getElementById('scan-form').reset();
    document.getElementById('scan-error').classList.add('hidden');
};

const loadSampleReviews = () => {
    const samples = [
        {
            "author": "TechLover88",
            "rating": 5,
            "text": "AMAZING product! Click here for 20% discount coupon code: PROMO20. The material is the absolute best quality you can buy now! Five stars all the way!!!",
            "date": "July 12, 2026",
            "id": "R1"
        },
        {
            "author": "TechLover88",
            "rating": 5,
            "text": "AMAZING product! Click here for 20% discount coupon code: PROMO20. The material is the absolute best quality you can buy now! Five stars all the way!!!",
            "date": "July 12, 2026",
            "id": "R2"
        },
        {
            "author": "GamerDude",
            "rating": 2,
            "text": "Battery life is extremely short, the plastic feels cheap. However, shipping was quick.",
            "date": "July 10, 2026",
            "id": "R3"
        },
        {
            "author": "Alice M.",
            "rating": 4,
            "text": "Works as described. Standard headset, fits well and sounds clear. No complaints so far.",
            "date": "July 08, 2026",
            "id": "R4"
        },
        {
            "author": "SpamBot99",
            "rating": 5,
            "text": "I got this product for free in exchange for an honest review. The quality is flawless and majestic. Highly recommended, buy now!",
            "date": "July 05, 2026",
            "id": "R5"
        }
    ];
    document.getElementById('scan-reviews').value = JSON.stringify(samples, null, 2);
};

const submitScan = async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('scan-error');
    const loaderEl = document.getElementById('scan-loader');
    
    errorEl.classList.add('hidden');
    loaderEl.classList.remove('hidden');

    const platform = document.getElementById('scan-platform').value.trim();
    const extId = document.getElementById('scan-ext-id').value.trim();
    const title = document.getElementById('scan-title').value.trim();
    const url = document.getElementById('scan-url').value.trim();

    // Validation: Product must be selected/filled
    if (!platform || !extId || !title || !url) {
        loaderEl.classList.add('hidden');
        errorEl.textContent = "Please fill in all product details (Platform, Product ID, Title, URL).";
        errorEl.classList.remove('hidden');
        return;
    }

    const image = document.getElementById('scan-image').value || '';
    const rating = parseFloat(document.getElementById('scan-rating').value);
    const rawReviews = document.getElementById('scan-reviews').value.trim();

    // Validation: Reviews must be provided
    if (!rawReviews) {
        loaderEl.classList.add('hidden');
        errorEl.textContent = "Please provide at least one review to scan.";
        errorEl.classList.remove('hidden');
        return;
    }

    let reviewsList = [];
    try {
        if (rawReviews.startsWith('[') || rawReviews.startsWith('{')) {
            reviewsList = JSON.parse(rawReviews);
            if (!Array.isArray(reviewsList)) {
                reviewsList = [reviewsList];
            }
        } else {
            // Text by line
            reviewsList = rawReviews.split('\n').filter(l => l.trim() !== '').map((line, idx) => ({
                id: `M${idx}`,
                author: `User_${idx}`,
                rating: 5,
                text: line.trim(),
                date: 'Recent'
            }));
        }
    } catch (err) {
        loaderEl.classList.add('hidden');
        errorEl.textContent = "Reviews format invalid. Provide a valid JSON list or standard text lines.";
        errorEl.classList.remove('hidden');
        return;
    }

    try {
        const payload = {
            platform,
            external_id: extId,
            title,
            url,
            image_url: image,
            rating,
            reviews: reviewsList
        };

        const res = await EchoTraceAPI.post('scan', payload);
        loaderEl.classList.add('hidden');
        if (res.success && res.scan_id) {
            closeScanModal();
            navigateTo('report', `scan_id=${res.scan_id}`);
        } else {
            errorEl.textContent = res.error || "Analysis execute failure.";
            errorEl.classList.remove('hidden');
        }
    } catch (err) {
        loaderEl.classList.add('hidden');
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
    }
};

// --- REPORT ANALYSIS ACTIONS ---

const loadReportData = async (scanId) => {
    try {
        const res = await EchoTraceAPI.get(`scan/report&scan_id=${scanId}`);
        if (res.success) {
            renderReportView(res);
        } else {
            navigateTo('dashboard');
        }
    } catch (e) {
        console.error("Failed to load report", e);
        navigateTo('dashboard');
    }
};

const renderReportView = (data) => {
    try {
        const report = data.report;
        loadedReportReviews = data.reviews || [];
        // Cache full report data for export
        loadedReportData = { ...report, reviews: data.reviews };

        // Helper for safe element text/attr setting
        const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
        const setAttr = (id, attr, val) => { const el = document.getElementById(id); if (el) el[attr] = val; };

        // Set texts
        setText('report-title', report.product_title);
        setText('report-meta', `${(report.platform || '').toUpperCase()} | ID: ${report.external_id || ''}`);
        
        setText('report-prod-platform', report.platform);
        setText('report-prod-title', report.product_title);
        setText('report-prod-rating', `${parseFloat(report.product_rating || 0).toFixed(1)} / 5.0`);
        const imgEl = document.getElementById('report-prod-img');
        if (imgEl) {
            if (report.image_url && report.image_url.trim() !== '') {
                imgEl.src = report.image_url;
                imgEl.className = "w-20 h-20 object-cover rounded-xl border border-glassBorder bg-darkBg";
            } else {
                const platform = (report.platform || '').toLowerCase();
                if (platform === 'shopee') {
                    imgEl.src = 'https://upload.wikimedia.org/wikipedia/commons/0/0e/Shopee_logo.svg';
                    imgEl.className = "w-20 h-20 object-contain p-3.5 rounded-xl border border-[#f53d2d]/30 bg-[#f53d2d]/10";
                } else if (platform === 'amazon') {
                    imgEl.src = 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg';
                    imgEl.className = "w-20 h-20 object-contain p-3 rounded-xl border border-[#ff9900]/30 bg-[#ff9900]/10";
                } else {
                    imgEl.src = 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=120';
                    imgEl.className = "w-20 h-20 object-cover rounded-xl border border-glassBorder bg-darkBg";
                }
            }
        }
        setAttr('report-prod-url', 'href', report.product_url || '#');

        // Overall Quality Display
        const quality = report.overall_quality || 'Good';
        const qualityEl = document.getElementById('report-quality');
        if (qualityEl) {
            qualityEl.textContent = quality;
            qualityEl.className = `px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                quality === 'Excellent' ? 'bg-emerald-500/10 text-emerald-400' :
                quality === 'Good' ? 'bg-sky-500/10 text-sky-400' :
                quality === 'Average' ? 'bg-amber-500/10 text-amber-400' :
                'bg-rose-500/10 text-rose-400'
            }`;
        }

        // Summary of Genuine Reviews Display
        setText('report-genuine-summary', report.genuine_summary || 'No summary available.');

        const trustScore = parseFloat(report.trust_score || 0);
        const scorePctEl = document.getElementById('report-trust-score-pct');
        if (scorePctEl) scorePctEl.textContent = `${trustScore.toFixed(1)}%`;

        const riskLevel = (report.risk_level || 'Low Risk').toUpperCase();
        const riskEl = document.getElementById('report-risk-level');
        let verdictText = '';
        if (riskEl) {
            riskEl.textContent = riskLevel;
            if (riskLevel.includes('LOW')) {
                riskEl.className = "text-[10px] text-emerald-400 font-bold uppercase tracking-wider mt-1";
                verdictText = "The reviews profile looks highly genuine. The rating represents real sentiment.";
            } else if (riskLevel.includes('MEDIUM') || riskLevel.includes('MODERATE')) {
                riskEl.className = "text-[10px] text-amber-400 font-bold uppercase tracking-wider mt-1";
                verdictText = "Moderate suspicious profiles detected (duplications/spam phrasing). Evaluate reviews carefully.";
            } else {
                riskEl.className = "text-[10px] text-rose-400 font-bold uppercase tracking-wider mt-1";
                verdictText = "High quantity of duplicate, toxic, or AI-generated reviews detected. Exercise strong caution.";
            }
        }
        setText('report-verdict', verdictText);

        // Render Doughnut Chart
        const fakeCount = parseInt(report.fake_count || 0);
        const genuineCount = parseInt(report.genuine_count || 0);
        EchoTraceCharts.renderReportCharts(fakeCount, genuineCount);

        // Render Strengths/Weaknesses
        const strengthsUl = document.getElementById('report-strengths');
        if (strengthsUl) {
            strengthsUl.innerHTML = '';
            (report.summary_strengths || []).forEach(s => {
                const li = document.createElement('li');
                li.textContent = s;
                strengthsUl.appendChild(li);
            });
        }

        const weaknessesUl = document.getElementById('report-weaknesses');
        if (weaknessesUl) {
            weaknessesUl.innerHTML = '';
            (report.summary_weaknesses || []).forEach(w => {
                const li = document.createElement('li');
                li.textContent = w;
                weaknessesUl.appendChild(li);
            });
        }

        // Render RAG Policy Grounding & Executive Synthesis Card
        const ragSynth = data.rag_synthesis || report.rag_synthesis || null;
        const ragSummaryTextEl = document.getElementById('report-rag-summary-text');
        const ragBadgeEl = document.getElementById('report-rag-risk-badge');
        const ragCitationsEl = document.getElementById('report-rag-citations');

        if (ragSummaryTextEl) {
            if (ragSynth && ragSynth.rag_executive_summary) {
                ragSummaryTextEl.textContent = ragSynth.rag_executive_summary;
                
                if (ragBadgeEl) {
                    const statusText = ragSynth.status || (trustScore >= 80 ? 'VERIFIED AUTHENTIC' : 'HIGH MANIPULATION WARNING');
                    ragBadgeEl.textContent = statusText;
                    if (trustScore >= 80) {
                        ragBadgeEl.className = 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
                    } else if (trustScore >= 60) {
                        ragBadgeEl.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30';
                    } else {
                        ragBadgeEl.className = 'px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30';
                    }
                }

                if (ragCitationsEl) {
                    ragCitationsEl.innerHTML = '<span class="text-gray-400 text-xs font-semibold mr-2">Policy Citations:</span>';
                    const citations = ragSynth.policy_grounding_citations || [];
                    if (citations.length > 0) {
                        citations.forEach(c => {
                            const tag = document.createElement('span');
                            tag.className = 'bg-emerald-500/10 text-emerald-300 text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-emerald-500/20 flex items-center space-x-1';
                            tag.innerHTML = `<i data-lucide="book-open" class="w-3 h-3 text-emerald-400"></i> <span>${c.title}</span>`;
                            ragCitationsEl.appendChild(tag);
                        });
                    } else {
                        ragCitationsEl.innerHTML += '<span class="text-gray-500 text-xs italic">FTC 16 CFR Part 255 & E-Commerce Guidelines</span>';
                    }
                }
            } else {
                ragSummaryTextEl.textContent = `EchoTrace RAG Policy Audit: Analysis for '${report.product_title}' indicates a Trust Score of ${trustScore.toFixed(1)}%. Audit results cross-referenced against FTC guidelines and platform conduct rules.`;
                if (ragBadgeEl) ragBadgeEl.textContent = trustScore >= 80 ? 'LOW RISK AUDIT' : 'POLICY CAUTION';
            }
        }

        // Populate reviews list
        populateReportReviews(loadedReportReviews);
    } catch (err) {
        console.error('Failed to render report view:', err);
    }
};

const populateReportReviews = (reviews) => {
    const listContainer = document.getElementById('report-reviews-list');
    listContainer.innerHTML = '';

    if (reviews.length === 0) {
        listContainer.innerHTML = `<p class="text-xs text-gray-500 text-center py-8">No matching reviews found.</p>`;
        return;
    }

    reviews.forEach(r => {
        const card = document.createElement('div');
        const isFake = parseInt(r.is_fake) === 1;
        
        card.className = `p-4 rounded-xl border text-xs flex flex-col justify-between space-y-3 transition-all ${
            isFake 
            ? 'bg-rose-500/10 border-rose-500/25' 
            : 'bg-glassBg border-glassBorder hover:border-emeraldGreen/30'
        }`;

        // Stars mapping
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            stars += `<i data-lucide="star" class="w-3.5 h-3.5 ${i <= r.rating ? 'text-yellow-500 fill-current' : 'text-gray-600'}"></i>`;
        }

        // Reasons badge if fake
        let reasonBadges = '';
        if (isFake) {
            const reasons = JSON.parse(r.fake_reasons || '[]');
            reasons.forEach(reason => {
                reasonBadges += `<span class="bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded text-[9px] font-semibold">${reason}</span>`;
            });
        }

        const dateStr = r.review_date ? r.review_date : 'Unknown Date';
        const toxicityInfo = parseFloat(r.toxicity) > 0 ? `<span class="text-rose-400 font-semibold ml-2">Toxicity: ${r.toxicity}%</span>` : '';
        const duplicateInfo = r.duplicate_group_id ? `<span class="text-amber-400 font-semibold ml-2">Duplicate ID: ${r.duplicate_group_id}</span>` : '';

        // Classification badge
        const classification = r.classification || (isFake ? "Suspicious Review" : "Genuine Review");
        const classBadgeColor = isFake ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400";
        const classBadge = `<span class="px-2 py-0.5 rounded text-[9px] font-bold ${classBadgeColor}">${classification}</span>`;

        // Risk level badge
        const reviewRiskLevel = r.risk_level || (isFake ? "Medium Risk" : "Low Risk");
        let riskColorClass = 'text-emerald-400';
        if (reviewRiskLevel.includes('High')) riskColorClass = 'text-rose-400';
        else if (reviewRiskLevel.includes('Medium')) riskColorClass = 'text-amber-400';
        const riskInfo = `<span class="text-gray-500 text-[10px] ml-2">Risk: <b class="${riskColorClass}">${reviewRiskLevel}</b></span>`;

        // Intent badge mapping
        const intent = r.intent || 'Feedback';
        let intentColorClass = 'bg-sky-500/10 text-sky-400';
        if (intent === 'Complaint') intentColorClass = 'bg-rose-500/10 text-rose-400';
        else if (intent === 'Inquiry') intentColorClass = 'bg-amber-500/10 text-amber-400';
        else if (intent === 'Recommendation') intentColorClass = 'bg-emerald-500/10 text-emerald-400';
        const intentBadge = `<span class="px-2 py-0.5 rounded text-[9px] font-bold ${intentColorClass}">${intent}</span>`;

        // Grammar score styling
        const grammarVal = parseFloat(r.grammar_score || 100);
        let grammarColorClass = 'text-emerald-400';
        if (grammarVal < 50) grammarColorClass = 'text-rose-400';
        else if (grammarVal < 80) grammarColorClass = 'text-amber-400';
        const grammarInfo = `<span class="text-gray-500 text-[10px] ml-2">Grammar: <b class="${grammarColorClass}">${grammarVal.toFixed(0)}%</b></span>`;

        // Keyword tags parsing
        let keywordTags = '';
        try {
            const keywords = typeof r.keywords === 'string' ? JSON.parse(r.keywords || '[]') : (r.keywords || []);
            if (Array.isArray(keywords)) {
                keywords.forEach(kw => {
                    keywordTags += `<span class="bg-gray-500/10 text-gray-400 px-1.5 py-0.5 rounded text-[8px] border border-glassBorder/30">#${kw}</span>`;
                });
            }
        } catch (e) {
            console.error('Error parsing keywords:', e);
        }

        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex items-center space-x-3">
                    <span class="font-bold text-gray-200">${r.author}</span>
                    <span class="text-gray-500 text-[10px]">${dateStr}</span>
                    <span class="flex items-center space-x-0.5">${stars}</span>
                </div>
                <div class="flex items-center space-x-2">
                    ${classBadge}
                    ${riskInfo}
                    ${intentBadge}
                    <span class="capitalize px-2 py-0.5 rounded text-[9px] font-bold ${
                        r.sentiment === 'positive' ? 'bg-emerald-500/10 text-emerald-400' :
                        r.sentiment === 'negative' ? 'bg-rose-500/10 text-rose-400' :
                        'bg-gray-500/10 text-gray-400'
                    }">${r.sentiment}</span>
                    <span class="text-gray-500 text-[10px]">Emotion: <b class="text-sky-400 capitalize">${r.emotion || 'neutral'}</b></span>
                    ${grammarInfo}
                    ${toxicityInfo}
                    ${duplicateInfo}
                </div>
            </div>
            
            <p class="text-gray-300 italic leading-relaxed">"${r.review_text}"</p>
            
            ${r.rag_explanation && r.rag_explanation.rag_explanation ? `
                <div class="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-[11px] text-emerald-300/90 leading-relaxed flex items-start space-x-2">
                    <i data-lucide="shield-alert" class="w-4 h-4 text-emerald-400 shrink-0 mt-0.5"></i>
                    <div>
                        <span class="font-bold text-emerald-400">RAG Grounding:</span> ${r.rag_explanation.rag_explanation}
                    </div>
                </div>
            ` : ''}

            <div class="flex justify-between items-center pt-2 border-t border-glassBorder/40">
                <div class="flex flex-wrap gap-1 items-center">
                    ${reasonBadges}
                    ${keywordTags}
                </div>
                <div class="flex items-center space-x-3">
                    <span class="text-gray-400">AI Confidence: <b class="${isFake ? 'text-rose-400' : 'text-emerald-400'}">${parseFloat(r.confidence_score).toFixed(1)}%</b></span>
                    <button onclick="reportReviewCorrection(${r.id}, '${isFake ? 'genuine' : 'fake'}')" class="text-emerald-400 hover:text-emerald-300 font-semibold hover:underline">
                         Report Correction
                    </button>
                </div>
            </div>
        `;

        listContainer.appendChild(card);
    });

    lucide.createIcons();
};

const filterReportReviews = () => {
    const filter = document.getElementById('review-filter-label').value;
    let filtered = loadedReportReviews;

    if (filter === 'fake') {
        filtered = loadedReportReviews.filter(r => parseInt(r.is_fake) === 1);
    } else if (filter === 'genuine') {
        filtered = loadedReportReviews.filter(r => parseInt(r.is_fake) === 0);
    }

    populateReportReviews(filtered);
};

const reportReviewCorrection = async (reviewId, correctionLabel) => {
    const comment = prompt(`Explain why this review is ${correctionLabel}:`);
    if (comment === null) return; // user cancelled

    try {
        const res = await EchoTraceAPI.post('review/report', {
            review_id: reviewId,
            reported_label: correctionLabel,
            comments: comment
        });

        if (res.success) {
            alert(res.message);
        } else {
            alert(res.error);
        }
    } catch (e) {
        alert(e.message);
    }
};

const exportReport = async (format) => {
    if (!loadedReportData) {
        alert('No report data loaded to export.');
        return;
    }
    try {
        if (format === 'pdf') {
            // Open a new window with minimal styling for printing
            const printWindow = window.open('', '_blank');
            const doc = printWindow.document;
            doc.write('<html><head><title>Report Export</title>');
            // Basic styles for PDF
            doc.write('<style>body{font-family:Arial,sans-serif;padding:20px;}h1{font-size:24px;margin-bottom:10px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ddd;padding:8px;text-align:left;}</style>');
            doc.write('</head><body>');
            doc.write(`<h1>${loadedReportData.product_title}</h1>`);
            doc.write(`<p>Platform: ${loadedReportData.platform}</p>`);
            doc.write(`<p>Trust Score: ${loadedReportData.trust_score}%</p>`);
            doc.write(`<p>Risk Level: ${loadedReportData.risk_level}</p>`);
            doc.write('<h2>Reviews</h2>');
            doc.write('<table><thead><tr><th>Author</th><th>Rating</th><th>Text</th><th>Fake?</th></tr></thead><tbody>');
            loadedReportData.reviews.forEach(r => {
                const isFake = parseInt(r.is_fake) === 1 ? 'Yes' : 'No';
                doc.write(`<tr><td>${r.author}</td><td>${r.rating}</td><td>${r.review_text}</td><td>${isFake}</td></tr>`);
            });
            doc.write('</tbody></table>');
            doc.write('</body></html>');
            doc.close();
            printWindow.focus();
            printWindow.print();
        } else if (format === 'excel') {
            // Generate CSV content
            const headers = ['Author','Rating','Review Text','Is Fake','Sentiment','Intent','Keywords'];
            const rows = loadedReportData.reviews.map(r => {
                const isFake = parseInt(r.is_fake) === 1 ? 'Yes' : 'No';
                const keywords = typeof r.keywords === 'string' ? r.keywords : JSON.stringify(r.keywords || []);
                return [r.author, r.rating, r.review_text.replace(/\n/g, ' '), isFake, r.sentiment, r.intent, keywords];
            });
            const csvContent = [headers, ...rows].map(e => e.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `${loadedReportData.product_title.replace(/\s+/g, '_')}_report.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            alert('Unsupported export format.');
        }
    } catch (e) {
        console.error('Export error:', e);
        alert('Failed to export report.');
    }
};

// --- NOTIFICATIONS PANE ---

const toggleNotifications = () => {
    const dropdown = document.getElementById('notif-dropdown');
    dropdown.classList.toggle('hidden');
};

const clearNotifs = () => {
    document.getElementById('notif-badge').classList.add('hidden');
    document.getElementById('notif-list').innerHTML = `
        <p class="text-xs text-gray-500 text-center py-4">No new notifications</p>
    `;
};

// --- ADMINISTRATOR PANEL ACTIONS ---

let activeAdminTab = 'dashboard';
const switchAdminTab = (tabName) => {
    // Hide all tab content panels
    document.querySelectorAll('.admin-tab-content').forEach(el => el.classList.add('hidden'));

    // Show the requested tab content (guard against null)
    const contentEl = document.getElementById(`admin-tab-${tabName}`);
    if (contentEl) {
        contentEl.classList.remove('hidden');
    } else {
        console.warn(`[switchAdminTab] No content div found for tab: ${tabName}`);
    }

    // Reset all tab button styles
    document.querySelectorAll('[id$="-btn"][id^="tab-"]').forEach(btn => {
        btn.className = "py-2 border-b-2 border-transparent text-gray-400 hover:text-white transition-all";
    });

    // Activate the clicked tab button (guard against null)
    const btnEl = document.getElementById(`tab-${tabName}-btn`);
    if (btnEl) {
        btnEl.className = "py-2 border-b-2 border-emeraldGreen text-white font-semibold transition-all";
    }

    activeAdminTab = tabName;
};

const loadAdminDashboard = async () => {
    try {
        const res = await EchoTraceAPI.get('admin/dashboard');
        if (res && res.success) {
            // Flask returns { success: true, dashboard: { total_users, ai_accuracy, ... } }
            const s = res.dashboard || {};
            const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            setEl('admin-stat-users',             s.total_users    ?? '--');
            setEl('admin-stat-ai-accuracy',       s.ai_accuracy != null ? s.ai_accuracy + '%' : '--');
            setEl('admin-stat-fake-analytics',    s.fake_reviews   ?? '--');
            setEl('admin-stat-user-growth',       s.active_users   ?? '--');
            setEl('admin-stat-product-analytics', s.total_products ?? '--');
        }
    } catch (e) {
        console.warn('[loadAdminDashboard] Could not load dashboard stats:', e.message);
        // Non-fatal — UI shows placeholders
    }
};

const loadAdminData = async () => {
    try {
        // Load Dashboard Stats first
        await loadAdminDashboard();
        // 1. Fetch Users
        const usersRes = await EchoTraceAPI.get('admin/users');
        if (usersRes.success) {
            populateAdminUsers(usersRes.users);
        }

        // 2. Fetch Feedback (Community Reports)
        const feedbackRes = await EchoTraceAPI.get('admin/feedback');
        if (feedbackRes.success) {
            populateAdminFeedback(feedbackRes.reports);
        }

        // 3. Fetch Reports
        const reportsRes = await EchoTraceAPI.get('admin/reports');
        if (reportsRes.success) {
            populateAdminReports(reportsRes.reports);
        }

        // 4. Fetch Products
        const productsRes = await EchoTraceAPI.get('admin/products');
        if (productsRes.success) {
            populateAdminProducts(productsRes.products);
        }

        // 5. Fetch Logs
        const logsRes = await EchoTraceAPI.get('admin/logs');
        if (logsRes.success) {
            populateAdminLogs(logsRes.ai_logs, logsRes.login_logs);
        }
    } catch (e) {
        console.error("Admin data loading failure:", e);
    }
};

const populateAdminUsers = (users) => {
    const tbody = document.getElementById('admin-users-table-body');
    tbody.innerHTML = '';

    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-glassBorder/10 transition-colors";

        const statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold ${
            u.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
        }">${u.status}</span>`;

        tr.innerHTML = `
            <td class="p-4 font-bold text-gray-400">${u.id}</td>
            <td class="p-4 font-semibold text-white">${u.username}</td>
            <td class="p-4 text-gray-400">${u.email}</td>
            <td class="p-4 capitalize text-sky-400 font-semibold">${u.role}</td>
            <td class="p-4">${statusBadge}</td>
            <td class="p-4 space-x-2">
                <button onclick="toggleUserStatus(${u.id}, '${u.status}')" class="text-xs ${u.status === 'active' ? 'text-rose-400 hover:underline' : 'text-emerald-400 hover:underline'}">
                    ${u.status === 'active' ? 'Suspend' : 'Activate'}
                </button>
                <button onclick="toggleUserRole(${u.id}, '${u.role}')" class="text-xs text-sky-400 hover:underline">
                    Make ${u.role === 'admin' ? 'User' : 'Admin'}
                </button>
                <button onclick="deleteUserAccount(${u.id})" class="text-xs text-rose-500 font-bold hover:underline">
                    Delete
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

const toggleUserStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'blocked' : 'active';
    try {
        const res = await EchoTraceAPI.post('admin/users/toggle', { id, status: newStatus });
        if (res.success) {
            loadAdminData();
        }
    } catch (e) {
        alert(e.message);
    }
};

const toggleUserRole = async (id, currentRole) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
        const res = await EchoTraceAPI.post('admin/users/role', { id, role: newRole });
        if (res.success) {
            loadAdminData();
        }
    } catch (e) {
        alert(e.message);
    }
};

const deleteUserAccount = async (id) => {
    if (!confirm("Are you sure you want to permanently delete this user?")) return;
    try {
        const res = await EchoTraceAPI.delete(`admin/users/delete&id=${id}`);
        if (res.success) {
            loadAdminData();
        }
    } catch (e) {
        alert(e.message);
    }
};

const populateAdminFeedback = (reports) => {
    const tbody = document.getElementById('admin-feedback-table-body');
    tbody.innerHTML = '';

    if (reports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-500">No community correction reviews reported.</td></tr>`;
        return;
    }

    reports.forEach(r => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-glassBorder/10 transition-colors";

        const labelBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold ${
            r.reported_label === 'fake' ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'
        }">Mark as ${r.reported_label}</span>`;

        const date = new Date(r.created_at).toLocaleDateString();

        tr.innerHTML = `
            <td class="p-4 font-semibold text-white">${r.reporter}</td>
            <td class="p-4 text-gray-400 max-w-xs truncate">${r.product_title}</td>
            <td class="p-4 text-gray-300 font-semibold">${r.author} (Rating: ${r.rating})</td>
            <td class="p-4 italic text-gray-500 max-w-xs truncate" title="${r.comments}">"${r.comments}"</td>
            <td class="p-4">${labelBadge}</td>
            <td class="p-4 text-gray-400 text-xs">${date}</td>
        `;
        tbody.appendChild(tr);
    });
};

const populateAdminReports = (reports) => {
    const container = document.getElementById('admin-reports-list');
    const countEl = document.getElementById('admin-reports-count');
    if (!container) return;
    container.innerHTML = '';

    if (!reports || reports.length === 0) {
        if (countEl) countEl.textContent = '0 reports';
        container.innerHTML = `<p class="text-center text-gray-500 py-8">No scan reports found.</p>`;
        return;
    }

    if (countEl) countEl.textContent = `${reports.length} report${reports.length !== 1 ? 's' : ''}`;

    const table = document.createElement('table');
    table.className = 'w-full text-left text-sm';
    table.innerHTML = `
        <thead class="bg-glassBorder/20 text-gray-400 uppercase text-xs">
            <tr>
                <th class="p-4">Product</th>
                <th class="p-4">Platform</th>
                <th class="p-4">Trust Score</th>
                <th class="p-4">Fake</th>
                <th class="p-4">Genuine</th>
                <th class="p-4">Risk</th>
                <th class="p-4">Scanned By</th>
                <th class="p-4">Date</th>
            </tr>
        </thead>
    `;
    const tbody = document.createElement('tbody');
    tbody.className = 'divide-y divide-glassBorder text-gray-300';

    reports.forEach(r => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-glassBorder/10 transition-colors';
        const date = new Date(r.generated_at).toLocaleDateString();
        const trust = parseFloat(r.trust_score);
        const riskBadgeClass = trust >= 70 ? 'bg-emerald-500/10 text-emerald-400'
                             : trust >= 40 ? 'bg-yellow-500/10 text-yellow-400'
                             : 'bg-rose-500/10 text-rose-400';
        const riskLabel = r.risk_level || (trust >= 70 ? 'Low Risk' : trust >= 40 ? 'Medium Risk' : 'High Risk');
        tr.innerHTML = `
            <td class="p-4 font-semibold text-white max-w-xs truncate" title="${r.product_title}">${r.product_title || 'N/A'}</td>
            <td class="p-4 text-gray-400 capitalize">${r.platform || ''}</td>
            <td class="p-4 font-bold text-emeraldGreen">${trust.toFixed(1)}%</td>
            <td class="p-4 text-rose-400">${r.fake_count ?? 0}</td>
            <td class="p-4 text-emerald-400">${r.genuine_count ?? 0}</td>
            <td class="p-4"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${riskBadgeClass}">${riskLabel}</span></td>
            <td class="p-4 text-gray-400">${r.scanned_by || 'Anonymous'}</td>
            <td class="p-4 text-gray-500 text-xs">${date}</td>
        `;
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);
};

const populateAdminProducts = (products) => {
    const tbody = document.getElementById('admin-products-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!products || products.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-500">No products found.</td></tr>`;
        return;
    }

    products.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-glassBorder/10 transition-colors';
        const lastScanned = p.last_scanned ? new Date(p.last_scanned).toLocaleDateString() : '--';
        const fakePct = p.avg_fake_pct != null ? `${p.avg_fake_pct}%` : '--';
        const platformBadge = p.platform === 'shopee'
            ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/10 text-orange-400">Shopee</span>`
            : p.platform === 'amazon'
            ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-400">Amazon</span>`
            : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400">${p.platform}</span>`;
        tr.innerHTML = `
            <td class="p-4 font-semibold text-white max-w-xs truncate" title="${p.title}">${p.title}</td>
            <td class="p-4">${platformBadge}</td>
            <td class="p-4 text-gray-300">${p.scan_count ?? 0}</td>
            <td class="p-4 text-rose-400">${fakePct}</td>
            <td class="p-4 text-gray-500 text-xs">${lastScanned}</td>
        `;
        tbody.appendChild(tr);
    });
};

const populateAdminLogs = (aiLogs, loginLogs) => {
    const aiContainer = document.getElementById('admin-logs-ai');
    aiContainer.innerHTML = '';

    if (aiLogs.length === 0) {
        aiContainer.innerHTML = `<p class="text-gray-500 text-center py-4">No AI requests logged.</p>`;
    } else {
        aiLogs.forEach(l => {
            const div = document.createElement('div');
            const isFallback = l.api_endpoint.includes('[FALLBACK]');

            // Try to parse response payload
            let parsed = null;
            try { parsed = JSON.parse(l.response_payload); } catch(e) {}

            // Unified stats extraction for ALL log types
            let stats = null;

            if (parsed && parsed.success && parsed.metrics) {
                // Direct AI Engine response — has full metrics object
                const m = parsed.metrics;
                stats = {
                    total: m.total_scanned,
                    fake: m.fake_detected,
                    genuine: m.genuine_detected,
                    trust: parsed.trust_score != null ? parsed.trust_score : '--',
                    risk: parsed.overall_risk_level || '--',
                    mode: 'AI Engine'
                };
            } else if (parsed && parsed.fallback_response && parsed.fallback_response.results) {
                // Fallback mode — compute stats from results array
                const results = parsed.fallback_response.results;
                const fake = results.filter(r => r.is_fake === 1 || r.is_fake === true).length;
                const genuine = results.length - fake;
                const trust = parsed.fallback_response.trust_score != null ? parsed.fallback_response.trust_score : '--';
                const risk = trust >= 80 ? 'Low Risk' : trust >= 50 ? 'Medium Risk' : 'High Risk';
                stats = {
                    total: results.length,
                    fake,
                    genuine,
                    trust,
                    risk,
                    mode: 'Fallback Mode'
                };
            }

            let bodyHtml = '';
            if (stats) {
                const riskColor = stats.risk === 'Low Risk' ? 'text-emerald-400' : stats.risk === 'Medium Risk' ? 'text-yellow-400' : 'text-rose-400';
                const fakeColor = stats.fake > 0 ? 'text-rose-400' : 'text-gray-300';
                const modeClass = isFallback
                    ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                bodyHtml = `
                    <div class="grid grid-cols-4 gap-2 mt-2">
                        <div class="bg-white/5 rounded-lg p-2 text-center">
                            <div class="text-xs text-gray-500">Reviews</div>
                            <div class="font-bold text-white">${stats.total}</div>
                        </div>
                        <div class="bg-white/5 rounded-lg p-2 text-center">
                            <div class="text-xs text-gray-500">Fake</div>
                            <div class="font-bold ${fakeColor}">${stats.fake}</div>
                        </div>
                        <div class="bg-white/5 rounded-lg p-2 text-center">
                            <div class="text-xs text-gray-500">Genuine</div>
                            <div class="font-bold text-emerald-400">${stats.genuine}</div>
                        </div>
                        <div class="bg-white/5 rounded-lg p-2 text-center">
                            <div class="text-xs text-gray-500">Trust</div>
                            <div class="font-bold text-sky-400">${stats.trust}%</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 mt-1">
                        <span class="text-xs text-gray-500">Risk Level:</span>
                        <span class="text-xs font-semibold ${riskColor}">${stats.risk}</span>
                        <span class="ml-auto text-[10px] ${modeClass} px-2 py-0.5 rounded-full">${stats.mode}</span>
                    </div>
                `;
            } else {
                // Error-only log — show clean error message
                const errMsg = (parsed && parsed.error) ? parsed.error : (l.response_payload || '').substring(0, 150);
                bodyHtml = `<div class="text-xs text-rose-300 mt-1 font-mono bg-rose-500/5 p-2 rounded-lg break-all">${errMsg}</div>`;
            }

            // Human-readable label from endpoint path
            const endpointPath = l.api_endpoint.replace(/https?:\/\/[^/]+/, '').replace(' [FALLBACK]', '').trim();
            const labelMap = {
                '/analyze': 'Review Analysis',
                '/retrain': 'Model Retrain',
                '/health': 'Health Check'
            };
            const baseLabel = labelMap[endpointPath] || endpointPath;
            const cardLabel = isFallback ? `${baseLabel} — Fallback Mode` : `${baseLabel} — AI Engine`;

            div.className = `p-3 border rounded-xl ${isFallback ? 'bg-yellow-500/5 border-yellow-500/20' : 'bg-glassBg border-glassBorder'}`;
            div.innerHTML = `
                <div class="flex justify-between items-center font-bold">
                    <span class="${isFallback ? 'text-yellow-400' : 'text-gray-200'} text-sm">${cardLabel}</span>
                    <span class="${isFallback ? 'text-yellow-400' : 'text-emerald-400'} text-sm">${l.duration_ms}ms</span>
                </div>
                <div class="text-[10px] text-gray-500 mb-1">${l.created_at} &bull; <span class="font-mono opacity-60">${l.api_endpoint}</span></div>
                ${bodyHtml}
            `;
            aiContainer.appendChild(div);
        });
    }

    const authContainer = document.getElementById('admin-logs-auth');
    authContainer.innerHTML = '';

    if (loginLogs.length === 0) {
        authContainer.innerHTML = `<p class="text-gray-500 text-center py-4">No login events logged.</p>`;
    } else {
        loginLogs.forEach(l => {
            const div = document.createElement('div');
            const isSuccess = l.status === 'success';

            // Humanize IP address
            const rawIp = l.ip_address || 'Unknown';
            const displayIp = (rawIp === '::1' || rawIp === '127.0.0.1') ? 'Localhost' : rawIp;

            // Parse user-agent into readable client description
            const ua = l.user_agent || '';
            let clientLabel = 'Unknown Client';
            let clientIcon = '🖥️';
            if (/WindowsPowerShell|PowerShell/i.test(ua)) {
                clientLabel = 'PowerShell (Windows)'; clientIcon = '⚡';
            } else if (/PostmanRuntime/i.test(ua)) {
                clientLabel = 'Postman API Client'; clientIcon = '🔧';
            } else if (/curl/i.test(ua)) {
                clientLabel = 'cURL Command Line'; clientIcon = '💻';
            } else if (/Chrome/i.test(ua) && !/Edge|OPR/i.test(ua)) {
                clientLabel = 'Google Chrome'; clientIcon = '🌐';
            } else if (/Firefox/i.test(ua)) {
                clientLabel = 'Mozilla Firefox'; clientIcon = '🦊';
            } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
                clientLabel = 'Safari'; clientIcon = '🧭';
            } else if (/Edge/i.test(ua)) {
                clientLabel = 'Microsoft Edge'; clientIcon = '🌐';
            } else if (/OPR|Opera/i.test(ua)) {
                clientLabel = 'Opera'; clientIcon = '🎭';
            } else if (ua.length > 0) {
                clientLabel = ua.substring(0, 40) + (ua.length > 40 ? '…' : '');
            }

            // OS detection
            let osLabel = '';
            if (/Windows NT 10/i.test(ua)) osLabel = 'Windows 10/11';
            else if (/Windows NT 6/i.test(ua)) osLabel = 'Windows';
            else if (/Mac OS X/i.test(ua)) osLabel = 'macOS';
            else if (/Linux/i.test(ua)) osLabel = 'Linux';
            else if (/Android/i.test(ua)) osLabel = 'Android';
            else if (/iPhone|iPad/i.test(ua)) osLabel = 'iOS';

            div.className = `p-3 border rounded-xl ${isSuccess ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'}`;
            div.innerHTML = `
                <div class="flex justify-between items-center font-bold">
                    <span class="text-gray-200 text-sm">${l.username || 'Anonymous'}</span>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${isSuccess ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}">${isSuccess ? '✓ SUCCESS' : '✗ FAILED'}</span>
                </div>
                <div class="text-[10px] text-gray-500 mb-2">${l.created_at}</div>
                <div class="grid grid-cols-2 gap-2">
                    <div class="bg-white/5 rounded-lg p-2">
                        <div class="text-xs text-gray-500 mb-0.5">IP Address</div>
                        <div class="text-xs font-semibold text-gray-300">${displayIp}</div>
                    </div>
                    <div class="bg-white/5 rounded-lg p-2">
                        <div class="text-xs text-gray-500 mb-0.5">Client</div>
                        <div class="text-xs font-semibold text-gray-300">${clientIcon} ${clientLabel}</div>
                    </div>
                </div>
                ${osLabel ? `<div class="text-[10px] text-gray-500 mt-1.5">OS: <span class="text-gray-400">${osLabel}</span></div>` : ''}
            `;
            authContainer.appendChild(div);
        });
    }
};

const triggerRetraining = async () => {
    const msgEl = document.getElementById('retrain-msg');
    msgEl.classList.add('hidden');

    try {
        const res = await EchoTraceAPI.post('admin/retrain');
        if (res.success) {
            msgEl.className = "p-3 text-xs rounded-xl text-center bg-emerald-500/10 text-emerald-400";
            msgEl.textContent = res.message;
            msgEl.classList.remove('hidden');
        } else {
            msgEl.className = "p-3 text-xs rounded-xl text-center bg-rose-500/10 text-rose-400";
            msgEl.textContent = res.error;
            msgEl.classList.remove('hidden');
        }
    } catch (e) {
        msgEl.className = "p-3 text-xs rounded-xl text-center bg-rose-500/10 text-rose-400";
        msgEl.textContent = e.message;
        msgEl.classList.remove('hidden');
    }
};

// --- THEME & UTILITIES ---

const toggleTheme = () => {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    html.setAttribute('data-theme', newTheme);
    
    const icon = document.getElementById('theme-icon-sun');
    if (newTheme === 'light') {
        icon.setAttribute('data-lucide', 'moon');
    } else {
        icon.setAttribute('data-lucide', 'sun');
    }
    lucide.createIcons();
};

// -------------------
// RAG MACHINE LEARNING & COPILOT CONTROLLERS
// -------------------

const loadRagAssistant = async () => {
    try {
        await refreshRagStats();
        await loadRagKnowledgeBase();
    } catch (e) {
        console.error("Failed to initialize RAG Assistant:", e);
    }
};

const refreshRagStats = async () => {
    try {
        const res = await EchoTraceAPI.ragStats();
        if (res.success && res.stats) {
            const stats = res.stats;
            const statusBadge = document.getElementById('rag-status-badge');
            if (statusBadge) {
                statusBadge.textContent = stats.is_indexed ? 'TF-IDF Active' : 'Unindexed';
                statusBadge.className = stats.is_indexed ? 'text-sm font-bold text-emerald-400' : 'text-sm font-bold text-rose-400';
            }
            const docCountEl = document.getElementById('rag-doc-count');
            if (docCountEl) docCountEl.textContent = `${stats.total_documents} Docs`;
            
            const chunkCountEl = document.getElementById('rag-chunk-count');
            if (chunkCountEl) chunkCountEl.textContent = `${stats.total_chunks} Chunks`;

            const vocabEl = document.getElementById('rag-vocab-size');
            if (vocabEl) vocabEl.textContent = `${stats.vocabulary_size} Terms`;
        }
    } catch (e) {
        console.error("Error refreshing RAG stats:", e);
    }
};

const switchRagTab = (tabName) => {
    document.querySelectorAll('.rag-tab-content').forEach(el => el.classList.add('hidden'));
    
    const copilotBtn = document.getElementById('rag-tab-btn-copilot');
    const knowledgeBtn = document.getElementById('rag-tab-btn-knowledge');

    if (tabName === 'copilot') {
        document.getElementById('rag-tab-copilot').classList.remove('hidden');
        copilotBtn.className = 'px-4 py-2 rounded-lg font-bold bg-gradient-to-r from-emeraldGreen to-skyBlue text-white transition-all';
        knowledgeBtn.className = 'px-4 py-2 rounded-lg font-bold text-gray-400 hover:text-white transition-all';
    } else {
        document.getElementById('rag-tab-knowledge').classList.remove('hidden');
        knowledgeBtn.className = 'px-4 py-2 rounded-lg font-bold bg-gradient-to-r from-emeraldGreen to-skyBlue text-white transition-all';
        copilotBtn.className = 'px-4 py-2 rounded-lg font-bold text-gray-400 hover:text-white transition-all';
        loadRagKnowledgeBase();
    }
    lucide.createIcons();
};

const fillRagQuery = (promptText) => {
    const inputEl = document.getElementById('rag-query-input');
    if (inputEl) {
        inputEl.value = promptText;
        inputEl.focus();
    }
};

const submitRagQuery = async (e) => {
    e.preventDefault();
    const inputEl = document.getElementById('rag-query-input');
    const query = inputEl.value.trim();
    if (!query) return;

    const category = document.getElementById('rag-query-category').value;
    const btnEl = document.getElementById('rag-query-btn');

    appendRagUserMessage(query);
    inputEl.value = '';

    btnEl.disabled = true;
    btnEl.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Retrieving...</span>`;
    lucide.createIcons();

    try {
        const res = await EchoTraceAPI.ragQuery(query, 3, category);
        if (res.success && res.rag) {
            appendRagAssistantResponse(res.rag);
        } else {
            appendRagAssistantError(res.error || "RAG retrieval query failed.");
        }
    } catch (err) {
        appendRagAssistantError(err.message || "Failed to connect to RAG AI microservice.");
    } finally {
        btnEl.disabled = false;
        btnEl.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i><span>Search & Synthesize</span>`;
        lucide.createIcons();
    }
};

const appendRagUserMessage = (query) => {
    const container = document.getElementById('rag-chat-output');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'flex items-start justify-end space-x-3';
    msgDiv.innerHTML = `
        <div class="glass-panel p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-white leading-relaxed max-w-xl">
            <p class="font-semibold">${query}</p>
        </div>
        <div class="w-8 h-8 rounded-xl bg-glassBorder flex items-center justify-center text-gray-300 font-bold text-xs shrink-0">YOU</div>
    `;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
};

const appendRagAssistantResponse = (ragData) => {
    const container = document.getElementById('rag-chat-output');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'flex items-start space-x-3 animate-fade-in';

    let citationsHtml = '';
    if (ragData.sources && ragData.sources.length > 0) {
        citationsHtml += `<div class="mt-4 pt-3 border-t border-glassBorder space-y-2">
            <div class="text-[10px] uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1">
                <i data-lucide="book-open" class="w-3.5 h-3.5"></i> Grounded Source Citations (${ragData.sources.length} Matches)
            </div>
            <div class="grid grid-cols-1 gap-2">`;
        
        ragData.sources.forEach(src => {
            citationsHtml += `
                <div class="p-2.5 rounded-xl bg-black/40 border border-glassBorder text-[11px] space-y-1">
                    <div class="flex justify-between items-center">
                        <span class="font-bold text-white">${src.title}</span>
                        <span class="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400">${src.similarity_score}% Match</span>
                    </div>
                    <p class="text-gray-400 italic font-mono text-[10px] leading-tight">"${src.snippet.substring(0, 160)}..."</p>
                </div>
            `;
        });
        citationsHtml += `</div></div>`;
    }

    const confidence = ragData.confidence_score || 85.0;
    const latency = ragData.latency_ms || 15;

    msgDiv.innerHTML = `
        <div class="w-8 h-8 rounded-xl bg-gradient-to-r from-emeraldGreen to-skyBlue flex items-center justify-center text-white font-bold text-xs shrink-0">AI</div>
        <div class="glass-panel p-5 rounded-2xl border border-glassBorder text-xs text-gray-200 leading-relaxed max-w-2xl space-y-3 shadow-xl">
            <div class="flex items-center justify-between border-b border-glassBorder pb-2">
                <span class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Grounded Synthesizer Output</span>
                <div class="flex items-center space-x-2 text-[10px]">
                    <span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/30">${confidence}% Confidence</span>
                    <span class="text-gray-500 font-mono">${latency}ms</span>
                </div>
            </div>
            <div class="text-gray-200 leading-relaxed whitespace-pre-line">${ragData.answer}</div>
            ${citationsHtml}
        </div>
    `;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
    lucide.createIcons();
};

const appendRagAssistantError = (errorMsg) => {
    const container = document.getElementById('rag-chat-output');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'flex items-start space-x-3';
    msgDiv.innerHTML = `
        <div class="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 font-bold text-xs shrink-0">AI</div>
        <div class="glass-panel p-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 text-xs text-rose-300 leading-relaxed max-w-xl">
            <p class="font-bold text-rose-400">RAG Engine Error</p>
            <p>${errorMsg}</p>
        </div>
    `;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
};

const loadRagKnowledgeBase = async () => {
    const tbody = document.getElementById('rag-docs-table-body');
    if (!tbody) return;

    try {
        const res = await EchoTraceAPI.ragKnowledge();
        if (res.success && res.documents) {
            tbody.innerHTML = '';
            if (res.documents.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-500">No documents in vector store. Click Re-Index Store to populate defaults.</td></tr>`;
                return;
            }

            res.documents.forEach(doc => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-glassBorder/10 transition-colors';

                const catBadge = doc.category === 'policy' ? 'bg-sky-500/10 text-sky-400' :
                                 doc.category === 'fraud_pattern' ? 'bg-rose-500/10 text-rose-400' :
                                 doc.category === 'case_study' ? 'bg-purple-500/10 text-purple-400' :
                                 'bg-emerald-500/10 text-emerald-400';

                const tagsHtml = (doc.tags || []).map(t => `<span class="bg-gray-500/10 text-gray-400 px-1.5 py-0.5 rounded text-[9px]">#${t}</span>`).join(' ');

                tr.innerHTML = `
                    <td class="p-4 font-mono text-[10px] text-gray-400">${doc.id}</td>
                    <td class="p-4 font-semibold text-white max-w-xs truncate">${doc.title}</td>
                    <td class="p-4"><span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase ${catBadge}">${doc.category}</span></td>
                    <td class="p-4">${tagsHtml || '<span class="text-gray-600">-</span>'}</td>
                    <td class="p-4 font-bold text-gray-300">${doc.chunk_count || 1} chunks</td>
                    <td class="p-4 text-center">
                        <button onclick="deleteKnowledgeDoc('${doc.id}')" class="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 p-1.5 rounded-lg transition-colors" title="Delete Document">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            lucide.createIcons();
        }
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-rose-400">Failed to load knowledge base: ${e.message}</td></tr>`;
    }
};

const openAddKnowledgeModal = () => {
    document.getElementById('rag-add-modal').classList.remove('hidden');
};

const closeAddKnowledgeModal = () => {
    document.getElementById('rag-add-modal').classList.add('hidden');
};

const submitAddKnowledge = async (e) => {
    e.preventDefault();
    const title = document.getElementById('rag-add-title').value.trim();
    const category = document.getElementById('rag-add-category').value;
    const tagsStr = document.getElementById('rag-add-tags').value.trim();
    const content = document.getElementById('rag-add-content').value.trim();

    if (!title || !content) return;

    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()) : [];

    try {
        const res = await EchoTraceAPI.ragAddKnowledge(title, content, category, tags);
        if (res.success) {
            closeAddKnowledgeModal();
            document.getElementById('rag-add-form').reset();
            await refreshRagStats();
            await loadRagKnowledgeBase();
            alert("Document successfully indexed in RAG vector store!");
        } else {
            alert(res.error || "Failed to add document");
        }
    } catch (err) {
        alert("Error indexing document: " + err.message);
    }
};

const deleteKnowledgeDoc = async (docId) => {
    if (!confirm(`Are you sure you want to delete knowledge document '${docId}' from the vector store?`)) return;

    try {
        const res = await EchoTraceAPI.ragDeleteKnowledge(docId);
        if (res.success) {
            await refreshRagStats();
            await loadRagKnowledgeBase();
        } else {
            alert(res.error || "Failed to delete document");
        }
    } catch (e) {
        alert("Error deleting document: " + e.message);
    }
};

const reindexRagStore = async () => {
    try {
        const res = await EchoTraceAPI.ragReindex();
        if (res.success) {
            await refreshRagStats();
            await loadRagKnowledgeBase();
            alert("RAG Vector Store re-indexed successfully!");
        } else {
            alert(res.error || "Reindex failed");
        }
    } catch (e) {
        alert("Error re-indexing vector store: " + e.message);
    }
};

// ─── AUDIT HISTORY PAGE ────────────────────────────────────────────────────

let allAuditScans = [];
let filteredAuditScans = [];
let currentHistoryPage = 1;
const auditHistoryPerPage = 10;

const loadAuditHistory = async () => {
    try {
        const data = await EchoTraceAPI.get('scan/history');
        if (data.success) {
            allAuditScans = data.history || [];
            filteredAuditScans = [...allAuditScans];
            currentHistoryPage = 1;
            populateAuditHistoryTable();
            updateAuditHistorySummary();
        }
    } catch (e) {
        console.error("Audit history error:", e);
    }
};

const populateAuditHistoryTable = () => {
    const tbody = document.getElementById('audit-history-table-body');
    tbody.innerHTML = '';
    
    if (filteredAuditScans.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="p-8 text-center text-gray-500">
                    <div class="flex flex-col items-center justify-center gap-3">
                        <i data-lucide="inbox" class="w-12 h-12 text-gray-600"></i>
                        <p>No audit history found.</p>
                        <button onclick="openScanModal()" class="mt-2 text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-lg hover:bg-emerald-500 hover:text-white transition-all">
                            Start a New Scan
                        </button>
                    </div>
                </td>
            </tr>
        `;
        document.getElementById('history-result-count').textContent = '0 scans';
        return;
    }

    // Pagination
    const startIdx = (currentHistoryPage - 1) * auditHistoryPerPage;
    const endIdx = startIdx + auditHistoryPerPage;
    const paginatedScans = filteredAuditScans.slice(startIdx, endIdx);

    paginatedScans.forEach(s => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-glassBorder/10 transition-colors";
        
        // Platform Badge
        const platformBadge = `<span class="px-2.5 py-1 text-[10px] font-bold rounded-lg border uppercase ${
            s.platform === 'amazon' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
            s.platform === 'shopee' ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' :
            s.platform === 'lazada' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
            s.platform === 'ebay' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
            'bg-sky-500/10 border-sky-500/20 text-sky-400'
        }">${s.platform}</span>`;
        
        // Trust Score
        const trustPct = parseFloat(s.trust_score);
        const trustClass = trustPct >= 80 ? 'text-emerald-400' : (trustPct >= 50 ? 'text-amber-400' : 'text-rose-400');
        
        // Risk Level
        const riskLevel = (s.risk_level || 'Low Risk').toUpperCase();
        const riskClass = riskLevel.includes('HIGH') ? 'bg-rose-500/10 text-rose-400' : 
                          (riskLevel.includes('MEDIUM') ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400');
        
        // Date formatting
        const date = new Date(s.scan_date).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit'
        });

        // Review counts
        const fakeCount = parseInt(s.fake_count || 0);
        const genuineCount = parseInt(s.genuine_count || 0);
        const totalReviews = fakeCount + genuineCount;

        tr.innerHTML = `
            <td class="px-6 py-4">${platformBadge}</td>
            <td class="px-6 py-4 font-semibold text-white max-w-xs truncate" title="${s.product_title}">${s.product_title}</td>
            <td class="px-6 py-4 font-bold ${trustClass}">${trustPct.toFixed(2)}%</td>
            <td class="px-6 py-4 text-gray-400 text-xs">
                <span class="text-rose-400">${fakeCount}</span> fake / <span class="text-emerald-400">${genuineCount}</span> genuine
            </td>
            <td class="px-6 py-4 text-gray-400 text-xs">${date}</td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 text-[10px] font-bold rounded-lg ${riskClass}">
                    ${riskLevel}
                </span>
            </td>
            <td class="px-6 py-4 text-center">
                <button onclick="navigateTo('report', 'scan_id=${s.id}')" class="text-xs bg-emeraldGreen/10 border border-emeraldGreen/30 text-emeraldGreen px-3 py-1 rounded-lg hover:bg-emeraldGreen hover:text-white transition-all">
                    View
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Update result count
    document.getElementById('history-result-count').textContent = `${filteredAuditScans.length} scan${filteredAuditScans.length !== 1 ? 's' : ''}`;

    // Update pagination
    updateAuditHistoryPagination();
    lucide.createIcons();
};

const filterAuditHistory = () => {
    const searchTerm = document.getElementById('history-search-bar').value.toLowerCase();
    const platformFilter = document.getElementById('history-platform-filter').value.toLowerCase();
    const trustFilter = document.getElementById('history-trust-filter').value;

    filteredAuditScans = allAuditScans.filter(s => {
        // Search filter
        const matchesSearch = !searchTerm || 
            s.product_title.toLowerCase().includes(searchTerm) || 
            s.platform.toLowerCase().includes(searchTerm);
        
        // Platform filter
        const matchesPlatform = !platformFilter || s.platform.toLowerCase() === platformFilter;
        
        // Trust score filter
        let matchesTrust = true;
        if (trustFilter) {
            const trustScore = parseFloat(s.trust_score);
            if (trustFilter === 'high') matchesTrust = trustScore >= 80;
            else if (trustFilter === 'medium') matchesTrust = trustScore >= 50 && trustScore < 80;
            else if (trustFilter === 'low') matchesTrust = trustScore < 50;
        }

        return matchesSearch && matchesPlatform && matchesTrust;
    });

    currentHistoryPage = 1;
    populateAuditHistoryTable();
};

const updateAuditHistorySummary = () => {
    // Total scans
    document.getElementById('history-total-scans').textContent = allAuditScans.length;

    // Average trust score
    if (allAuditScans.length > 0) {
        const avgTrust = allAuditScans.reduce((sum, s) => sum + parseFloat(s.trust_score || 0), 0) / allAuditScans.length;
        document.getElementById('history-avg-trust').textContent = `${avgTrust.toFixed(2)}%`;
    } else {
        document.getElementById('history-avg-trust').textContent = '0.0%';
    }

    // Total reviews analyzed
    let totalReviewsCount = 0;
    allAuditScans.forEach(s => {
        totalReviewsCount += parseInt(s.fake_count || 0) + parseInt(s.genuine_count || 0);
    });
    document.getElementById('history-total-reviews').textContent = totalReviewsCount;
};

const updateAuditHistoryPagination = () => {
    const totalPages = Math.ceil(filteredAuditScans.length / auditHistoryPerPage);
    const paginationEl = document.getElementById('history-pagination');
    const paginationInfoEl = document.getElementById('pagination-info');

    if (totalPages > 1) {
        paginationEl.classList.remove('hidden');
        paginationInfoEl.textContent = `Page ${currentHistoryPage} of ${totalPages}`;
    } else {
        paginationEl.classList.add('hidden');
    }
};

const nextHistoryPage = () => {
    const totalPages = Math.ceil(filteredAuditScans.length / auditHistoryPerPage);
    if (currentHistoryPage < totalPages) {
        currentHistoryPage++;
        populateAuditHistoryTable();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

const previousHistoryPage = () => {
    if (currentHistoryPage > 1) {
        currentHistoryPage--;
        populateAuditHistoryTable();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

// Update handleRoute to load audit history
const originalHandleRoute = window.handleRoute || (() => {});
window.handleRoute = function(routeString) {
    // Add audit-history route handling before calling original
    const parts = routeString.split('?');
    const page = parts[0];
    
    if (page === 'audit-history') {
        const targetSectionId = 'view-audit-history';
        const protectedPages = ['audit-history'];
        if (protectedPages.includes(page) && !EchoTraceAuth.isAuthenticated()) {
            navigateTo('login');
            return;
        }
        showSection(targetSectionId);
        loadAuditHistory();
        return;
    }
    
    // Call original route handler for other pages
    if (typeof originalHandleRoute === 'function') {
        originalHandleRoute.call(this, routeString);
    }
};
