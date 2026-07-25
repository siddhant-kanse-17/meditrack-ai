import {
  collection,
  getDocs,
  updateDoc,
  addDoc,
  doc
} from "firebase/firestore";
import { db } from "./firebase.js";

const generateBillBtn = document.getElementById("generateBill");
const medicineSelect = document.getElementById("medicineSelect");
const addBillBtn = document.getElementById("addBillItem");
const billTable = document.getElementById("billTable");
const grandTotal = document.getElementById("grandTotal");
const printBtn = document.getElementById("printBill");

let totalAmount = 0;
let billItems = [];

// Invoice Number Setup
const invoiceNo = "INV-" + Date.now();
if (document.getElementById("invoiceNo")) {
    document.getElementById("invoiceNo").innerText = invoiceNo;
}

// Date & Time Setup
const now = new Date();
if (document.getElementById("billDate")) {
    document.getElementById("billDate").innerText = now.toLocaleDateString("en-IN");
}
if (document.getElementById("billTime")) {
    document.getElementById("billTime").innerText = now.toLocaleTimeString("en-IN");
}

// Helper function to safely get Customer Name & Phone from HTML inputs
function getCustomerDetails() {
    const nameEl = document.getElementById("customerName") || document.getElementById("custName");
    const phoneEl = document.getElementById("customerPhone") || document.getElementById("custPhone") || document.getElementById("mobile");
    
    return {
        name: nameEl ? nameEl.value.trim() : "",
        phone: phoneEl ? phoneEl.value.trim() : ""
    };
}

// 1. Load Medicines & Auto-Select from Dashboard Search
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
                data-name="${medicine.name}">
                ${medicine.name}
            </option>
        `;
      });

      // Check if medicine came from Dashboard Search
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

      if (grandTotal) grandTotal.innerText = `Grand Total: ₹${totalAmount}`;

      // Update Stock in Firestore
      try {
          await updateDoc(doc(db, "medicines", medicineId), {
            stock: stock - qty
          });
      } catch (e) {
          console.error("Failed to update stock:", e);
      }

      // Reload Medicines to refresh dropdown stock
      await loadMedicines();

      medicineSelect.selectedIndex = 0;
      if (qtyInput) qtyInput.value = "";
    });
}

// 3. Generate Bill & Save to Firestore
if (generateBillBtn) {
    generateBillBtn.addEventListener("click", async () => {
      if (billItems.length === 0) {
        alert("Please add at least one medicine to the bill first!");
        return;
      }

      const { name: customerName, phone: customerPhone } = getCustomerDetails();

      try {
          // Disable button during saving to avoid double click
          generateBillBtn.disabled = true;
          generateBillBtn.innerText = "Saving Bill...";

          await addDoc(collection(db, "sales"), {
            invoiceNo: invoiceNo,
            customerName: customerName || "Walk-in Customer",
            customer: customerName || "Walk-in Customer",
            name: customerName || "Walk-in Customer",
            mobile: customerPhone || "N/A",
            customerPhone: customerPhone || "N/A",
            medicines: billItems,
            grandTotal: totalAmount,
            date: document.getElementById("billDate") ? document.getElementById("billDate").innerText : new Date().toLocaleDateString("en-IN"),
            time: document.getElementById("billTime") ? document.getElementById("billTime").innerText : new Date().toLocaleTimeString("en-IN"),
            timestamp: new Date().toISOString()
          });

          alert("Bill Generated & Saved Successfully! 🎉");
          
          // Redirect to Customers page to see updated record
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