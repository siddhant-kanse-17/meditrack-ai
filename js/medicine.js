import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// DOM Elements
const medForm = document.getElementById("medicineForm");
const medBarcodeInput = document.getElementById("medBarcode") || document.getElementById("barcode");
const medNameInput = document.getElementById("medName") || document.getElementById("name");
const medPriceInput = document.getElementById("medPrice") || document.getElementById("price");
const medStockInput = document.getElementById("medStock") || document.getElementById("stock");
const medMfgInput = document.getElementById("medMfgDate") || document.getElementById("mfgDate");
const medExpInput = document.getElementById("medExpDate") || document.getElementById("expiryDate");
const addMedBtn = document.getElementById("addMedBtn");

const searchInput = document.getElementById("searchMedicine");
const medTableBody = document.getElementById("medicineTableBody") || document.getElementById("medicineTable");

const scanBtn = document.getElementById("scanBarcodeBtn") || document.getElementById("scanBtn") || document.getElementById("startScanBtn");
const modal = document.getElementById("medScannerModal") || document.getElementById("scannerModal");
const closeBtn = document.getElementById("closeMedScanBtn") || document.getElementById("closeScanBtn");

let allMedicines = [];
let editingMedId = null;
let html5QrCode = null;

// Instant Auth Guard
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.replace("index.html");
    } else {
        document.documentElement.style.display = 'block';
        loadMedicines();
    }
});

// Helper Function: Formats YYYY-MM to MM/YYYY
function formatMonthYear(val) {
    if (!val) return 'N/A';
    const parts = val.split("-");
    if (parts.length === 2) {
        return `${parts[1]}/${parts[0]}`;
    }
    return val;
}

// Load Medicines from Firestore & Sync Local Storage Backup
async function loadMedicines() {
    try {
        allMedicines = [];
        if (medTableBody) medTableBody.innerHTML = "";

        // 1. Try fetching from Firestore
        try {
            const querySnapshot = await getDocs(collection(db, "medicines"));
            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                allMedicines.push({ id: docSnap.id, ...data });
            });
        } catch(e) {
            console.warn("Firestore fetch error, reading local backup:", e);
        }

        // 2. Local Cache Sync Fallback
        const localMeds = JSON.parse(localStorage.getItem("medicines")) || [];
        
        if (allMedicines.length === 0) {
            allMedicines = localMeds;
        } else {
            // Sync local storage stock with loaded medicines
            allMedicines = allMedicines.map(med => {
                const localMatch = localMeds.find(l => l.id === med.id || l.name === med.name);
                if (localMatch) {
                    const latestStock = localMatch.stock !== undefined ? localMatch.stock : (localMatch.stockQty !== undefined ? localMatch.stockQty : med.stock);
                    return { ...med, stock: latestStock, stockQty: latestStock };
                }
                return med;
            });
        }

        if (allMedicines.length === 0) {
            if (medTableBody) medTableBody.innerHTML = `<tr><td colspan="7">No medicines added yet.</td></tr>`;
            return;
        }

        renderTable(allMedicines);

    } catch (err) {
        console.error("Error loading medicines:", err);
    }
}

// Render Table Data
function renderTable(medicinesList) {
    if (!medTableBody) return;
    medTableBody.innerHTML = "";
    
    medicinesList.forEach((med) => {
        const tr = document.createElement("tr");

        const currentStock = med.stock !== undefined ? med.stock : (med.stockQty !== undefined ? med.stockQty : 0);
        const stockBadgeStyle = currentStock <= 5 ? "color: #dc3545; font-weight: bold;" : "";

        tr.innerHTML = `
            <td><code>${med.barcode || 'N/A'}</code></td>
            <td><b>${med.name || 'N/A'}</b></td>
            <td>₹${med.price || 0}</td>
            <td style="${stockBadgeStyle}">${currentStock}</td>
            <td>${formatMonthYear(med.mfgDate)}</td>
            <td>${formatMonthYear(med.expiryDate || med.expDate)}</td>
            <td style="display: flex; gap: 5px;">
                <button class="edit-btn" style="background:#28a745; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;" data-id="${med.id}">Edit</button>
                <button class="delete-btn" style="background:#dc3545; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;" data-id="${med.id}">Delete</button>
            </td>
        `;

        medTableBody.appendChild(tr);
    });

    // Edit Button Handlers
    document.querySelectorAll(".edit-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            const medId = e.target.getAttribute("data-id");
            const medToEdit = allMedicines.find(m => m.id === medId);

            if (!medToEdit) return;

            const stockVal = medToEdit.stock !== undefined ? medToEdit.stock : (medToEdit.stockQty !== undefined ? medToEdit.stockQty : "");

            if (medBarcodeInput) medBarcodeInput.value = medToEdit.barcode || "";
            if (medNameInput) medNameInput.value = medToEdit.name || "";
            if (medPriceInput) medPriceInput.value = medToEdit.price || "";
            if (medStockInput) medStockInput.value = stockVal;
            if (medMfgInput) medMfgInput.value = medToEdit.mfgDate || "";
            if (medExpInput) medExpInput.value = medToEdit.expiryDate || medToEdit.expDate || "";

            editingMedId = medId;
            if (addMedBtn) {
                addMedBtn.innerText = "Update Medicine";
                addMedBtn.style.background = "#28a745";
            }

            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });

    // Delete Button Handlers
    document.querySelectorAll(".delete-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            const medId = e.target.getAttribute("data-id");
            if (confirm("Are you sure you want to delete this medicine?")) {
                try {
                    await deleteDoc(doc(db, "medicines", medId));
                } catch(err) {
                    console.warn("Firestore delete fallback:", err);
                }

                let localMeds = JSON.parse(localStorage.getItem("medicines")) || [];
                localMeds = localMeds.filter(m => m.id !== medId);
                localStorage.setItem("medicines", JSON.stringify(localMeds));

                loadMedicines();
            }
        });
    });
}

// Add or Update Medicine Handler
if (medForm) {
    medForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const stockNum = Number(medStockInput ? medStockInput.value : 0);

        const medData = {
            barcode: medBarcodeInput ? medBarcodeInput.value.trim() : "",
            name: medNameInput ? medNameInput.value.trim() : "",
            price: Number(medPriceInput ? medPriceInput.value : 0),
            stock: stockNum,
            stockQty: stockNum,
            mfgDate: medMfgInput ? medMfgInput.value || "" : "",
            expiryDate: medExpInput ? medExpInput.value || "" : "",
            updatedAt: new Date().toISOString()
        };

        if (!medData.name) return alert("Please enter medicine name!");

        try {
            if (editingMedId) {
                await updateDoc(doc(db, "medicines", editingMedId), medData);
                
                let localMeds = JSON.parse(localStorage.getItem("medicines")) || [];
                const idx = localMeds.findIndex(m => m.id === editingMedId);
                if (idx !== -1) {
                    localMeds[idx] = { ...localMeds[idx], ...medData };
                    localStorage.setItem("medicines", JSON.stringify(localMeds));
                }

                editingMedId = null;
                if (addMedBtn) {
                    addMedBtn.innerText = "Add Medicine";
                    addMedBtn.style.background = "#007bff";
                }
            } else {
                medData.createdAt = new Date().toISOString();
                const docRef = await addDoc(collection(db, "medicines"), medData);
                
                let localMeds = JSON.parse(localStorage.getItem("medicines")) || [];
                localMeds.push({ id: docRef.id, ...medData });
                localStorage.setItem("medicines", JSON.stringify(localMeds));
            }

            medForm.reset();
            loadMedicines();

        } catch (err) {
            console.warn("Firestore error, fallback to local save:", err);
            let localMeds = JSON.parse(localStorage.getItem("medicines")) || [];
            localMeds.push({ id: "LOCAL-" + Date.now(), ...medData });
            localStorage.setItem("medicines", JSON.stringify(localMeds));
            
            medForm.reset();
            loadMedicines();
        }
    });
}

// Search Filter
if (searchInput) {
    searchInput.addEventListener("input", (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allMedicines.filter(m => 
            (m.name && m.name.toLowerCase().includes(term)) || 
            (m.barcode && m.barcode.toLowerCase().includes(term))
        );
        renderTable(filtered);
    });
}

// 🌐 Public Database Auto-Fetch Function
async function autoFetchPharmaDetails(barcode) {
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const data = await response.json();

    if (data.status === 1 && data.product) {
      const p = data.product;
      const fetchedName = p.product_name || p.product_name_en || p.generic_name || "";
      if (fetchedName && medNameInput) {
        medNameInput.value = fetchedName;
      }
      if (p.price && medPriceInput) {
        medPriceInput.value = p.price;
      }
    } else {
      if (medNameInput) medNameInput.focus();
    }
  } catch (error) {
    console.error("API Fetch Error:", error);
    if (medNameInput) medNameInput.focus();
  }
}

// Camera Scanner Implementation
if (scanBtn) {
  scanBtn.addEventListener('click', function () {
    const targetModal = document.getElementById("medScannerModal") || document.getElementById("scannerModal");
    if (targetModal) targetModal.style.display = 'flex';

    const readerId = document.getElementById("med-reader") ? "med-reader" : "reader";
    html5QrCode = new Html5Qrcode(readerId);

    const config = { fps: 10, qrbox: { width: 220, height: 220 } };

    html5QrCode.start(
      { facingMode: "environment" },
      config,
      async (decodedText) => {
        if (medBarcodeInput) {
          medBarcodeInput.value = decodedText;
        }

        stopScanner();
        await autoFetchPharmaDetails(decodedText);
      }
    ).catch(err => {
      alert("Camera Permission Error: " + err);
      stopScanner();
    });
  });
}

if (closeBtn) {
  closeBtn.addEventListener('click', stopScanner);
}

function stopScanner() {
  const targetModal = document.getElementById("medScannerModal") || document.getElementById("scannerModal");
  if (html5QrCode) {
    html5QrCode.stop().then(() => {
      html5QrCode.clear();
      if (targetModal) targetModal.style.display = 'none';
    }).catch(() => {
      if (targetModal) targetModal.style.display = 'none';
    });
  } else {
    if (targetModal) targetModal.style.display = 'none';
  }
}