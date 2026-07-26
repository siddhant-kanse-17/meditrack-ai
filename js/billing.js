import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, getDocs, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// DOM Elements
const generateBillBtn = document.getElementById("generateBill");
const medicineSelect = document.getElementById("medicineSelect");
const addBillBtn = document.getElementById("addBillItem");
const billTable = document.getElementById("billTable");
const grandTotal = document.getElementById("grandTotal");
const printBtn = document.getElementById("printBill");

const startScanBtn = document.getElementById("startScanBtn");
const scannerModal = document.getElementById("scannerModal");
const closeScanBtn = document.getElementById("closeScanBtn");

const nameEl = document.getElementById("customerName");
const phoneEl = document.getElementById("customerPhone");

let totalAmount = 0;
let billItems = [];
let medicinesList = [];
let html5QrCode = null;

// Auth Guard
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  }
});

// Live Customer Info Mirroring in Bill Preview
if (nameEl) {
  nameEl.addEventListener("input", () => {
    const custDisp = document.getElementById("billCustomer");
    if (custDisp) custDisp.innerText = nameEl.value.trim() || "-";
  });
}

if (phoneEl) {
  phoneEl.addEventListener("input", () => {
    const phoneDisp = document.getElementById("billPhone");
    if (phoneDisp) phoneDisp.innerText = phoneEl.value.trim() || "-";
  });
}

// Setup Invoice Info
const invoiceNo = "INV-" + Date.now();
if (document.getElementById("invoiceNo")) document.getElementById("invoiceNo").innerText = invoiceNo;

const now = new Date();
const formattedDate = now.toLocaleDateString("en-IN");
const formattedTime = now.toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

if (document.getElementById("billDate")) document.getElementById("billDate").innerText = formattedDate;
if (document.getElementById("billTime")) document.getElementById("billTime").innerText = formattedTime;

// Load Medicines
async function loadMedicines() {
  if (!medicineSelect) return;
  medicineSelect.innerHTML = `<option value="">Select Medicine</option>`;
  medicinesList = [];

  try {
    try {
      const querySnapshot = await getDocs(collection(db, "medicines"));
      querySnapshot.forEach((docSnap) => {
        const medicine = docSnap.data();
        medicinesList.push({ id: docSnap.id, ...medicine });
      });
    } catch (e) {
      console.warn("Firestore fetch error, checking local storage:", e);
    }

    if (medicinesList.length === 0) {
      medicinesList = JSON.parse(localStorage.getItem("medicines")) || [];
    }

    medicinesList.forEach((medicine) => {
      medicineSelect.innerHTML += `
        <option value="${medicine.price}" data-barcode="${medicine.barcode || ''}" data-stock="${medicine.stock || medicine.stockQty || 0}" data-id="${medicine.id || ''}" data-name="${medicine.name}">
          ${medicine.name} - ₹${medicine.price}
        </option>`;
    });
  } catch (err) {
    console.error("Error loading medicines:", err);
  }
}
loadMedicines();

// --- BARCODE SCANNER LOGIC ---
if (startScanBtn) {
  startScanBtn.addEventListener("click", () => {
    if (scannerModal) scannerModal.style.display = "flex";

    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode("reader");
    }

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode.start(
      { facingMode: "environment" },
      config,
      (decodedText) => {
        stopScanner();
        handleScannedBarcode(decodedText);
      },
      (err) => {}
    ).catch(err => {
      console.error("Camera access failed:", err);
      alert("Camera permission is required to scan barcodes.");
      stopScanner();
    });
  });
}

if (closeScanBtn) {
  closeScanBtn.addEventListener("click", stopScanner);
}

function stopScanner() {
  if (html5QrCode) {
    html5QrCode.stop().then(() => {
      html5QrCode.clear();
      if (scannerModal) scannerModal.style.display = "none";
    }).catch(err => {
      if (scannerModal) scannerModal.style.display = "none";
    });
  } else {
    if (scannerModal) scannerModal.style.display = "none";
  }
}

function handleScannedBarcode(scannedText) {
  const code = String(scannedText).trim();
  let foundIndex = -1;

  for (let i = 0; i < medicineSelect.options.length; i++) {
    const opt = medicineSelect.options[i];
    const barcodeAttr = opt.getAttribute("data-barcode") || "";
    const nameAttr = opt.getAttribute("data-name") || "";

    if (barcodeAttr.trim() === code || nameAttr.toLowerCase() === code.toLowerCase()) {
      foundIndex = i;
      break;
    }
  }

  if (foundIndex !== -1) {
    medicineSelect.selectedIndex = foundIndex;
    const qtyInput = document.getElementById("qty");
    if (qtyInput) qtyInput.value = 1;
    alert(`✅ Scanned & Selected: ${medicineSelect.options[foundIndex].getAttribute("data-name")}`);
  } else {
    alert(`⚠️ Barcode "${code}" not matched with any medicine.`);
  }
}

// Add Item To Bill
if (addBillBtn) {
  addBillBtn.addEventListener("click", () => {
    const selectedOption = medicineSelect.options[medicineSelect.selectedIndex];
    if (!selectedOption || selectedOption.value === "") return alert("Select a Medicine!");

    const medicineName = selectedOption.getAttribute("data-name");
    const price = Number(selectedOption.value);
    const qtyInput = document.getElementById("qty");
    const qty = Number(qtyInput ? qtyInput.value : 1);

    if (qty <= 0) return alert("Enter valid quantity!");

    const total = price * qty;
    totalAmount += total;

    billItems.push({ medicine: medicineName, name: medicineName, price: price, quantity: qty, total: total });

    if (billTable) {
      billTable.innerHTML += `
        <tr>
          <td>${medicineName}</td>
          <td>₹${price}</td>
          <td>${qty}</td>
          <td>₹${total.toFixed(2)}</td>
        </tr>`;
    }

    if (grandTotal) grandTotal.innerText = `Grand Total: ₹${totalAmount.toFixed(2)}`;
    medicineSelect.selectedIndex = 0;
    if (qtyInput) qtyInput.value = "";
  });
}

// Generate Bill
if (generateBillBtn) {
  generateBillBtn.addEventListener("click", async () => {
    if (billItems.length === 0) return alert("Please add medicines first!");

    const custName = nameEl && nameEl.value.trim() !== "" ? nameEl.value.trim() : "Walk-in Customer";
    const custPhone = phoneEl && phoneEl.value.trim() !== "" ? phoneEl.value.trim() : "N/A";

    try {
      generateBillBtn.disabled = true;
      generateBillBtn.innerText = "Saving Bill...";

      const newBill = {
        invoiceNo: invoiceNo,
        date: formattedDate,
        time: formattedTime,
        grandTotal: totalAmount,
        medicines: billItems
      };

      // 1. Direct LocalStorage Save
      let customers = JSON.parse(localStorage.getItem("customers")) || [];
      const existingIndex = customers.findIndex(c => (custPhone !== "N/A" && c.mobile === custPhone) || (custPhone === "N/A" && c.name === custName));

      if (existingIndex !== -1) {
        customers[existingIndex].name = custName;
        customers[existingIndex].totalBills = (customers[existingIndex].totalBills || 1) + 1;
        customers[existingIndex].totalPurchase = (parseFloat(customers[existingIndex].totalPurchase) || 0) + totalAmount;
        customers[existingIndex].lastPurchase = formattedDate;
        if (!customers[existingIndex].bills) customers[existingIndex].bills = [];
        customers[existingIndex].bills.push(newBill);
      } else {
        customers.push({
          id: "CUST-" + Date.now(),
          name: custName,
          mobile: custPhone,
          totalBills: 1,
          totalPurchase: totalAmount,
          lastPurchase: formattedDate,
          bills: [newBill]
        });
      }

      localStorage.setItem("customers", JSON.stringify(customers));

      // 2. Save To Firestore Async
      await addDoc(collection(db, "sales"), {
        invoiceNo: invoiceNo,
        customerName: custName,
        mobile: custPhone,
        medicines: billItems,
        grandTotal: totalAmount,
        date: formattedDate,
        time: formattedTime,
        timestamp: new Date().toISOString()
      });

      alert("Bill Generated Successfully! 🎉");
      window.location.href = "customers.html";

    } catch (err) {
      alert("Error saving bill: " + err.message);
      generateBillBtn.disabled = false;
      generateBillBtn.innerText = "Generate Bill";
    }
  });
}

if (printBtn) printBtn.addEventListener("click", () => window.print());