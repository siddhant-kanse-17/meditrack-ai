import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "firebase/auth";
import { 
    collection, 
    addDoc, 
    getDocs, 
    deleteDoc, 
    updateDoc,
    doc 
} from "firebase/firestore";

const medForm = document.getElementById("medicineForm");
const medBarcodeInput = document.getElementById("medBarcode");
const medNameInput = document.getElementById("medName");
const medPriceInput = document.getElementById("medPrice");
const medStockInput = document.getElementById("medStock");
const medMfgInput = document.getElementById("medMfgDate");
const medExpInput = document.getElementById("medExpDate");
const addMedBtn = document.getElementById("addMedBtn");

const searchInput = document.getElementById("searchMedicine");
const medTableBody = document.getElementById("medicineTableBody");

let allMedicines = [];
let editingMedId = null; // Tracks if we are editing an existing medicine

// Auth Guard
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "index.html";
    } else {
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

// Load Medicines from Firestore
async function loadMedicines() {
    try {
        const querySnapshot = await getDocs(collection(db, "medicines"));
        allMedicines = [];
        medTableBody.innerHTML = "";

        if (querySnapshot.empty) {
            medTableBody.innerHTML = `<tr><td colspan="7">No medicines added yet.</td></tr>`;
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            allMedicines.push({ id: docSnap.id, ...data });
        });

        renderTable(allMedicines);

    } catch (err) {
        console.error("Error loading medicines:", err);
    }
}

// Render Table Data
function renderTable(medicinesList) {
    medTableBody.innerHTML = "";
    
    medicinesList.forEach((med) => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td><code>${med.barcode || 'N/A'}</code></td>
            <td><b>${med.name}</b></td>
            <td>₹${med.price}</td>
            <td>${med.stock}</td>
            <td>${formatMonthYear(med.mfgDate)}</td>
            <td>${formatMonthYear(med.expiryDate)}</td>
            <td style="display: flex; gap: 5px;">
                <button class="edit-btn" style="background:#28a745; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;" data-id="${med.id}">Edit</button>
                <button class="delete-btn" style="background:#dc3545; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;" data-id="${med.id}">Delete</button>
            </td>
        `;

        medTableBody.appendChild(tr);
    });

    // Edit Button Handlers (Autofills Form)
    document.querySelectorAll(".edit-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            const medId = e.target.getAttribute("data-id");
            const medToEdit = allMedicines.find(m => m.id === medId);

            if (!medToEdit) return;

            // Fill input fields with existing values
            if (medBarcodeInput) medBarcodeInput.value = medToEdit.barcode || "";
            medNameInput.value = medToEdit.name || "";
            medPriceInput.value = medToEdit.price || "";
            medStockInput.value = medToEdit.stock || "";
            medMfgInput.value = medToEdit.mfgDate || "";
            medExpInput.value = medToEdit.expiryDate || "";

            editingMedId = medId;
            if (addMedBtn) {
                addMedBtn.innerText = "Update Medicine";
                addMedBtn.style.background = "#28a745";
            }

            // Scroll smoothly to top form
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });

    // Delete Button Handlers
    document.querySelectorAll(".delete-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            const medId = e.target.getAttribute("data-id");
            if (confirm("Are you sure you want to delete this medicine?")) {
                await deleteDoc(doc(db, "medicines", medId));
                loadMedicines();
            }
        });
    });
}

// Add or Update Medicine Handler
medForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const medData = {
        barcode: medBarcodeInput ? medBarcodeInput.value.trim() : "",
        name: medNameInput.value.trim(),
        price: Number(medPriceInput.value),
        stock: Number(medStockInput.value),
        mfgDate: medMfgInput.value || "",
        expiryDate: medExpInput.value || "",
        updatedAt: new Date().toISOString()
    };

    try {
        if (editingMedId) {
            // Update existing record
            await updateDoc(doc(db, "medicines", editingMedId), medData);
            editingMedId = null;
            if (addMedBtn) {
                addMedBtn.innerText = "Add Medicine";
                addMedBtn.style.background = "#007bff";
            }
        } else {
            // Add new record
            medData.createdAt = new Date().toISOString();
            await addDoc(collection(db, "medicines"), medData);
        }

        medForm.reset();
        loadMedicines();

    } catch (err) {
        alert("Operation failed: " + err.message);
    }
});

// Search Filter Handler (Supports Name & Barcode Search)
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

// -------------------------------------------------------------
// Barcode Scanner & Live API Lookup Integration
// -------------------------------------------------------------

let medScanner = null;
const scanBtn = document.getElementById('scanBarcodeBtn');
const closeBtn = document.getElementById('closeMedScanBtn');
const modal = document.getElementById('medScannerModal');

// 🌐 Live API Lookup Function
async function fetchProductDetails(barcode) {
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const data = await response.json();

    if (data.status === 1 && data.product && (data.product.product_name || data.product.product_name_en)) {
      const fetchedName = data.product.product_name || data.product.product_name_en;
      if (medNameInput) {
        medNameInput.value = fetchedName;
      }
    } else {
      // Fallback: Focus on medicine name input if product name is not in public DB
      if (medNameInput) {
        medNameInput.focus();
      }
    }
  } catch (error) {
    console.warn("API Lookup Offline / Error: ", error);
    if (medNameInput) medNameInput.focus();
  }
}

// 📷 Camera Triggering Logic
if (scanBtn) {
  scanBtn.addEventListener('click', function () {
    if (modal) modal.style.display = 'flex';
    medScanner = new Html5Qrcode("med-reader");

    const config = { fps: 10, qrbox: { width: 250, height: 150 } };

    medScanner.start(
      { facingMode: "environment" },
      config,
      async (decodedText) => {
        // 1. Fill scanned Barcode
        if (medBarcodeInput) {
          medBarcodeInput.value = decodedText;
        }

        // 2. Camera Close
        try {
          await medScanner.stop();
        } catch (e) {
          console.warn("Scanner stop issue:", e);
        }
        if (modal) modal.style.display = 'none';

        // 3. Trigger Live API Fetch for Medicine Name
        await fetchProductDetails(decodedText);
      }
    ).catch(err => {
      alert("Camera Access Error: " + err);
      if (modal) modal.style.display = 'none';
    });
  });
}

if (closeBtn) {
  closeBtn.addEventListener('click', function () {
    if (medScanner) {
      medScanner.stop().then(() => {
        if (modal) modal.style.display = 'none';
      }).catch(() => {
        if (modal) modal.style.display = 'none';
      });
    } else {
      if (modal) modal.style.display = 'none';
    }
  });
}