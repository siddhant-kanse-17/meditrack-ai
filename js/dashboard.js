import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const welcomeHeading = document.querySelector(".content h1");
const totalMedicines = document.getElementById("totalMedicines");
const todaySales = document.getElementById("todaySales");
const totalCustomers = document.getElementById("totalCustomers");
const lowStockAlerts = document.getElementById("expiryAlerts") || document.getElementById("lowStockAlerts");

// Search & Modal Elements
const searchInput = document.getElementById("dashboardSearch") || document.getElementById("quickSearchInput");
const searchResults = document.getElementById("searchResults");
const medModal = document.getElementById("medModal");
const modalName = document.getElementById("modalMedName");
const modalPrice = document.getElementById("modalMedPrice");
const modalStock = document.getElementById("modalMedStock");
const modalMfg = document.getElementById("modalMedMfg");
const modalExp = document.getElementById("modalMedExp");
const closeModalBtn = document.getElementById("closeModalBtn");
const sellMedBtn = document.getElementById("sellMedBtn");
const logoutBtn = document.getElementById("logoutBtn");

let allMedicinesList = [];
let selectedMedicineForBilling = null;

// Helper: Format Month/Year
function formatMonthYear(val) {
    if (!val) return 'N/A';
    const parts = val.split("-");
    return parts.length === 2 ? `${parts[1]}/${parts[0]}` : val;
}

// 1. Auth & Initial Load
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "index.html";
    } else {
        const displayName = user.displayName || "Admin";
        if (welcomeHeading) {
            welcomeHeading.innerText = `Welcome ${displayName} 👋`;
        }
        loadDashboardStats();
    }
});

// 2. Fetch Dashboard Stats & Build Medicine List
async function loadDashboardStats() {
    try {
        const medSnap = await getDocs(collection(db, "medicines"));
        if (totalMedicines) totalMedicines.innerText = medSnap.size;

        allMedicinesList = [];
        let lowStockCount = 0;

        medSnap.forEach((docSnap) => {
            const med = { id: docSnap.id, ...docSnap.data() };
            allMedicinesList.push(med);

            if (Number(med.stock || 0) <= 10) {
                lowStockCount++;
            }
        });

        if (lowStockAlerts) lowStockAlerts.innerText = lowStockCount;

        // Sales Data
        const salesSnap = await getDocs(collection(db, "sales"));
        let totalSalesSum = 0;
        const customerMobiles = new Set();

        salesSnap.forEach((docSnap) => {
            const sale = docSnap.data();
            totalSalesSum += Number(sale.grandTotal || 0);

            if (sale.mobile) {
                customerMobiles.add(sale.mobile);
            }
        });

        if (todaySales) todaySales.innerText = "₹" + totalSalesSum;
        if (totalCustomers) totalCustomers.innerText = customerMobiles.size;

    } catch (err) {
        console.error("Dashboard Stats Error:", err);
    }
}

// 3. Search Medicine Live Listener
if (searchInput) {
    searchInput.addEventListener("input", (e) => {
        const term = e.target.value.toLowerCase().trim();
        searchResults.innerHTML = "";

        if (term === "") {
            searchResults.style.display = "none";
            return;
        }

        const filtered = allMedicinesList.filter(m => 
            (m.name || "").toLowerCase().includes(term) || 
            (m.barcode && m.barcode.toLowerCase() === term)
        );

        if (filtered.length === 0) {
            searchResults.innerHTML = `<div style="padding: 10px; color: #888;">No medicine found</div>`;
        } else {
            filtered.forEach(med => {
                const item = document.createElement("div");
                item.style.cssText = "padding: 10px; cursor: pointer; border-bottom: 1px solid #eee;";
                item.innerHTML = `<b>${med.name}</b> <span style="float: right; color: #007bff;">₹${med.price}</span>`;
                
                item.addEventListener("click", () => {
                    openMedicineModal(med);
                    searchResults.style.display = "none";
                    searchInput.value = "";
                });

                searchResults.appendChild(item);
            });
        }

        searchResults.style.display = "block";
    });
}

// 4. Open Modal Function
function openMedicineModal(med) {
    selectedMedicineForBilling = med;
    if (modalName) modalName.innerText = med.name || "N/A";
    if (modalPrice) modalPrice.innerText = med.price || 0;
    if (modalStock) modalStock.innerText = med.stock || 0;
    if (modalMfg) modalMfg.innerText = formatMonthYear(med.mfgDate);
    if (modalExp) modalExp.innerText = formatMonthYear(med.expiryDate);

    if (medModal) medModal.style.display = "flex";
}

// Close Modal
if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
        if (medModal) medModal.style.display = "none";
    });
}

// Redirect to Billing Page with Auto-Selected Medicine
if (sellMedBtn) {
    sellMedBtn.addEventListener("click", () => {
        if (selectedMedicineForBilling) {
            localStorage.setItem("selectedMedForBilling", JSON.stringify(selectedMedicineForBilling));
            window.location.href = "billing.html";
        }
    });
}

// Logout Listener
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

// Reset Data Event Listener
const resetBtn = document.getElementById('resetDataBtn');
if (resetBtn) {
    resetBtn.addEventListener('click', function() {
        const confirmReset = confirm("Kya aap saara data format/reset karna chahte ho? Ye action undo nahi ho sakta.");
        
        if (confirmReset) {
            localStorage.clear();
            alert("Data reset ho gaya hai! Fresh start ke liye page reload ho raha hai.");
            window.location.reload();
        }
    });
}

// 5. Camera Scan & Quick Search Auto-Trigger Logic
let dashScanner = null;
const dashScanBtn = document.getElementById('dashScanBtn');
const closeDashScanBtn = document.getElementById('closeDashScanBtn');
const dashModal = document.getElementById('dashScannerModal');

if (dashScanBtn) {
    dashScanBtn.addEventListener('click', function () {
        if (dashModal) dashModal.style.display = 'flex';
        
        dashScanner = new Html5Qrcode("dash-reader");
        const config = { fps: 10, qrbox: { width: 250, height: 150 } };

        dashScanner.start(
            { facingMode: "environment" },
            config,
            async (decodedText) => {
                // Check Firestore list first, fallback to localStorage
                const localMeds = JSON.parse(localStorage.getItem('medicines')) || [];
                const combinedList = [...allMedicinesList, ...localMeds];
                
                const matchedMed = combinedList.find(m => m.barcode === decodedText || m.id === decodedText);

                // Auto-fill and trigger search input
                if (searchInput) {
                    searchInput.value = matchedMed ? matchedMed.name : decodedText;
                    searchInput.dispatchEvent(new Event('input'));
                }

                // Stop camera & close modal
                await dashScanner.stop();
                if (dashModal) dashModal.style.display = 'none';
            }
        ).catch(err => {
            alert("Camera Permission Failed: " + err);
            if (dashModal) dashModal.style.display = 'none';
        });
    });
}

if (closeDashScanBtn) {
    closeDashScanBtn.addEventListener('click', function () {
        if (dashScanner) {
            dashScanner.stop().then(() => {
                if (dashModal) dashModal.style.display = 'none';
            }).catch(() => {
                if (dashModal) dashModal.style.display = 'none';
            });
        } else {
            if (dashModal) dashModal.style.display = 'none';
        }
    });
}