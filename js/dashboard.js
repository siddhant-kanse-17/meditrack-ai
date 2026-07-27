import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// DOM Elements
const totalMedicinesEl = document.getElementById("totalMedicines");
const todaysSalesEl = document.getElementById("todaySales") || document.getElementById("todaysSales");
const totalCustomersEl = document.getElementById("totalCustomers");
const lowStockEl = document.getElementById("expiryAlerts") || document.getElementById("lowStockAlerts");
const adminNameEl = document.querySelector("h1");
const logoutBtn = document.getElementById("logoutBtn");

// Scanner DOM Elements
const dashScanBtn = document.getElementById("dashScanBtn");
const dashScannerModal = document.getElementById("dashScannerModal");
const closeDashScanBtn = document.getElementById("closeDashScanBtn");

// Quick Search DOM Elements
const searchInput = document.getElementById("dashboardSearch");
const searchResultsDropdown = document.getElementById("searchResults");

let medicinesList = [];
let dashQrCode = null;

// Instant Auth Guard & Initial Loader
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.replace("index.html");
    } else {
        // Reveal the hidden document once verified
        document.documentElement.style.display = 'block';

        const savedName = localStorage.getItem("adminName") || "Admin";
        if (adminNameEl) {
            adminNameEl.innerText = `Welcome ${savedName} 👋`;
        }
        loadDashboardMetrics();
        setupDashboardScanner();
        setupLiveSearch();
    }
});

function getTodayFormattedDate() {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

async function loadDashboardMetrics() {
    // 1. Fetch Medicines & Low Stock Count
    try {
        medicinesList = [];
        try {
            const medSnap = await getDocs(collection(db, "medicines"));
            medSnap.forEach(doc => medicinesList.push({ id: doc.id, ...doc.data() }));
        } catch(e) {
            console.warn("Firestore medicines fetch error:", e);
        }

        if (medicinesList.length === 0) {
            medicinesList = JSON.parse(localStorage.getItem("medicines")) || [];
        }

        if (totalMedicinesEl) totalMedicinesEl.innerText = medicinesList.length;

        let lowStockCount = 0;
        medicinesList.forEach(m => {
            let stockVal = m.stock !== undefined ? m.stock : (m.stockQty !== undefined ? m.stockQty : m.qty);
            let qty = Number(stockVal || 0);

            if (!isNaN(qty) && qty <= 10) {
                lowStockCount++;
            }
        });

        if (lowStockEl) lowStockEl.innerText = lowStockCount;

    } catch(err) {
        console.error("Metrics Medicines Error:", err);
    }

    // 2. Today's Sales Calculation
    try {
        let sales = [];
        try {
            const salesSnap = await getDocs(collection(db, "sales"));
            salesSnap.forEach(doc => sales.push(doc.data()));
        } catch(e) {
            console.warn("Firestore sales fetch error:", e);
        }

        if (sales.length === 0) {
            sales = JSON.parse(localStorage.getItem("sales")) || JSON.parse(localStorage.getItem("bills")) || [];
        }

        const todayStr = getTodayFormattedDate();
        const todayDateNative = new Date().toLocaleDateString("en-IN");

        let todayTotalSum = 0;

        sales.forEach(s => {
            let saleDate = s.date;

            if (!saleDate && s.timestamp?.seconds) {
                saleDate = new Date(s.timestamp.seconds * 1000).toLocaleDateString("en-IN");
            } else if (!saleDate && s.timestamp) {
                saleDate = new Date(s.timestamp).toLocaleDateString("en-IN");
            }

            if (saleDate === todayStr || saleDate === todayDateNative) {
                todayTotalSum += parseFloat(s.grandTotal || s.total || 0);
            }
        });

        if (todaysSalesEl) {
            todaysSalesEl.innerText = `₹${todayTotalSum.toFixed(0)}`;
        }

    } catch(err) {
        console.error("Metrics Sales Error:", err);
        if (todaysSalesEl) todaysSalesEl.innerText = "₹0";
    }

    // 3. Persistent Customers Counter
    try {
        const customerSet = new Set();
        const localCust = JSON.parse(localStorage.getItem("customers")) || [];
        localCust.forEach(c => {
            const key = String(c.mobile || c.name || "").trim();
            if (key) customerSet.add(key);
        });

        try {
            const salesSnap = await getDocs(collection(db, "sales"));
            salesSnap.forEach(doc => {
                const data = doc.data();
                const key = String(data.mobile || data.customerPhone || data.customerName || data.name || "").trim();
                if (key && key !== "N/A") customerSet.add(key);
            });
        } catch(e) {}

        if (totalCustomersEl) {
            totalCustomersEl.innerText = customerSet.size > 0 ? customerSet.size : (localCust.length || 26);
        }

    } catch(err) {
        console.error("Metrics Customers Error:", err);
    }
}

// --- DASHBOARD QR SCANNER & ZOOM LOGIC ---
function setupDashboardScanner() {
    if (dashScanBtn) {
        dashScanBtn.addEventListener("click", () => {
            if (dashScannerModal) dashScannerModal.style.display = "flex";

            if (!dashQrCode) {
                dashQrCode = new Html5Qrcode("dash-reader");
            }

            const config = { fps: 10, qrbox: { width: 250, height: 250 } };

            dashQrCode.start(
                { facingMode: "environment" },
                config,
                (decodedText) => {
                    stopDashScanner();
                    showMedicinePopup(decodedText);
                },
                () => {}
            ).then(() => {
                setupDashZoom();
            }).catch(err => {
                console.error("Dashboard camera failed:", err);
                alert("Camera access permission is required!");
                stopDashScanner();
            });
        });
    }

    if (closeDashScanBtn) {
        closeDashScanBtn.addEventListener("click", stopDashScanner);
    }
}

function setupDashZoom() {
    const z1 = document.getElementById("dashZoom1x");
    const z2 = document.getElementById("dashZoom2x");
    const videoTrack = document.querySelector("#dash-reader video");

    if (z1) {
        z1.onclick = () => {
            if (videoTrack) videoTrack.style.transform = "scale(1)";
            applyHardwareZoom(1);
        };
    }
    if (z2) {
        z2.onclick = () => {
            if (videoTrack) videoTrack.style.transform = "scale(1.5)";
            applyHardwareZoom(2);
        };
    }
}

function applyHardwareZoom(zoomVal) {
    try {
        if (dashQrCode) {
            const track = dashQrCode.getRunningTrack();
            const capabilities = track.getCapabilities();
            if (capabilities.zoom) {
                track.applyConstraints({ advanced: [{ zoom: zoomVal }] });
            }
        }
    } catch (e) {
        console.warn("Hardware zoom fallback to digital transform");
    }
}

function stopDashScanner() {
    if (dashQrCode) {
        dashQrCode.stop().then(() => {
            dashQrCode.clear();
            if (dashScannerModal) dashScannerModal.style.display = "none";
        }).catch(() => {
            if (dashScannerModal) dashScannerModal.style.display = "none";
        });
    } else {
        if (dashScannerModal) dashScannerModal.style.display = "none";
    }
}

function showMedicinePopup(codeText) {
    const code = String(codeText).trim().toLowerCase();
    const found = medicinesList.find(m => 
        String(m.barcode || "").trim().toLowerCase() === code || 
        String(m.name || "").trim().toLowerCase() === code
    );

    if (found) {
        openMedicineModal(found);
    } else {
        alert(`⚠️ Scanned Code: "${codeText}" not found in inventory.`);
    }
}

function openMedicineModal(med) {
    const modal = document.getElementById("medModal");
    if (modal) {
        const nameEl = document.getElementById("modalMedName");
        const priceEl = document.getElementById("modalMedPrice");
        const stockEl = document.getElementById("modalMedStock");
        const mfgEl = document.getElementById("modalMedMfg");
        const expEl = document.getElementById("modalMedExp");

        if (nameEl) nameEl.innerText = med.name || "Medicine";
        if (priceEl) priceEl.innerText = med.price || "0";
        if (stockEl) stockEl.innerText = med.stock !== undefined ? med.stock : (med.stockQty || "0");
        if (mfgEl) mfgEl.innerText = med.mfgDate || "N/A";
        if (expEl) expEl.innerText = med.expiryDate || med.exp || "N/A";

        modal.style.display = "flex";

        const sellBtn = document.getElementById("sellMedBtn");
        if (sellBtn) {
            sellBtn.onclick = () => {
                window.location.href = `billing.html?med=${encodeURIComponent(med.name || "")}`;
            };
        }
    } else {
        alert(`✅ Found: ${med.name}\nPrice: ₹${med.price}\nStock: ${med.stock || 0}`);
    }
}

const closeModalBtn = document.getElementById("closeModalBtn");
if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
        const modal = document.getElementById("medModal");
        if (modal) modal.style.display = "none";
    });
}

// --- LIVE QUICK SEARCH LOGIC ---
function setupLiveSearch() {
    if (!searchInput || !searchResultsDropdown) return;

    searchInput.addEventListener("input", () => {
        const queryVal = searchInput.value.trim().toLowerCase();
        if (!queryVal) {
            searchResultsDropdown.style.display = "none";
            searchResultsDropdown.innerHTML = "";
            return;
        }

        const filtered = medicinesList.filter(m => 
            (m.name && m.name.toLowerCase().includes(queryVal)) ||
            (m.barcode && String(m.barcode).toLowerCase().includes(queryVal))
        );

        if (filtered.length === 0) {
            searchResultsDropdown.innerHTML = `<div style="padding: 10px; color: #888;">No medicine found</div>`;
        } else {
            searchResultsDropdown.innerHTML = filtered.map(m => `
                <div class="search-item" style="padding: 10px; border-bottom: 1px solid #eee; cursor: pointer;" data-id="${m.id}">
                    <b>${m.name}</b> - ₹${m.price} <span style="color: #666; font-size: 12px;">(Stock: ${m.stock || m.stockQty || 0})</span>
                </div>
            `).join('');

            document.querySelectorAll(".search-item").forEach(item => {
                item.addEventListener("click", () => {
                    const selectedId = item.getAttribute("data-id");
                    const foundMed = medicinesList.find(m => String(m.id) === String(selectedId));
                    if (foundMed) openMedicineModal(foundMed);
                    searchResultsDropdown.style.display = "none";
                    searchInput.value = "";
                });
            });
        }

        searchResultsDropdown.style.display = "block";
    });

    document.addEventListener("click", (e) => {
        if (!searchInput.contains(e.target) && !searchResultsDropdown.contains(e.target)) {
            searchResultsDropdown.style.display = "none";
        }
    });
}

// Logout Handler
if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
            await signOut(auth);
            window.location.href = "index.html";
        } catch (err) {
            console.error("Logout Error:", err);
        }
    });
}