import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// DOM Elements
const totalMedicinesEl = document.getElementById("totalMedicines");
const todaysSalesEl = document.getElementById("todaysSales");
const totalCustomersEl = document.getElementById("totalCustomers");
const lowStockEl = document.getElementById("lowStockAlerts");
const adminNameEl = document.getElementById("adminName") || document.querySelector("h1");
const logoutBtn = document.getElementById("logoutBtn");

// Auth Guard & Initial Load
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "index.html";
    } else {
        const savedName = localStorage.getItem("adminName") || "Admin";
        if (adminNameEl && adminNameEl.tagName === "H1") {
            adminNameEl.innerText = `Welcome ${savedName} 👋`;
        }
        loadDashboardMetrics();
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
    // 1. Total Medicines & Always-Active Low Stock Alerts
    try {
        let medicines = [];
        try {
            const medSnap = await getDocs(collection(db, "medicines"));
            medSnap.forEach(doc => medicines.push({ id: doc.id, ...doc.data() }));
        } catch(e) {
            console.warn("Firestore medicines fetch error:", e);
        }

        if (medicines.length === 0) {
            medicines = JSON.parse(localStorage.getItem("medicines")) || [];
        }

        if (totalMedicinesEl) totalMedicinesEl.innerText = medicines.length;

        // Accurate Low Stock Count (checks stock, stockQty, qty <= 10)
        const lowStockCount = medicines.filter(m => {
            const q = Number(m.stock !== undefined ? m.stock : (m.stockQty !== undefined ? m.stockQty : (m.qty !== undefined ? m.qty : 0)));
            return q <= 10;
        }).length;

        if (lowStockEl) lowStockEl.innerText = lowStockCount;

    } catch(err) {
        console.error("Metrics Medicines Error:", err);
    }

    // 2. Today's Sales Calculation (Strict Current Date Match)
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

    // 3. Permanent Customers Count (LocalStorage + Firestore Merged)
    try {
        const customerSet = new Set();

        // Check LocalStorage Customers
        const localCust = JSON.parse(localStorage.getItem("customers")) || [];
        localCust.forEach(c => {
            const key = String(c.mobile || c.name || "").trim();
            if (key) customerSet.add(key);
        });

        // Check Firestore Sales Customers
        try {
            const salesSnap = await getDocs(collection(db, "sales"));
            salesSnap.forEach(doc => {
                const data = doc.data();
                const key = String(data.mobile || data.customerPhone || data.customerName || data.name || "").trim();
                if (key && key !== "N/A") customerSet.add(key);
            });
        } catch(e) {}

        if (totalCustomersEl) {
            totalCustomersEl.innerText = customerSet.size > 0 ? customerSet.size : localCust.length;
        }

    } catch(err) {
        console.error("Metrics Customers Error:", err);
    }
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