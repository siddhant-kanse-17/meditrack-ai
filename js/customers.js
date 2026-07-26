import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";

const customersTableBody = document.getElementById("customersTableBody") || document.querySelector("tbody");
const searchCustomerInput = document.getElementById("searchCustomerInput");
const sortSelect = document.getElementById("sortCustomersSelect");
const resetCustBtn = document.getElementById("resetCustomersBtn");
const logoutBtn = document.getElementById("logoutBtn");

let allCustomers = [];

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    loadCustomersData();
  }
});

async function loadCustomersData() {
  try {
    const customerMap = {};

    // 1. Read LocalStorage First
    const localCustomers = JSON.parse(localStorage.getItem('customers')) || [];
    localCustomers.forEach(c => {
      const key = (c.mobile && c.mobile !== "N/A") ? c.mobile : c.name;
      customerMap[key] = {
        name: c.name || "Walk-in Customer",
        mobile: c.mobile || "N/A",
        totalBills: Number(c.totalBills || 1),
        totalPurchase: Number(c.totalPurchase || 0),
        lastPurchase: c.lastPurchase || "N/A",
        bills: c.bills || []
      };
    });

    // 2. Read Firestore sales
    try {
      const salesSnapshot = await getDocs(collection(db, "sales"));
      salesSnapshot.forEach((docSnap) => {
        const sale = docSnap.data();
        const mob = String(sale.mobile || sale.customerPhone || "N/A").trim();
        const name = sale.customerName || sale.customer || "Walk-in Customer";
        const amount = Number(sale.grandTotal || sale.total || 0);
        const date = sale.date || "N/A";

        const billRecord = {
          id: docSnap.id,
          invoiceNo: sale.invoiceNo || docSnap.id,
          grandTotal: amount,
          date: date,
          time: sale.time || "",
          medicines: sale.medicines || []
        };

        const key = (mob !== "N/A" && mob !== "") ? mob : name;

        if (!customerMap[key]) {
          customerMap[key] = {
            name: name,
            mobile: mob,
            totalBills: 1,
            totalPurchase: amount,
            lastPurchase: date,
            bills: [billRecord]
          };
        } else {
          const exists = customerMap[key].bills.some(b => b.invoiceNo === billRecord.invoiceNo);
          if (!exists) {
            customerMap[key].totalBills += 1;
            customerMap[key].totalPurchase += amount;
            customerMap[key].lastPurchase = date;
            customerMap[key].bills.push(billRecord);
          }
        }
      });
    } catch (e) {
      console.warn("Firestore sync note:", e);
    }

    allCustomers = Object.values(customerMap);
    renderTable();

  } catch (err) {
    console.error("Error loading customers:", err);
  }
}

function renderTable() {
  if (!customersTableBody) return;
  customersTableBody.innerHTML = "";

  if (allCustomers.length === 0) {
    customersTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#888;">No customer records found.</td></tr>`;
    return;
  }

  // Sort Recent Bills Top Always
  let list = [...allCustomers].reverse();

  list.forEach((cust) => {
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid #ddd";

    tr.innerHTML = `
      <td style="padding:12px;"><b>${cust.name}</b></td>
      <td>${cust.mobile}</td>
      <td>${cust.totalBills}</td>
      <td>₹${Number(cust.totalPurchase || 0).toFixed(2)}</td>
      <td>${cust.lastPurchase}</td>
      <td>
        <button onclick="viewCustomerBills('${cust.mobile}')" 
                style="background:#007bff; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">
          👁️ View Bill
        </button>
      </td>
    `;
    customersTableBody.appendChild(tr);
  });
}

// Reset Handler
if (resetCustBtn) {
  resetCustBtn.addEventListener('click', async () => {
    if (confirm("⚠️ Permanently delete all customers and sales history?")) {
      localStorage.clear();
      try {
        const salesSnapshot = await getDocs(collection(db, "sales"));
        const deletes = [];
        salesSnapshot.forEach((docSnap) => deletes.push(deleteDoc(doc(db, "sales", docSnap.id))));
        await Promise.all(deletes);
      } catch (e) { console.error(e); }

      allCustomers = [];
      renderTable();
      alert("All records deleted successfully!");
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}

window.viewCustomerBills = function(mobile) {
  const cust = allCustomers.find(c => String(c.mobile).trim() === String(mobile).trim());
  if (!cust) return;

  let billsListHtml = (cust.bills || []).reverse().map((b, index) => {
    let itemsRows = (b.medicines || []).map(m => `
      <tr>
        <td style="border:1px solid #ddd; padding:6px;">${m.medicine || m.name || 'Medicine'}</td>
        <td style="border:1px solid #ddd; padding:6px; text-align:center;">₹${Number(m.price || 0).toFixed(2)}</td>
        <td style="border:1px solid #ddd; padding:6px; text-align:center;">${Number(m.quantity || m.qty || 1)}</td>
        <td style="border:1px solid #ddd; padding:6px; text-align:right;">₹${Number(m.total || 0).toFixed(2)}</td>
      </tr>
    `).join("");

    return `
      <div style="background:#fff; border:1px solid #ccc; border-radius:6px; padding:15px; margin-bottom:15px;">
        <h4>Invoice: ${b.invoiceNo} (${b.date})</h4>
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:#f8f9fa;">
              <th>Item</th><th>Price</th><th>Qty</th><th>Total</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>
        <h4 style="text-align:right; margin-top:10px;">Total: ₹${Number(b.grandTotal || 0).toFixed(2)}</h4>
      </div>
    `;
  }).join("");

  closeCustomerModal();
  const modalHtml = `
    <div id="customerBillModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:9999;">
      <div style="background:#f4f6f9; padding:20px; border-radius:8px; width:500px; max-width:90%; max-height:80vh; overflow-y:auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <h3>Bills for ${cust.name}</h3>
          <button onclick="closeCustomerModal()" style="background:#dc3545; color:white; border:none; padding:5px 10px; cursor:pointer;">Close</button>
        </div>
        ${billsListHtml || '<p>No bills found.</p>'}
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);
};

window.closeCustomerModal = function() {
  const modal = document.getElementById("customerBillModal");
  if (modal) modal.remove();
};