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
            medTableBody.innerHTML = `<tr><td colspan="6">No medicines added yet.</td></tr>`;
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

// Search Filter Handler
searchInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allMedicines.filter(m => m.name.toLowerCase().includes(term));
    renderTable(filtered);
});