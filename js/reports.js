import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";

const expiredCountEl = document.getElementById("expiredCount");
const expiringSoonCountEl = document.getElementById("expiringSoonCount");
const totalBatchesEl = document.getElementById("totalBatches");
const expiryReportTable = document.getElementById("expiryReportTable");
const todayReportDateEl = document.getElementById("todayReportDate");

// Auth Guard
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "index.html";
    } else {
        loadExpiryReports();
    }
});

const today = new Date();
if (todayReportDateEl) {
    todayReportDateEl.innerText = today.toLocaleDateString("en-IN");
}

// Helper Function: YYYY-MM ko MM/YYYY display format me badalne ke liye
function formatMonthYear(val) {
    if (!val) return 'N/A';
    const parts = val.split("-");
    if (parts.length === 2) {
        return `${parts[1]}/${parts[0]}`;
    }
    return val;
}

async function loadExpiryReports() {
    try {
        const querySnapshot = await getDocs(collection(db, "medicines"));
        
        let expiredCount = 0;
        let expiringSoonCount = 0;
        let totalItems = querySnapshot.size;

        if (!expiryReportTable) return;
        expiryReportTable.innerHTML = "";

        if (totalItems === 0) {
            expiryReportTable.innerHTML = `<tr><td colspan="4">No medicine records found.</td></tr>`;
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

            // Low Stock Check (<= 10 pcs red styling)
            const stockQty = Number(med.stock || 0);
            let stockDisplay = `${stockQty} pcs`;
            if (stockQty <= 10) {
                stockDisplay = `<span style="color: #dc3545; font-weight: bold; background: #ffe6e6; padding: 3px 8px; border-radius: 4px; border: 1px solid #ff4d4d;">⚠️ ${stockQty} pcs (Low Stock)</span>`;
            }

            expiryReportTable.innerHTML += `
                <tr>
                    <td><b>${med.name}</b></td>
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
            expiryReportTable.innerHTML = `<tr><td colspan="4" style="color: red;">Error loading reports data.</td></tr>`;
        }
    }
}