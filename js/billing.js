import { collection, addDoc, getDocs } from "firebase/firestore";
import { db } from "./firebase.js";

// DOM Elements
const generateBillBtn = document.getElementById("generateBill");
const medicineSelect = document.getElementById("medicineSelect");
const addBillBtn = document.getElementById("addBillItem");
const billTable = document.getElementById("billTable");
const grandTotal = document.getElementById("grandTotal");
const printBtn = document.getElementById("printBill");

let totalAmount = 0;
let billItems = [];

// Setup Invoice Info
const invoiceNo = "INV-" + Date.now();
if (document.getElementById("invoiceNo")) document.getElementById("invoiceNo").innerText = invoiceNo;

const now = new Date();
const formattedDate = now.toLocaleDateString("en-IN");
const formattedTime = now.toLocaleTimeString("en-IN");

if (document.getElementById("billDate")) document.getElementById("billDate").innerText = formattedDate;
if (document.getElementById("billTime")) document.getElementById("billTime").innerText = formattedTime;

// Load Medicines
async function loadMedicines() {
  if (!medicineSelect) return;
  medicineSelect.innerHTML = `<option value="">Select Medicine</option>`;
  try {
    const querySnapshot = await getDocs(collection(db, "medicines"));
    querySnapshot.forEach((docSnap) => {
      const medicine = docSnap.data();
      medicineSelect.innerHTML += `
        <option value="${medicine.price}" data-stock="${medicine.stock}" data-id="${docSnap.id}" data-name="${medicine.name}">
          ${medicine.name}
        </option>`;
    });
  } catch (err) {
    console.error("Error loading medicines:", err);
  }
}
loadMedicines();

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
          <td>₹${total}</td>
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

    const nameEl = document.getElementById("customerName");
    const phoneEl = document.getElementById("customerPhone");

    const custName = nameEl && nameEl.value.trim() !== "" ? nameEl.value.trim() : "Walk-in Customer";
    const custPhone = phoneEl && phoneEl.value.trim() !== "" ? phoneEl.value.trim() : "N/A";

    try {
      generateBillBtn.disabled = true;
      generateBillBtn.innerText = "Saving Bill...";

      // 1. Save Directly to LocalStorage
      let customers = JSON.parse(localStorage.getItem("customers")) || [];
      const newBill = {
        invoiceNo: invoiceNo,
        date: formattedDate,
        time: formattedTime,
        grandTotal: totalAmount,
        medicines: billItems
      };

      const existingIndex = customers.findIndex(c => c.mobile === custPhone && custPhone !== "N/A");

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

      // 2. Save To Firestore
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