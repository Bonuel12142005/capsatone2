// frontend/js/charts.js

const EchoTraceCharts = (() => {
    let dashboardScanChart = null;
    let dashboardPlatformChart = null;
    let reportTrustChart = null;

    const destroyChart = (chartInstance) => {
        if (chartInstance) {
            chartInstance.destroy();
        }
    };

    const renderDashboardCharts = (scans, platforms) => {
        // Destroy existing
        destroyChart(dashboardScanChart);
        destroyChart(dashboardPlatformChart);

        const scanCtx = document.getElementById('dashboardScanChart');
        const platformCtx = document.getElementById('dashboardPlatformChart');

        if (scanCtx) {
            // Label dates & values
            const labels = scans.map(s => {
                const date = new Date(s.scan_date);
                return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            });
            const trustScores = scans.map(s => s.trust_score);

            dashboardScanChart = new Chart(scanCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Trust Score (%)',
                        data: trustScores,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            min: 0,
                            max: 100,
                            grid: { color: 'rgba(255, 255, 255, 0.05)' },
                            ticks: { color: '#9ca3af' }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#9ca3af' }
                        }
                    }
                }
            });
        }

        if (platformCtx) {
            const labels = platforms.map(p => p.platform.toUpperCase());
            const dataValues = platforms.map(p => p.count);

            dashboardPlatformChart = new Chart(platformCtx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: dataValues,
                        backgroundColor: ['#10b981', '#3b82f6', '#06b6d4', '#eab308', '#ec4899', '#8b5cf6'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: '#9ca3af', boxWidth: 12 }
                        }
                    }
                }
            });
        }
    };

    const renderReportCharts = (fakeCount, genuineCount) => {
        destroyChart(reportTrustChart);

        const trustCtx = document.getElementById('reportTrustChart');

        if (trustCtx) {
            reportTrustChart = new Chart(trustCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Genuine Reviews', 'Fake/Spam Reviews'],
                    datasets: [{
                        data: [genuineCount, fakeCount],
                        backgroundColor: ['#10b981', '#ef4444'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    cutout: '70%'
                }
            });
        }
    };

    return {
        renderDashboardCharts,
        renderReportCharts
    };
})();
