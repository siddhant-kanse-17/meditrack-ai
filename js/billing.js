import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc
} from "firebase/firestore";
import { db } from "./firebase.js";

// DOM Elements
const generateBillBtn = document.getElementById("generateBill");
const medicineSelect = document.getElementById("medicineSelect");
const addBillBtn = document.getElementById("addBillItem");
const billTable = document.getElementById("billTable");
const grandTotal = document.getElementById("grandTotal");
const printBtn = document.getElementById("printBill");

// Barcode Scanner UI Elements
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
 * Flexible Helper to catch Customer Details from DOM inputs
 */
function getCustomerDetails() {
  const nameEl = document.getElementById("customerName") || 
                 document.getElementById("custName") || 
                 document.getElementById("customerNameInput") ||
                 document.querySelector('input[placeholder*="Customer"]') ||
                 document.querySelector('input[placeholder*="Name"]');

  const phoneEl = document.getElementById("customerPhone") || 
                  document.getElementById("custPhone") || 
                  document.getElementById("mobile") || 
                  document.getElementById("customerMobileInput") ||
                  document.querySelector('input[placeholder*="Mobile"]') ||
                  document.querySelector('input[placeholder*="Phone"]');

  const rawName = nameEl && nameEl.value.trim() !== "" ? nameEl.value.trim() : "Walk-in Customer";
  const rawPhone = phoneEl && phoneEl.value.trim() !== "" ? phoneEl.value.trim() : "N/A";

  return { name: rawName, phone: rawPhone };
}

// 1. Fetch & Render Medicine Dropdown
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

// 2. Add Item To Bill
if (addBillBtn) {
  addBillBtn.addEventListener("click", async () => {
    const { name: customerName, phone: customerPhone } = getCustomerDetails();

    if (document.getElementById("billCustomer")) document.getElementById("billCustomer").innerText = customerName;
    if (document.getElementById("billPhone")) document.getElementById("billPhone").innerText = customerPhone;

    const selectedOption = medicineSelect.options[medicineSelect.selectedIndex];
    if (!selectedOption || selectedOption.value === "") {
      alert("Select a Medicine!");
      return;
    }

    const medicineName = selectedOption.text;
    const price = Number(selectedOption.value);
    const stock = Number(selectedOption.dataset.stock);
    const medicineId = selectedOption.dataset.id;
    const qtyInput = document.getElementById("qty");
    const qty = Number(qtyInput ? qtyInput.value : 1);

    if (qty <= 0) {
      alert("Enter valid quantity!");
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

    try {
      await updateDoc(doc(db, "medicines", medicineId), {
        stock: stock - qty
      });
    } catch (e) {
      console.error("Failed to update inventory stock:", e);
    }

    await loadMedicines();

    medicineSelect.selectedIndex = 0;
    if (qtyInput) qtyInput.value = "";
  });
}

// 3. Generate Bill (Direct Reliable Sync)
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

      const cleanName = customerName || "Walk-in Customer";
      const cleanPhone = customerPhone || "N/A";

      const currentBillRecord = {
        invoiceNo: invoiceNo,
        date: formattedDate,
        time: formattedTime,
        grandTotal: totalAmount,
        medicines: billItems
      };

      // ---------------------------------------------------------
      // 1. GUARANTEED LOCAL STORAGE SAVE
      // ---------------------------------------------------------
      let localCustomers = JSON.parse(localStorage.getItem('customers')) || [];
      const existingIndex = localCustomers.findIndex(c => 
        (cleanPhone !== "N/A" && String(c.mobile).trim() === cleanPhone) ||
        (cleanPhone === "N/A" && String(c.name).toLowerCase() === cleanName.toLowerCase())
      );

      if (existingIndex !== -1) {
        localCustomers[existingIndex].name = cleanName;
        localCustomers[existingIndex].totalBills = (parseInt(localCustomers[existingIndex].totalBills) || 1) + 1;
        localCustomers[existingIndex].totalPurchase = (parseFloat(localCustomers[existingIndex].totalPurchase) || 0) + totalAmount;
        localCustomers[existingIndex].lastPurchase = formattedDate;
        if (!localCustomers[existingIndex].bills) localCustomers[existingIndex].bills = [];
        localCustomers[existingIndex].bills.push(currentBillRecord);
      } else {
        localCustomers.push({
          id: "CUST-" + Date.now(),
          name: cleanName,
          mobile: cleanPhone,
          totalBills: 1,
          totalPurchase: totalAmount,
          lastPurchase: formattedDate,
          bills: [currentBillRecord]
        });
      }

      // Explicitly write to LocalStorage
      localStorage.setItem('customers', JSON.stringify(localCustomers));
      localStorage.removeItem('customersReset'); // Remove any stale reset flag

      // ---------------------------------------------------------
      // 2. FIRESTORE SAVE (SALES COLLECTION)
      // ---------------------------------------------------------
      await addDoc(collection(db, "sales"), {
        invoiceNo: invoiceNo,
        customerName: cleanName,
        customer: cleanName,
        name: cleanName,
        mobile: cleanPhone,
        customerPhone: cleanPhone,
        medicines: billItems,
        items: billItems,
        grandTotal: totalAmount,
        total: totalAmount,
        date: formattedDate,
        time: formattedTime,
        timestamp: new Date().toISOString()
      });

      alert("Bill Generated & Saved Successfully! 🎉");

      // Redirect after LocalStorage write finishes
      window.location.href = "customers.html";

    } catch (err) {
      alert("Error saving bill: " + err.message);
      console.error("Save error:", err);
      generateBillBtn.disabled = false;
      generateBillBtn.innerText = "Generate Bill";
    }
  });
}

// 4. Print Execution
if (printBtn) {
  printBtn.addEventListener("click", () => {
    window.print();
  });
}