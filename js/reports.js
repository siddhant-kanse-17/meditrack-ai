import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let medicinesList = [];

// Instant Auth Guard
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace("index.html");
  } else {
    document.documentElement.style.display = 'block';
    loadReportsData();
  }
});

// Helper Function: Format Month/Year display
function formatMonthYear(val) {
  if (!val) return 'N/A';
  const parts = val.split("-");
  if (parts.length === 2) {
    return `${parts[1]}/${parts[0]}`;
  }
  return val;
}

// Load Fresh Stock Data & Sync Local Storage Backup
async function loadReportsData() {
  medicinesList = [];

  try {
    // 1. Fetch live updated data from Firestore
    try {
      const querySnapshot = await getDocs(collection(db, "medicines"));
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        medicinesList.push({ id: docSnap.id, ...data });
      });
    } catch (e) {
      console.warn("Firestore fetch error in Reports, reading Local Storage backup:", e);
    }

    // 2. Read LocalStorage and prioritize latest deducted stock
    const localMeds = JSON.parse(localStorage.getItem("medicines")) || [];

    if (medicinesList.length === 0) {
      medicinesList = localMeds;
    } else {
      medicinesList = medicinesList.map((med) => {
        const localMatch = localMeds.find((l) => l.id === med.id || l.name === med.name);
        if (localMatch) {
          const syncedStock = localMatch.stock !== undefined ? localMatch.stock : (localMatch.stockQty !== undefined ? localMatch.stockQty : med.stock);
          return { ...med, stock: syncedStock, stockQty: syncedStock };
        }
        return med;
      });
    }

    renderReportsUI();
  } catch (err) {
    console.error("Reports loading error:", err);
  }
}

// Render Reports UI Table and Metrics
function renderReportsUI() {
  // Dynamic DOM selections to ensure elements exist
  const totalBatchesEl = document.getElementById("totalBatches") || document.getElementById("totalMedicines");
  const expiredEl = document.getElementById("expiredCount");
  const expiringEl = document.getElementById("expiringCount");
  const expiryTableBody = document.getElementById("expiryTableBody") || document.getElementById("reportsTableBody") || document.querySelector("tbody");

  if (totalBatchesEl) totalBatchesEl.innerText = medicinesList.length;

  let expiredCount = 0;
  let expiringSoonCount = 0;

  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1; // 1-12

  if (expiryTableBody) {
    expiryTableBody.innerHTML = ""; // Remove "Loading reports..."
  }

  if (medicinesList.length === 0) {
    if (expiryTableBody) {
      expiryTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No medicines found in records.</td></tr>`;
    }
    return;
  }

  medicinesList.forEach((med) => {
    // Correct stock calculation priority
    const activeStock = med.stock !== undefined ? med.stock : (med.stockQty !== undefined ? med.stockQty : 0);

    let status = "Safe";
    let statusClass = "background: #28a745; color: white; padding: 3px 8px; border-radius: 4px; font-weight: bold;";

    // Expiry Check Logic
    const expVal = med.expiryDate || med.expDate || "";
    if (expVal) {
      const parts = expVal.split("-");
      if (parts.length === 2) {
        const expYear = parseInt(parts[0], 10);
        const expMonth = parseInt(parts[1], 10);

        if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) {
          status = "Expired";
          statusClass = "background: #dc3545; color: white; padding: 3px 8px; border-radius: 4px; font-weight: bold;";
          expiredCount++;
        } else if (expYear === currentYear && expMonth === currentMonth) {
          status = "Expiring Soon";
          statusClass = "background: #ffc107; color: black; padding: 3px 8px; border-radius: 4px; font-weight: bold;";
          expiringSoonCount++;
        }
      }
    }

    if (expiryTableBody) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${med.name || 'N/A'}</b></td>
        <td>${activeStock} pcs</td>
        <td>${formatMonthYear(expVal)}</td>
        <td><span style="${statusClass}">${status}</span></td>
      `;
      expiryTableBody.appendChild(tr);
    }
  });

  if (expiredEl) expiredEl.innerText = expiredCount;
  if (expiringEl) expiringEl.innerText = expiringSoonCount;
}