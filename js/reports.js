import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
const expiredCountEl = document.getElementById("expiredCount");
const expiringSoonCountEl = document.getElementById("expiringSoonCount");
const totalBatchesEl = document.getElementById("totalBatches");
const expiryReportTable = document.getElementById("expiryReportTable");
const todayReportDateEl = document.getElementById("todayReportDate");

// Auth Guard & Core Loader
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "index.html";
    } else {
        loadExpiryReports();
        initDailySalesReport();
    }
});

const today = new Date();
if (todayReportDateEl) {
    todayReportDateEl.innerText = today.toLocaleDateString("en-IN");
}

/**
 * Format YYYY-MM into MM/YYYY for presentation
 */
function formatMonthYear(val) {
    if (!val) return 'N/A';
    const parts = val.split("-");
    if (parts.length === 2) {
        return `${parts[1]}/${parts[0]}`;
    }
    return val;
}

/**
 * Load Inventory & Expiry Reports
 */
async function loadExpiryReports() {
    try {
        const querySnapshot = await getDocs(collection(db, "medicines"));
        
        let expiredCount = 0;
        let expiringSoonCount = 0;
        let totalItems = querySnapshot.size;

        if (!expiryReportTable) return;
        expiryReportTable.innerHTML = "";

        if (totalItems === 0) {
            expiryReportTable.innerHTML = `<tr><td colspan="4" style="text-align: center;">No medicine records found.</td></tr>`;
            return;
        }

        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1; // 1 to 12

        querySnapshot.forEach((docSnap) => {
            const med = docSnap.data();
            let statusBadge = `<span style="background: #28a745; color: white; padding: 4px 8px; border-radius: 4px;">Safe</span>`;

            // Expiry Date logic
            if (med.expiryDate && med.expiryDate.includes("-")) {
                const parts = med.expiryDate.split("-");
                const expYear = parseInt(parts[0], 10);
                const expMonth = parseInt(parts[1], 10);

                if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) {
                    expiredCount++;
                    statusBadge = `<span style="background: #dc3545; color: white; padding: 4px 8px; border-radius: 4px;">Expired</span>`;
                } else if (expYear === currentYear && expMonth === currentMonth) {
                    expiringSoonCount++;
                    statusBadge = `<span style="background: #ffc107; color: black; padding: 4px 8px; border-radius: 4px;">Expiring Soon</span>`;
                }
            }

            // Low Stock Check
            const stockQty = Number(med.stock || 0);
            let stockDisplay = `${stockQty} pcs`;
            if (stockQty <= 10) {
                stockDisplay = `<span style="color: #dc3545; font-weight: bold; background: #ffe6e6; padding: 3px 8px; border-radius: 4px; border: 1px solid #ff4d4d;">⚠️ ${stockQty} pcs (Low Stock)</span>`;
            }

            expiryReportTable.innerHTML += `
                <tr>
                    <td><b>${med.name || "N/A"}</b></td>
                    <td>${stockDisplay}</td>
                    <td>${formatMonthYear(med.expiryDate)}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        });

        if (expiredCountEl) expiredCountEl.innerText = expiredCount;
        if (expiringSoonCountEl) expiringSoonCountEl.innerText = expiringSoonCount;
        if (totalBatchesEl) totalBatchesEl.innerText = totalItems;

    } catch (err) {
        console.error("Error loading expiry report:", err);
        if (expiryReportTable) {
            expiryReportTable.innerHTML = `<tr><td colspan="4" style="color: red; text-align: center;">Error loading reports data.</td></tr>`;
        }
    }
}

/**
 * Date-Wise Sales Report Handler (Firestore + LocalStorage aggregation)
 */
function initDailySalesReport() {
    const cardBtn = document.getElementById('dailySalesBtnCard');
    const modal = document.getElementById('salesReportModal');
    const closeBtn = document.getElementById('closeReportModalBtn');
    const modalBody = document.getElementById('dailySalesModalBody');

    if (!cardBtn || !modal) return;

    // Open Modal and calculate sales by date
    cardBtn.addEventListener('click', async function () {
        if (modalBody) {
            modalBody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:15px;">Loading sales...</td></tr>`;
        }
        modal.style.display = 'flex';

        let salesData = [];

        // Try fetching from Firestore first
        try {
            const salesQuery = query(collection(db, "sales"), orderBy("timestamp", "desc"));
            const querySnapshot = await getDocs(salesQuery);
            querySnapshot.forEach((doc) => {
                salesData.push({ id: doc.id, ...doc.data() });
            });
        } catch (e) {
            console.warn("Firestore fetch failed for reports, checking local storage:", e);
        }

        // Fallback to LocalStorage if Firestore returned nothing
        if (salesData.length === 0) {
            salesData = JSON.parse(localStorage.getItem('sales')) || JSON.parse(localStorage.getItem('bills')) || [];
        }

        if (salesData.length === 0) {
            if (modalBody) {
                modalBody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 15px; color: #888;">No sales records found.</td></tr>`;
            }
            return;
        }

        // Group total amount and orders count by date
        const salesByDate = {};

        salesData.forEach(sale => {
            let dateKey = sale.date;

            // Handle timestamp formats
            if (!dateKey && sale.timestamp?.seconds) {
                dateKey = new Date(sale.timestamp.seconds * 1000).toLocaleDateString("en-IN");
            } else if (!dateKey && sale.timestamp) {
                dateKey = new Date(sale.timestamp).toLocaleDateString("en-IN");
            }

            if (!dateKey) {
                dateKey = "Unknown Date";
            }

            const amount = parseFloat(sale.grandTotal || sale.total || 0);

            if (!salesByDate[dateKey]) {
                salesByDate[dateKey] = { totalSales: 0, totalOrders: 0 };
            }

            salesByDate[dateKey].totalSales += amount;
            salesByDate[dateKey].totalOrders += 1;
        });

        // Render aggregated results table
        if (modalBody) {
            modalBody.innerHTML = Object.keys(salesByDate).map(date => {
                const info = salesByDate[date];
                return `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 10px; font-weight: bold;">${date}</td>
                        <td style="padding: 10px; text-align: center;">${info.totalOrders} Bills</td>
                        <td style="padding: 10px; text-align: right; color: #28a745; font-weight: bold;">₹${info.totalSales.toFixed(2)}</td>
                    </tr>
                `;
            }).join('');
        }
    });

    // Close modal handler
    if (closeBtn) {
        closeBtn.addEventListener('click', function () {
            modal.style.display = 'none';
        });
    }
}
// Function for Date-Wise Sales Popup
function initDailySalesModal() {
  const salesBtn = document.getElementById('dailySalesBtnCard');
  const modal = document.getElementById('salesReportModal');
  const closeBtn = document.getElementById('closeReportModalBtn');
  const modalBody = document.getElementById('dailySalesModalBody');

  if (!salesBtn || !modal) return;

  salesBtn.addEventListener('click', function () {
    const salesData = JSON.parse(localStorage.getItem('sales')) || JSON.parse(localStorage.getItem('bills')) || [];

    if (salesData.length === 0) {
      modalBody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 15px; color: #888;">No sales record found.</td></tr>`;
      modal.style.display = 'flex';
      return;
    }

    const salesByDate = {};

    salesData.forEach(s => {
      let dateKey = s.date || (s.timestamp ? new Date(s.timestamp).toLocaleDateString() : 'Unknown');
      let amount = parseFloat(s.grandTotal || s.total || 0);

      if (!salesByDate[dateKey]) {
        salesByDate[dateKey] = { totalSales: 0, orderCount: 0 };
      }

      salesByDate[dateKey].totalSales += amount;
      salesByDate[dateKey].orderCount += 1;
    });

    modalBody.innerHTML = Object.keys(salesByDate).map(date => {
      const data = salesByDate[date];
      return `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 10px; font-weight: bold;">${date}</td>
          <td style="padding: 10px;">${data.orderCount} Bills</td>
          <td style="padding: 10px; color: #28a745; font-weight: bold;">₹${data.totalSales.toFixed(2)}</td>
        </tr>
      `;
    }).join("");

    modal.style.display = 'flex';
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      modal.style.display = 'none';
    });
  }
}

document.addEventListener('DOMContentLoaded', initDailySalesModal);