import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// DOM Elements
const medicineForm = document.getElementById("medicineForm");
const barcodeInput = document.getElementById("medBarcode") || document.getElementById("barcode");
const nameInput = document.getElementById("medName") || document.getElementById("name");
const priceInput = document.getElementById("medPrice") || document.getElementById("price");
const stockInput = document.getElementById("medStock") || document.getElementById("stock");
const mfgInput = document.getElementById("medMfgDate") || document.getElementById("mfgDate");
const expInput = document.getElementById("medExpDate") || document.getElementById("expiryDate");
const medicineTable = document.getElementById("medicineTableBody") || document.getElementById("medicineTable");

const scanBtn = document.getElementById("scanBarcodeBtn") || document.getElementById("scanBtn") || document.getElementById("startScanBtn");
const scannerModal = document.getElementById("medScannerModal") || document.getElementById("scannerModal");
const closeScanBtn = document.getElementById("closeMedScanBtn") || document.getElementById("closeScanBtn");

let medicines = [];
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

async function loadMedicines() {
    try {
        medicines = [];
        try {
            const querySnapshot = await getDocs(collection(db, "medicines"));
            querySnapshot.forEach(docSnap => {
                medicines.push({ id: docSnap.id, ...docSnap.data() });
            });
        } catch(e) {
            console.warn("Firestore fetch error, fallback to local:", e);
        }

        if (medicines.length === 0) {
            medicines = JSON.parse(localStorage.getItem("medicines")) || [];
        }

        renderTable();
    } catch(err) {
        console.error("Load medicines error:", err);
    }
}

function renderTable() {
    if (!medicineTable) return;
    medicineTable.innerHTML = "";

    medicines.forEach(m => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${m.barcode || '-'}</td>
            <td><b>${m.name || 'N/A'}</b></td>
            <td>₹${m.price || 0}</td>
            <td>${m.stock !== undefined ? m.stock : (m.stockQty || 0)}</td>
            <td>${m.mfgDate || '-'}</td>
            <td>${m.expiryDate || m.expDate || '-'}</td>
            <td>
                <button class="delete-btn" data-id="${m.id}" style="background:#dc3545; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Delete</button>
            </td>
        `;
        medicineTable.appendChild(row);
    });

    document.querySelectorAll(".delete-btn").forEach(btn => {
        btn.onclick = () => deleteMedicine(btn.dataset.id);
    });
}

// --- SCANNER & ZOOM LOGIC ---
if (scanBtn) {
    scanBtn.addEventListener("click", () => {
        const targetModal = document.getElementById("medScannerModal") || document.getElementById("scannerModal");
        if (targetModal) targetModal.style.display = "flex";

        const readerId = document.getElementById("med-reader") ? "med-reader" : "reader";

        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode(readerId);
        }

        const config = { fps: 10, qrbox: { width: 220, height: 220 } };

        html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
                stopScanner();
                if (barcodeInput) barcodeInput.value = decodedText;
                alert(`✅ Scanned Code: ${decodedText}`);
            },
            () => {}
        ).then(() => {
            setupZoomControls(readerId);
        }).catch(err => {
            console.error("Camera error:", err);
            alert("Camera access required.");
            stopScanner();
        });
    });
}

function setupZoomControls(containerId) {
    const z1 = document.getElementById("medZoom1x") || document.getElementById("zoom1xBtn");
    const z2 = document.getElementById("medZoom2x") || document.getElementById("zoom2xBtn");
    const container = document.getElementById(containerId);

    if (!container) return;

    // Reset initial zoom state
    container.style.transition = "transform 0.2s ease-in-out";
    container.style.transform = "scale(1)";

    if (z1) {
        z1.onclick = () => {
            container.style.transform = "scale(1)";
            applyHardwareZoom(1);
        };
    }

    if (z2) {
        z2.onclick = () => {
            container.style.transform = "scale(1.4)";
            applyHardwareZoom(2);
        };
    }
}

function applyHardwareZoom(zoomVal) {
    try {
        if (html5QrCode) {
            const track = html5QrCode.getRunningTrack();
            const capabilities = track.getCapabilities();
            if (capabilities && capabilities.zoom) {
                track.applyConstraints({ advanced: [{ zoom: zoomVal }] });
            }
        }
    } catch(e) {
        console.warn("Hardware zoom unsupported, CSS scale active.");
    }
}

if (closeScanBtn) {
    closeScanBtn.addEventListener("click", stopScanner);
}

function stopScanner() {
    const targetModal = document.getElementById("medScannerModal") || document.getElementById("scannerModal");
    const readerId = document.getElementById("med-reader") ? "med-reader" : "reader";
    const container = document.getElementById(readerId);

    if (container) {
        container.style.transform = "scale(1)";
    }

    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            if (targetModal) targetModal.style.display = "none";
        }).catch(() => {
            if (targetModal) targetModal.style.display = "none";
        });
    } else {
        if (targetModal) targetModal.style.display = "none";
    }
}

// Add Medicine Form Handler
if (medicineForm) {
    medicineForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const newMed = {
            barcode: barcodeInput ? barcodeInput.value.trim() : "",
            name: nameInput ? nameInput.value.trim() : "",
            price: priceInput ? parseFloat(priceInput.value) || 0 : 0,
            stock: stockInput ? parseInt(stockInput.value, 10) || 0 : 0,
            mfgDate: mfgInput ? mfgInput.value : "",
            expiryDate: expInput ? expInput.value : ""
        };

        if (!newMed.name) return alert("Please enter medicine name!");

        try {
            await addDoc(collection(db, "medicines"), newMed);
            alert("Medicine Added Successfully! 🎉");
            medicineForm.reset();
            loadMedicines();
        } catch(err) {
            console.warn("Firestore error, saving locally:", err);
            medicines.push({ id: "LOCAL-" + Date.now(), ...newMed });
            localStorage.setItem("medicines", JSON.stringify(medicines));
            alert("Medicine Saved Locally!");
            medicineForm.reset();
            renderTable();
        }
    });
}

async function deleteMedicine(id) {
    if (!confirm("Are you sure you want to delete this medicine?")) return;
    try {
        await deleteDoc(doc(db, "medicines", id));
    } catch(e) {
        console.warn("Local delete fallback");
    }
    medicines = medicines.filter(m => m.id !== id);
    localStorage.setItem("medicines", JSON.stringify(medicines));
    renderTable();
}