import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";

const welcomeHeading = document.querySelector(".content h1");
const totalMedicines = document.getElementById("totalMedicines");
const todaySales = document.getElementById("todaySales");
const totalCustomers = document.getElementById("totalCustomers");
const lowStockAlerts = document.getElementById("expiryAlerts") || document.getElementById("lowStockAlerts");

// Search & Modal Elements
const searchInput = document.getElementById("dashboardSearch");
const searchResults = document.getElementById("searchResults");
const medModal = document.getElementById("medModal");
const modalName = document.getElementById("modalMedName");
const modalPrice = document.getElementById("modalMedPrice");
const modalStock = document.getElementById("modalMedStock");
const modalMfg = document.getElementById("modalMedMfg");
const modalExp = document.getElementById("modalMedExp");
const closeModalBtn = document.getElementById("closeModalBtn");
const sellMedBtn = document.getElementById("sellMedBtn");

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

        const filtered = allMedicinesList.filter(m => m.name.toLowerCase().includes(term));

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
    modalName.innerText = med.name;
    modalPrice.innerText = med.price;
    modalStock.innerText = med.stock;
    modalMfg.innerText = formatMonthYear(med.mfgDate);
    modalExp.innerText = formatMonthYear(med.expiryDate);

    medModal.style.display = "flex";
}

// Close Modal
if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
        medModal.style.display = "none";
    });
}

// Redirect to Billing Page with Auto-Selected Medicine
if (sellMedBtn) {
    sellMedBtn.addEventListener("click", () => {
        if (selectedMedicineForBilling) {
            // Save selected medicine to localStorage so billing.html can read it
            localStorage.setItem("selectedMedForBilling", JSON.stringify(selectedMedicineForBilling));
            window.location.href = "billing.html";
        }
    });
}
