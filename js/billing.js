import {
  collection,
  getDocs,
  updateDoc,
  addDoc,
  doc,
  query,
  where,
  arrayUnion
} from "firebase/firestore";
import { db } from "./firebase.js";

const generateBillBtn = document.getElementById("generateBill");
const medicineSelect = document.getElementById("medicineSelect");
const addBillBtn = document.getElementById("addBillItem");
const billTable = document.getElementById("billTable");
const grandTotal = document.getElementById("grandTotal");
const printBtn = document.getElementById("printBill");

// Barcode Scan UI Elements
const startScanBtn = document.getElementById("startScanBtn");
const closeScanBtn = document.getElementById("closeScanBtn");
const scannerModal = document.getElementById("scannerModal");

let totalAmount = 0;
let billItems = [];
let html5QrcodeScanner = null;

// Invoice Number Setup
const invoiceNo = "INV-" + Date.now();
if (document.getElementById("invoiceNo")) {
  document.getElementById("invoiceNo").innerText = invoiceNo;
}

// Date & Time Setup
const now = new Date();
const formattedDate = now.toLocaleDateString("en-IN");
const formattedTime = now.toLocaleTimeString("en-IN");

if (document.getElementById("billDate")) {
  document.getElementById("billDate").innerText = formattedDate;
}
if (document.getElementById("billTime")) {
  document.getElementById("billTime").innerText = formattedTime;
}

/**
 * Helper function to safely get Customer Name & Phone from HTML inputs
 */
function getCustomerDetails() {
  const nameEl = document.getElementById("customerName") || document.getElementById("custName") || document.getElementById("customerNameInput");
  const phoneEl = document.getElementById("customerPhone") || document.getElementById("custPhone") || document.getElementById("mobile") || document.getElementById("customerMobileInput");

  return {
    name: nameEl ? nameEl.value.trim() : "",
    phone: phoneEl ? phoneEl.value.trim() : ""
  };
}

/**
 * Combined Customer Sync Engine with Full Bill History Integration
 */
async function saveOrUpdateCustomer(customerName, mobileNumber, billTotalAmount, itemsList) {
  const cleanName = (customerName || "").trim();
  const cleanMobile = (mobileNumber || "").trim();
  const amountToIncrement = parseFloat(billTotalAmount) || 0;
  const todayDate = formattedDate;

  if (!cleanName || cleanName === "-" || !cleanMobile || cleanMobile === "N/A") {
    return;
  }

  // Single Bill Object Structure for View Bill Modal
  const currentBillRecord = {
    invoiceNo: invoiceNo,
    date: todayDate,
    time: formattedTime,
    grandTotal: amountToIncrement,
    medicines: itemsList || []
  };

  // 1. Sync LocalStorage
  try {
    let localCustomers = JSON.parse(localStorage.getItem('customers')) || [];
    const existingIndex = localCustomers.findIndex(c => String(c.mobile).trim() === cleanMobile);

    if (existingIndex !== -1) {
      localCustomers[existingIndex].name = cleanName;
      localCustomers[existingIndex].totalBills = (parseInt(localCustomers[existingIndex].totalBills) || 1) + 1;
      localCustomers[existingIndex].totalPurchase = (parseFloat(localCustomers[existingIndex].totalPurchase) || 0) + amountToIncrement;
      localCustomers[existingIndex].lastPurchase = todayDate;
      
      if (!localCustomers[existingIndex].bills) {
        localCustomers[existingIndex].bills = [];
      }
      localCustomers[existingIndex].bills.push(currentBillRecord);
    } else {
      localCustomers.push({
        id: "CUST-" + Date.now(),
        name: cleanName,
        mobile: cleanMobile,
        totalBills: 1,
        totalPurchase: amountToIncrement,
        lastPurchase: todayDate,
        bills: [currentBillRecord]
      });
    }
    localStorage.setItem('customers', JSON.stringify(localCustomers));
  } catch (e) {
    console.warn("LocalStorage customer update error:", e);
  }

  // 2. Sync Firestore
  try {
    const customersRef = collection(db, "customers");
    const q = query(customersRef, where("mobile", "==", cleanMobile));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const customerDoc = querySnapshot.docs[0];
      const existingData = customerDoc.data();

      await updateDoc(doc(db, "customers", customerDoc.id), {
        name: cleanName,
        totalBills: (parseInt(existingData.totalBills) || 1) + 1,
        totalPurchase: (parseFloat(existingData.totalPurchase) || 0) + amountToIncrement,
        lastPurchase: todayDate,
        updatedAt: new Date().toISOString(),
        bills: arrayUnion(currentBillRecord)
      });
    } else {
      await addDoc(customersRef, {
        id: "CUST-" + Date.now(),
        name: cleanName,
        mobile: cleanMobile,
        totalBills: 1,
        totalPurchase: amountToIncrement,
        lastPurchase: todayDate,
        createdAt: new Date().toISOString(),
        bills: [currentBillRecord]
      });
    }
  } catch (err) {
    console.error("Firestore customer sync error:", err);
  }
}

// 1. Load Medicines & Auto-Select
async function loadMedicines() {
  if (!medicineSelect) return;
  medicineSelect.innerHTML = `<option value="">Select Medicine</option>`;

  try {
    const querySnapshot = await getDocs(collection(db, "medicines"));

    querySnapshot.forEach((docSnap) => {
      const medicine = docSnap.data();
      medicineSelect.innerHTML += `
        <option
          value="${medicine.price}"
          data-stock="${medicine.stock}"
          data-id="${docSnap.id}"
          data-barcode="${medicine.barcode || docSnap.id}"
          data-name="${medicine.name}">
          ${medicine.name}
        </option>
      `;
    });

    const autoSelectedMed = localStorage.getItem("selectedMedForBilling");
    if (autoSelectedMed) {
      const med = JSON.parse(autoSelectedMed);
      localStorage.removeItem("selectedMedForBilling");

      for (let i = 0; i < medicineSelect.options.length; i++) {
        if (medicineSelect.options[i].text === med.name || medicineSelect.options[i].getAttribute("data-name") === med.name) {
          medicineSelect.selectedIndex = i;
          break;
        }
      }

      const qtyInput = document.getElementById("qty");
      if (qtyInput) {
        qtyInput.value = 1;
        qtyInput.focus();
        qtyInput.select();
      }
    }
  } catch (err) {
    console.error("Error loading medicines:", err);
  }
}

loadMedicines();

// -------------------------------------------------------------
// Barcode Scanner Integration
// -------------------------------------------------------------

if (startScanBtn) {
  startScanBtn.addEventListener("click", function () {
    if (scannerModal) scannerModal.style.display = "flex";

    html5QrcodeScanner = new Html5Qrcode("reader");
    const config = { fps: 10, qrbox: { width: 250, height: 150 } };

    html5QrcodeScanner
      .start({ facingMode: "environment" }, config, onScanSuccess)
      .catch((err) => {
        alert("Camera access failed: " + err);
        if (scannerModal) scannerModal.style.display = "none";
      });
  });
}

async function onScanSuccess(decodedText) {
  if (html5QrcodeScanner) {
    try {
      await html5QrcodeScanner.stop();
    } catch (e) {
      console.warn("Scanner stopped:", e);
    }
  }
  if (scannerModal) scannerModal.style.display = "none";

  let matchedIndex = -1;

  for (let i = 0; i < medicineSelect.options.length; i++) {
    const opt = medicineSelect.options[i];
    const barcode = opt.getAttribute("data-barcode");
    const docId = opt.getAttribute("data-id");
    const name = opt.getAttribute("data-name");

    if (barcode === decodedText || docId === decodedText || name === decodedText) {
      matchedIndex = i;
      break;
    }
  }

  if (matchedIndex !== -1) {
    medicineSelect.selectedIndex = matchedIndex;
    const qtyInput = document.getElementById("qty");
    if (qtyInput) {
      qtyInput.value = 1;
      qtyInput.focus();
    }
    alert(`Matched: ${medicineSelect.options[matchedIndex].text}`);
  } else {
    alert(`Medicine with Barcode/ID "${decodedText}" not found!`);
  }
}

if (closeScanBtn) {
  closeScanBtn.addEventListener("click", function () {
    if (html5QrcodeScanner) {
      html5QrcodeScanner
        .stop()
        .then(() => {
          if (scannerModal) scannerModal.style.display = "none";
        })
        .catch(() => {
          if (scannerModal) scannerModal.style.display = "none";
        });
    } else {
      if (scannerModal) scannerModal.style.display = "none";
    }
  });
}

// -------------------------------------------------------------

// 2. Add To Bill Handler
if (addBillBtn) {
  addBillBtn.addEventListener("click", async () => {
    const { name: customerName, phone: customerPhone } = getCustomerDetails();

    if (customerName === "") {
      alert("Please enter Customer Name first!");
      return;
    }
    if (customerPhone === "") {
      alert("Please enter Mobile Number first!");
      return;
    }

    if (document.getElementById("billCustomer")) document.getElementById("billCustomer").innerText = customerName;
    if (document.getElementById("billPhone")) document.getElementById("billPhone").innerText = customerPhone;

    const selectedOption = medicineSelect.options[medicineSelect.selectedIndex];
    if (!selectedOption || selectedOption.value === "") {
      alert("Select a Medicine");
      return;
    }

    const medicineName = selectedOption.text;
    const price = Number(selectedOption.value);
    const stock = Number(selectedOption.dataset.stock);
    const medicineId = selectedOption.dataset.id;
    const qtyInput = document.getElementById("qty");
    const qty = Number(qtyInput ? qtyInput.value : 0);

    if (qty <= 0) {
      alert("Enter valid quantity");
      return;
    }
    if (qty > stock) {
      alert("Not enough stock available!");
      return;
    }

    const total = price * qty;
    totalAmount += total;

    billItems.push({
      medicine: medicineName,
      name: medicineName,
      price: price,
      quantity: qty,
      total: total
    });

    if (billTable) {
      billTable.innerHTML += `
        <tr>
          <td>${medicineName}</td>
          <td>₹${price}</td>
          <td>${qty}</td>
          <td>₹${total}</td>
        </tr>
      `;
    }

    if (grandTotal) grandTotal.innerText = `Grand Total: ₹${totalAmount.toFixed(2)}`;

    // Update Stock in Firestore
    try {
      await updateDoc(doc(db, "medicines", medicineId), {
        stock: stock - qty
      });
    } catch (e) {
      console.error("Failed to update stock:", e);
    }

    await loadMedicines();

    medicineSelect.selectedIndex = 0;
    if (qtyInput) qtyInput.value = "";
  });
}

// 3. Generate Bill & Save
if (generateBillBtn) {
  generateBillBtn.addEventListener("click", async () => {
    if (billItems.length === 0) {
      alert("Please add at least one medicine to the bill first!");
      return;
    }

    const { name: customerName, phone: customerPhone } = getCustomerDetails();

    try {
      generateBillBtn.disabled = true;
      generateBillBtn.innerText = "Saving Bill...";

      // Clear customers reset lock so new billing displays immediately
      localStorage.removeItem('customersReset');

      // Save sales entry
      await addDoc(collection(db, "sales"), {
        invoiceNo: invoiceNo,
        customerName: customerName || "Walk-in Customer",
        customer: customerName || "Walk-in Customer",
        name: customerName || "Walk-in Customer",
        mobile: customerPhone || "N/A",
        customerPhone: customerPhone || "N/A",
        medicines: billItems,
        items: billItems,
        grandTotal: totalAmount,
        total: totalAmount,
        date: formattedDate,
        time: formattedTime,
        timestamp: new Date().toISOString()
      });

      // Update LocalStorage and Firestore Customer sheet simultaneously WITH bill items
      await saveOrUpdateCustomer(customerName, customerPhone, totalAmount, billItems);

      alert("Bill Generated & Saved Successfully! 🎉");

      window.location.href = "customers.html";

    } catch (err) {
      alert("Error saving bill: " + err.message);
      console.error("Save error:", err);
      generateBillBtn.disabled = false;
      generateBillBtn.innerText = "Generate Bill";
    }
  });
}

// 4. Print Bill
if (printBtn) {
  printBtn.addEventListener("click", () => {
    window.print();
  });
}