import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, getDocs, addDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// Scanner Beep Sound Function (Web Audio API)
function playBeepSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(800, audioCtx.currentTime); 
    gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.12); 
  } catch (e) {
    console.warn("Audio play warning:", e);
  }
}

// Instant Auth Guard
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace("index.html");
  } else {
    document.documentElement.style.display = 'block';
  }
});

// Setup Invoice Info
const invoiceNo = "INV-" + Date.now();
if (document.getElementById("invoiceNo")) document.getElementById("invoiceNo").innerText = invoiceNo;

const now = new Date();
const formattedDate = now.toLocaleDateString("en-IN");
const formattedTime = now.toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

if (document.getElementById("billDate")) document.getElementById("billDate").innerText = formattedDate;
if (document.getElementById("billTime")) document.getElementById("billTime").innerText = formattedTime;

// Load Medicines & Auto-select scanned/passed item
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
      const availableStock = medicine.stock !== undefined ? medicine.stock : (medicine.stockQty || 0);
      medicineSelect.innerHTML += `
        <option value="${medicine.price}" data-barcode="${medicine.barcode || ''}" data-stock="${availableStock}" data-id="${medicine.id || ''}" data-name="${medicine.name}">
          ${medicine.name} - ₹${medicine.price} (Stock: ${availableStock})
        </option>`;
    });

    checkAndAutoSelectMedicine();

  } catch (err) {
    console.error("Error loading medicines:", err);
  }
}
loadMedicines();

function checkAndAutoSelectMedicine() {
  const urlParams = new URLSearchParams(window.location.search);
  const medFromUrl = urlParams.get('med') || urlParams.get('name');
  const barcodeFromUrl = urlParams.get('barcode') || urlParams.get('code');

  let searchName = medFromUrl ? medFromUrl.trim().toLowerCase() : "";
  let searchCode = barcodeFromUrl ? barcodeFromUrl.trim().toLowerCase() : "";

  const savedScanData = localStorage.getItem("selectedScanMedicine");
  if (savedScanData) {
    try {
      const { barcode, name } = JSON.parse(savedScanData);
      if (name) searchName = name.trim().toLowerCase();
      if (barcode) searchCode = barcode.trim().toLowerCase();
      localStorage.removeItem("selectedScanMedicine");
    } catch(e) {
      console.warn("Auto select storage parse error:", e);
    }
  }

  if (!searchName && !searchCode) return;

  let matchedIndex = -1;

  for (let i = 0; i < medicineSelect.options.length; i++) {
    const opt = medicineSelect.options[i];
    const optBarcode = String(opt.getAttribute("data-barcode") || "").trim().toLowerCase();
    const optName = String(opt.getAttribute("data-name") || "").trim().toLowerCase();

    if ((searchCode && optBarcode === searchCode) || (searchName && optName === searchName)) {
      matchedIndex = i;
      break;
    }
  }

  if (matchedIndex !== -1) {
    playBeepSound();
    medicineSelect.selectedIndex = matchedIndex;
    const qtyInput = document.getElementById("qty");
    if (qtyInput) qtyInput.value = 1;
  }
}

// --- SCANNER LOGIC ---
if (startScanBtn) {
  startScanBtn.addEventListener("click", () => {
    if (scannerModal) scannerModal.style.display = "flex";

    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode("reader");
    }

    const config = { fps: 10, qrbox: { width: 220, height: 220 } };

    html5QrCode.start(
      { facingMode: "environment" },
      config,
      (decodedText) => {
        stopScanner();
        handleScannedBarcode(decodedText);
      },
      () => {}
    ).then(() => {
      attachZoomListeners();
    }).catch(err => {
      console.error("Camera error:", err);
      alert("Camera permission required.");
      stopScanner();
    });
  });
}

function attachZoomListeners() {
  const z1 = document.getElementById("zoom1xBtn");
  const z2 = document.getElementById("zoom2xBtn");

  const doZoom = (scaleFactor) => {
    const videoTag = document.querySelector("#reader video");
    if (videoTag) {
      videoTag.style.transition = "transform 0.2s ease-in-out";
      videoTag.style.transform = `scale(${scaleFactor})`;
      videoTag.style.transformOrigin = "center center";
    }

    try {
      if (html5QrCode) {
        const track = html5QrCode.getRunningTrack();
        const caps = track.getCapabilities();
        if (caps && caps.zoom) {
          track.applyConstraints({ advanced: [{ zoom: scaleFactor }] });
        }
      }
    } catch(e) {
      console.warn("Hardware zoom warning:", e);
    }
  };

  if (z1) {
    z1.onclick = (e) => {
      e.stopPropagation();
      doZoom(1);
    };
  }

  if (z2) {
    z2.onclick = (e) => {
      e.stopPropagation();
      doZoom(1.6);
    };
  }
}

if (closeScanBtn) {
  closeScanBtn.addEventListener("click", stopScanner);
}

function stopScanner() {
  const videoEl = document.querySelector("#reader video");
  if (videoEl) videoEl.style.transform = "scale(1)";

  if (html5QrCode) {
    html5QrCode.stop().then(() => {
      html5QrCode.clear();
      if (scannerModal) scannerModal.style.display = "none";
    }).catch(() => {
      if (scannerModal) scannerModal.style.display = "none";
    });
  } else {
    if (scannerModal) scannerModal.style.display = "none";
  }
}

function handleScannedBarcode(scannedText) {
  const code = String(scannedText).trim().toLowerCase();
  let foundIndex = -1;

  for (let i = 0; i < medicineSelect.options.length; i++) {
    const opt = medicineSelect.options[i];
    const barcodeAttr = String(opt.getAttribute("data-barcode") || "").trim().toLowerCase();
    const nameAttr = String(opt.getAttribute("data-name") || "").trim().toLowerCase();

    if (barcodeAttr === code || nameAttr === code) {
      foundIndex = i;
      break;
    }
  }

  if (foundIndex !== -1) {
    playBeepSound();
    medicineSelect.selectedIndex = foundIndex;
    const qtyInput = document.getElementById("qty");
    if (qtyInput) qtyInput.value = 1;
  } else {
    alert(`⚠️ Barcode "${scannedText}" not found in list.`);
  }
}

// Render Bill Table Function (Includes Delete Button Column)
function renderBillTable() {
  if (!billTable) return;
  billTable.innerHTML = "";
  totalAmount = 0;

  if (billItems.length === 0) {
    billTable.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #888; padding: 15px;">No items added to bill yet.</td></tr>`;
    if (grandTotal) grandTotal.innerText = `Grand Total: ₹0.00`;
    return;
  }

  billItems.forEach((item, index) => {
    totalAmount += item.total;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="padding: 10px;">${item.name}</td>
      <td style="padding: 10px;">₹${item.price}</td>
      <td style="padding: 10px;">${item.quantity}</td>
      <td style="padding: 10px;">₹${item.total.toFixed(2)}</td>
      <td style="padding: 10px; text-align: center;">
        <button type="button" onclick="window.deleteBillItem(${index})" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">🗑️ Delete</button>
      </td>
    `;
    billTable.appendChild(tr);
  });

  if (grandTotal) grandTotal.innerText = `Grand Total: ₹${totalAmount.toFixed(2)}`;
}

// Global Delete Bill Item Function
window.deleteBillItem = function(index) {
  billItems.splice(index, 1);
  renderBillTable();
};

// Add Item To Bill
if (addBillBtn) {
  addBillBtn.addEventListener("click", () => {
    const selectedOption = medicineSelect.options[medicineSelect.selectedIndex];
    if (!selectedOption || selectedOption.value === "") return alert("Select a Medicine!");

    const medicineName = selectedOption.getAttribute("data-name");
    const medId = selectedOption.getAttribute("data-id");
    const currentStock = Number(selectedOption.getAttribute("data-stock") || 0);
    const price = Number(selectedOption.value);
    const qtyInput = document.getElementById("qty");
    const qty = Number(qtyInput ? qtyInput.value : 1);

    if (qty <= 0) return alert("Enter valid quantity!");
    if (qty > currentStock) return alert(`⚠️ Stock low! Available stock for ${medicineName} is only ${currentStock}.`);

    const total = price * qty;

    billItems.push({ 
      id: medId, 
      medicine: medicineName, 
      name: medicineName, 
      price: price, 
      quantity: qty, 
      total: total 
    });

    renderBillTable();

    medicineSelect.selectedIndex = 0;
    if (qtyInput) qtyInput.value = "";
  });
}

// Common Shared Function for Saving Bill & Deducting Stock
async function processAndSaveBill() {
  const custName = nameEl && nameEl.value.trim() !== "" ? nameEl.value.trim() : "Walk-in Customer";
  const custPhone = phoneEl && phoneEl.value.trim() !== "" ? phoneEl.value.trim() : "N/A";

  const dispName = document.getElementById("dispCustName");
  const dispPhone = document.getElementById("dispCustPhone");
  if (dispName) dispName.innerText = custName;
  if (dispPhone) dispPhone.innerText = custPhone;

  const newBill = {
    invoiceNo: invoiceNo,
    date: formattedDate,
    time: formattedTime,
    grandTotal: totalAmount,
    medicines: billItems
  };

  // 1. DEDUCT STOCK IN FIRESTORE & LOCALSTORAGE
  let localMeds = JSON.parse(localStorage.getItem("medicines")) || [];

  for (let item of billItems) {
    let calculatedNewStock = 0;

    const medIndex = localMeds.findIndex(m => m.name === item.name || m.id === item.id);
    if (medIndex !== -1) {
      const currentMedStock = localMeds[medIndex].stock !== undefined ? localMeds[medIndex].stock : (localMeds[medIndex].stockQty || 0);
      calculatedNewStock = Math.max(0, currentMedStock - item.quantity);
      localMeds[medIndex].stock = calculatedNewStock;
      localMeds[medIndex].stockQty = calculatedNewStock;
    }

    if (item.id && !item.id.startsWith("LOCAL-")) {
      try {
        const medRef = doc(db, "medicines", item.id);
        await updateDoc(medRef, { stock: calculatedNewStock, stockQty: calculatedNewStock });
      } catch(e) {
        console.warn("Firestore stock update failed for", item.name, e);
      }
    }
  }

  localStorage.setItem("medicines", JSON.stringify(localMeds));

  // 2. SAVE CUSTOMER BILL HISTORY
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

  // 3. SAVE SALE RECORD IN FIRESTORE
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
}

// Generate Bill Button Listener
if (generateBillBtn) {
  generateBillBtn.addEventListener("click", async () => {
    if (billItems.length === 0) return alert("Please add medicines first!");

    try {
      generateBillBtn.disabled = true;
      generateBillBtn.innerText = "Saving Bill & Updating Stock...";

      await processAndSaveBill();

      alert("Bill Generated & Stock Updated Successfully! 🎉");
      window.location.href = "customers.html";

    } catch (err) {
      alert("Error saving bill: " + err.message);
      generateBillBtn.disabled = false;
      generateBillBtn.innerText = "Generate Bill";
    }
  });
}

// Print Bill Button Listener (Auto-generates bill in background and triggers print)
if (printBtn) {
  printBtn.addEventListener("click", async () => {
    if (billItems.length === 0) return alert("Please add medicines first before printing!");

    try {
      printBtn.disabled = true;
      printBtn.innerText = "Processing...";

      await processAndSaveBill();

      printBtn.innerText = "Print Bill";
      printBtn.disabled = false;

      // Trigger clean invoice print preview
      window.print();

    } catch (err) {
      alert("Error processing bill: " + err.message);
      printBtn.disabled = false;
      printBtn.innerText = "Print Bill";
    }
  });
}