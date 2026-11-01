const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const VIEWPORTS = [
  { width: 320, height: 568, name: '320x568_small_mobile', isMobile: true },
  { width: 360, height: 800, name: '360x800_android_mobile', isMobile: true },
  { width: 390, height: 844, name: '390x844_modern_mobile', isMobile: true },
  { width: 430, height: 932, name: '430x932_large_mobile', isMobile: true },
  { width: 768, height: 1024, name: '768x1024_tablet', isMobile: false },
  { width: 1024, height: 768, name: '1024x768_small_laptop_tablet', isMobile: false },
  { width: 1280, height: 720, name: '1280x720_laptop', isMobile: false },
  { width: 1366, height: 768, name: '1366x768_standard_laptop', isMobile: false },
  { width: 1440, height: 900, name: '1440x900_laptop', isMobile: false },
  { width: 1920, height: 1080, name: '1920x1080_desktop', isMobile: false }
];

const SCREENSHOT_DIR = path.resolve('tests/screenshots_responsive');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runTests() {
  console.log('🚀 Starting EchoTrace Manual Scanner Responsive Test Suite...\n');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const filePath = 'file://' + path.resolve('frontend/index.html').replace(/\\/g, '/');
  await page.goto(filePath, { waitUntil: 'load' });

  // Open the Manual Scanner modal
  await page.evaluate(() => {
    window.openScanModal();
  });

  let allPassed = true;
  const results = [];

  for (const vp of VIEWPORTS) {
    console.log(`\n======================================================`);
    console.log(`Testing Viewport: ${vp.name} (${vp.width}x${vp.height})`);
    console.log(`======================================================`);

    await page.setViewport({ width: vp.width, height: vp.height });
    await new Promise(r => setTimeout(r, 100));

    // Clear any previous populated state to test empty state
    await page.evaluate(() => {
      window.setExtractedReviews([]);
      const scanRes = document.getElementById('screenshot-scan-result');
      if (scanRes) scanRes.classList.add('hidden');
    });
    await new Promise(r => setTimeout(r, 50));

    // ── TEST 1: Empty state verification ──
    const emptyStateMetrics = await page.evaluate((isMobile) => {
      const modal = document.getElementById('scan-modal');
      const panel = document.getElementById('scan-modal-panel');
      const clearBtn = document.querySelector('.scan-modal-secondary .scan-btn-ghost');
      const extractBtn = document.getElementById('btn-extract-screenshots');
      const analyzeBtn = document.getElementById('btn-analyze-screenshots');
      const closeBtn = document.querySelector('.scan-modal-close-btn');

      const panelRect = panel.getBoundingClientRect();
      const clearRect = clearBtn.getBoundingClientRect();
      const extractRect = extractBtn.getBoundingClientRect();
      const analyzeRect = analyzeBtn.getBoundingClientRect();
      const closeRect = closeBtn.getBoundingClientRect();

      // Horizontal overflow checks
      const docScrollWidth = document.documentElement.scrollWidth;
      const docClientWidth = document.documentElement.clientWidth;
      const modalScrollWidth = modal.scrollWidth;
      const modalClientWidth = modal.clientWidth;
      const panelScrollWidth = panel.scrollWidth;
      const panelClientWidth = panel.clientWidth;

      // Check toolbar button stacking:
      // Mobile: Clear All, Extract Reviews, and Analyze are each stacked vertically
      // Desktop: Clear All and Extract Reviews are row 1 (same top), Analyze is row 2 (below)
      let toolbarMatchesSpec = false;
      if (isMobile) {
        // Clear above Extract, Extract above Analyze
        const clearAboveExtract = extractRect.top >= clearRect.bottom - 4;
        const extractAboveAnalyze = analyzeRect.top >= extractRect.bottom - 4;
        toolbarMatchesSpec = clearAboveExtract && extractAboveAnalyze;
      } else {
        // Clear and Extract side-by-side (approx same top)
        const secondarySameRow = Math.abs(clearRect.top - extractRect.top) < 6;
        // Analyze below secondary row and full width
        const analyzeBelow = analyzeRect.top >= Math.max(clearRect.bottom, extractRect.bottom) - 4;
        toolbarMatchesSpec = secondarySameRow && analyzeBelow;
      }

      // Check close button doesn't overlap header title
      const headerTitle = document.getElementById('screenshot-analyzer-title');
      const titleRect = headerTitle.getBoundingClientRect();
      const closeOverlapsTitle = !(
        closeRect.right < titleRect.left ||
        closeRect.left > titleRect.right ||
        closeRect.bottom < titleRect.top ||
        closeRect.top > titleRect.bottom
      );

      // Check letter-by-letter collapse (width should be at least 60px and height at least 38px)
      const clearBtnNormal = clearRect.width >= 60 && clearRect.height >= 38;
      const extractBtnNormal = extractRect.width >= 90 && extractRect.height >= 38;
      const analyzeBtnNormal = analyzeRect.width >= 120 && analyzeRect.height >= 38;

      return {
        docScrollWidth,
        docClientWidth,
        modalScrollWidth,
        modalClientWidth,
        panelScrollWidth,
        panelClientWidth,
        panelRectWidth: panelRect.width,
        clearRect: { width: clearRect.width, height: clearRect.height, top: clearRect.top, left: clearRect.left },
        extractRect: { width: extractRect.width, height: extractRect.height, top: extractRect.top, left: extractRect.left },
        analyzeRect: { width: analyzeRect.width, height: analyzeRect.height, top: analyzeRect.top, left: analyzeRect.left },
        toolbarMatchesSpec,
        closeOverlapsTitle,
        clearBtnNormal,
        extractBtnNormal,
        analyzeBtnNormal,
        noHorizontalOverflow: docScrollWidth <= docClientWidth && modalScrollWidth <= modalClientWidth && panelScrollWidth <= panelClientWidth
      };
    }, vp.isMobile);

    console.log(`[Empty State] No Horiz Overflow: ${emptyStateMetrics.noHorizontalOverflow}`);
    console.log(`[Empty State] Toolbar matches spec: ${emptyStateMetrics.toolbarMatchesSpec}`);
    console.log(`[Empty State] Close button overlaps title: ${emptyStateMetrics.closeOverlapsTitle}`);
    console.log(`[Empty State] Clear btn: ${Math.round(emptyStateMetrics.clearRect.width)}x${Math.round(emptyStateMetrics.clearRect.height)}`);
    console.log(`[Empty State] Extract btn: ${Math.round(emptyStateMetrics.extractRect.width)}x${Math.round(emptyStateMetrics.extractRect.height)}`);
    console.log(`[Empty State] Analyze btn: ${Math.round(emptyStateMetrics.analyzeRect.width)}x${Math.round(emptyStateMetrics.analyzeRect.height)}`);

    // Screenshot empty state
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `${vp.name}_empty.png`)
    });

    // ── TEST 2: Populated review state ──
    await page.evaluate(() => {
      window.setExtractedReviews([
        {
          id: 'rev-stress-1',
          text: 'Super exceptional sound quality and battery life! Testing word wrapping with a massive non-breaking string: https://very-long-store-url.ecommerce-marketplace.ph/products/reviews/details/item-8484938493829482938492839482938492?tracking=abcdefghijklmnopqrstuvwxyz1234567890&session=abcde_super_long_token. Seller accommodated all requests and packaging was pristine.',
          author: 'super_long_buyer_handle_from_ecommerce_platform_philippines_user_88776655',
          rating: 5,
          language: 'Taglish',
          selected: true,
          warning: 'OCR high-confidence match'
        },
        {
          id: 'rev-stress-2',
          text: 'Legit seller, arrived in 2 days. Saktong sakto sa description.',
          author: 'Juan D.',
          rating: 4,
          language: 'Tagalog',
          selected: true,
          warning: ''
        }
      ]);
    });

    await new Promise(r => setTimeout(r, 100));

    const populatedMetrics = await page.evaluate((isMobile) => {
      const modal = document.getElementById('scan-modal');
      const panel = document.getElementById('scan-modal-panel');
      const list = document.getElementById('extracted-reviews-list');
      const card0 = document.getElementById('extracted-card-0');
      const card1 = document.getElementById('extracted-card-1');

      const panelRect = panel.getBoundingClientRect();

      // Check all visible elements inside panel for overflow
      const elements = Array.from(panel.querySelectorAll('*')).filter(el => {
        if (['OPTION', 'SCRIPT', 'STYLE'].includes(el.tagName)) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });

      const overflowing = [];
      for (const el of elements) {
        const r = el.getBoundingClientRect();
        if (r.right > panelRect.right + 2 || r.left < panelRect.left - 2) {
          overflowing.push({
            tag: el.tagName,
            id: el.id,
            className: el.className.toString(),
            diff: r.right - panelRect.right
          });
        }
      }

      const docScrollWidth = document.documentElement.scrollWidth;
      const docClientWidth = document.documentElement.clientWidth;
      const modalScrollWidth = modal.scrollWidth;
      const modalClientWidth = modal.clientWidth;
      const panelScrollWidth = panel.scrollWidth;
      const panelClientWidth = panel.clientWidth;

      // Textareas fit correctly
      const textarea = card0 ? card0.querySelector('textarea') : null;
      const textareaRect = textarea ? textarea.getBoundingClientRect() : null;
      const textareaFits = textareaRect ? (textareaRect.right <= panelRect.right && textareaRect.left >= panelRect.left) : false;

      // Verify modal scrolls vertically when content height exceeds viewport
      const modalScrollsVertically = modal.scrollHeight > modal.clientHeight;

      return {
        docScrollWidth,
        docClientWidth,
        modalScrollWidth,
        modalClientWidth,
        panelScrollWidth,
        panelClientWidth,
        overflowCount: overflowing.length,
        overflowing: overflowing.slice(0, 3),
        textareaFits,
        modalScrollsVertically,
        noHorizontalOverflow: docScrollWidth <= docClientWidth && modalScrollWidth <= modalClientWidth && panelScrollWidth <= panelClientWidth
      };
    }, vp.isMobile);

    console.log(`[Populated State] No Horiz Overflow: ${populatedMetrics.noHorizontalOverflow}`);
    console.log(`[Populated State] Overflow element count: ${populatedMetrics.overflowCount}`);
    console.log(`[Populated State] Textarea fits inside panel: ${populatedMetrics.textareaFits}`);
    console.log(`[Populated State] Modal vertical scroll active: ${populatedMetrics.modalScrollsVertically}`);

    // Screenshot populated state
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `${vp.name}_populated.png`)
    });

    // ── TEST 3: Scan Results Dashboard state ──
    await page.evaluate(() => {
      window.renderScreenshotScanResult({
        scan_id: 101,
        metrics: {
          total_scanned: 2,
          genuine_detected: 1,
          fake_detected: 1,
          uncertain_detected: 0
        },
        results: [
          {
            author: 'super_long_buyer_handle_from_ecommerce_platform_philippines_user_88776655',
            text: 'Super exceptional sound quality and battery life! Testing word wrapping with a massive non-breaking string: https://very-long-store-url.ecommerce-marketplace.ph/products/reviews/details/item-8484938493829482938492839482938492?tracking=abcdefghijklmnopqrstuvwxyz1234567890. Seller accommodated all requests.',
            is_fake: false,
            classification: 'Likely Genuine',
            confidence_score: 88.5,
            language: 'Taglish',
            fake_probability_percent: 11.5,
            genuine_probability_percent: 88.5
          },
          {
            author: 'Juan D.',
            text: 'Legit seller, arrived in 2 days. Saktong sakto sa description.',
            is_fake: true,
            classification: 'Suspicious Review',
            confidence_score: 91.2,
            language: 'Tagalog',
            fake_probability_percent: 91.2,
            genuine_probability_percent: 8.8
          }
        ]
      });
    });

    await new Promise(r => setTimeout(r, 100));

    const resultsMetrics = await page.evaluate(() => {
      const modal = document.getElementById('scan-modal');
      const panel = document.getElementById('scan-modal-panel');
      const resultPanel = document.getElementById('screenshot-scan-result');
      const reportBtn = document.getElementById('screenshot-view-report-btn');

      const panelRect = panel.getBoundingClientRect();
      const reportBtnRect = reportBtn.getBoundingClientRect();

      const docScrollWidth = document.documentElement.scrollWidth;
      const docClientWidth = document.documentElement.clientWidth;
      const modalScrollWidth = modal.scrollWidth;
      const modalClientWidth = modal.clientWidth;
      const panelScrollWidth = panel.scrollWidth;
      const panelClientWidth = panel.clientWidth;

      const reportBtnFits = reportBtnRect.right <= panelRect.right + 2 && reportBtnRect.left >= panelRect.left - 2;

      return {
        noHorizontalOverflow: docScrollWidth <= docClientWidth && modalScrollWidth <= modalClientWidth && panelScrollWidth <= panelClientWidth,
        reportBtnFits,
        reportBtnWidth: reportBtnRect.width
      };
    });

    console.log(`[Results State] No Horiz Overflow: ${resultsMetrics.noHorizontalOverflow}`);
    console.log(`[Results State] Report button fits inside panel: ${resultsMetrics.reportBtnFits}`);

    // Screenshot results state
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `${vp.name}_results.png`)
    });

    const passed = emptyStateMetrics.noHorizontalOverflow &&
      emptyStateMetrics.toolbarMatchesSpec &&
      !emptyStateMetrics.closeOverlapsTitle &&
      populatedMetrics.noHorizontalOverflow &&
      populatedMetrics.overflowCount === 0 &&
      populatedMetrics.textareaFits &&
      resultsMetrics.noHorizontalOverflow &&
      resultsMetrics.reportBtnFits;

    if (!passed) {
      allPassed = false;
      console.error(`❌ FAILED checks on viewport ${vp.name}`);
    } else {
      console.log(`✅ ALL CHECKS PASSED for ${vp.name}`);
    }

    results.push({
      viewport: vp.name,
      dimensions: `${vp.width}x${vp.height}`,
      passed,
      emptyStateMetrics,
      populatedMetrics,
      resultsMetrics
    });
  }

  await browser.close();

  console.log('\n======================================================');
  console.log('SUMMARY TEST RESULTS:');
  console.log('======================================================');
  for (const r of results) {
    console.log(`${r.passed ? '✅' : '❌'} ${r.viewport} (${r.dimensions}): ${r.passed ? 'PASSED' : 'FAILED'}`);
  }

  if (allPassed) {
    console.log('\n🎉 ALL 10 VIEWPORTS PASSED WITH ZERO HORIZONTAL OVERFLOW & PERFECT ACTION TOOLBAR LAYOUT!');
  } else {
    console.error('\n⚠️ SOME VIEWPORTS FAILED!');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
