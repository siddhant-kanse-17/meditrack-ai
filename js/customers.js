import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, getDocs, deleteDoc, doc, query, where } from "firebase/firestore";

// DOM Elements
const customersTableBody = document.getElementById("customersTableBody") || document.querySelector("tbody");
const searchCustomerInput = document.getElementById("searchCustomerInput") || document.getElementById("searchCustomer");
const sortSelect = document.getElementById("sortCustomersSelect");
const logoutBtn = document.getElementById("logoutBtn");

let allCustomers = [];

// Clean lock flag on load
localStorage.removeItem('customersReset');

// 1. Auth Guard Check
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    loadCustomersData();
  }
});

// 2. Fetch Sales and Group by Customer
async function loadCustomersData() {
  try {
    const customerMap = {};

    // 2A. Read LocalStorage
    const localCustomers = JSON.parse(localStorage.getItem('customers')) || [];
    localCustomers.forEach(localCust => {
      const mob = String(localCust.mobile || "N/A").trim();
      const key = mob !== "N/A" && mob !== "" ? mob : (localCust.name || "Walk-in Customer");

      customerMap[key] = {
        name: localCust.name || "Walk-in Customer",
        mobile: mob,
        totalBills: Number(localCust.totalBills || 1),
        totalPurchase: Number(localCust.totalPurchase || 0),
        lastPurchase: localCust.lastPurchase || "N/A",
        bills: localCust.bills || []
      };
    });

    // 2B. Read Firestore "sales"
    try {
      const salesSnapshot = await getDocs(collection(db, "sales"));
      if (!salesSnapshot.empty) {
        salesSnapshot.forEach((docSnap) => {
          const sale = docSnap.data();
          const mob = String(sale.mobile || sale.customerPhone || "N/A").trim();
          const name = sale.customerName || sale.customer || sale.name || "Walk-in Customer";
          const amount = Number(sale.grandTotal || sale.total || 0);
          const date = sale.date || (sale.timestamp ? new Date(sale.timestamp).toLocaleDateString("en-IN") : "N/A");

          const billRecord = {
            id: docSnap.id,
            invoiceNo: sale.invoiceNo || docSnap.id,
            grandTotal: amount,
            date: date,
            time: sale.time || "",
            medicines: sale.medicines || sale.items || []
          };

          const mapKey = mob !== "N/A" && mob !== "" ? mob : name;

          if (!customerMap[mapKey]) {
            customerMap[mapKey] = {
              name: name,
              mobile: mob,
              totalBills: 1,
              totalPurchase: amount,
              lastPurchase: date,
              bills: [billRecord]
            };
          } else {
            const exists = customerMap[mapKey].bills.some(b => b.invoiceNo === billRecord.invoiceNo);
            if (!exists) {
              customerMap[mapKey].totalBills += 1;
              customerMap[mapKey].totalPurchase += amount;
              customerMap[mapKey].lastPurchase = date;
              customerMap[mapKey].bills.push(billRecord);
            }
          }
        });
      }
    } catch (e) {
      console.warn("Firestore sales merge note:", e);
    }

    allCustomers = Object.values(customerMap);

    if (allCustomers.length === 0) {
      renderEmptyTable();
      return;
    }

    applySearchAndSort();

  } catch (err) {
    console.error("Error loading customers:", err);
    if (customersTableBody) {
      customersTableBody.innerHTML = `<tr><td colspan="6" style="color:red; text-align:center; padding:20px;">Error loading customer records.</td></tr>`;
    }
  }
}

// 3. Empty Table State
function renderEmptyTable() {
  if (customersTableBody) {
    customersTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#888;">No customer records found.</td></tr>`;
  }
}

// 4. Accurate Date Parser (Converts DD/MM/YYYY to Exact Timestamp)
function parseDateToTimestamp(dateStr) {
  if (!dateStr || dateStr === "N/A") return 0;
  
  if (dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1; // Month is 0-indexed
      const y = parseInt(parts[2], 10);
      return new Date(y, m, d).getTime();
    }
  }
  
  const t = new Date(dateStr).getTime();
  return isNaN(t) ? 0 : t;
}

// Extract timestamp from latest invoice
function getLatestInvoiceTime(cust) {
  if (!cust.bills || cust.bills.length === 0) return 0;
  const lastBill = cust.bills[cust.bills.length - 1];
  if (lastBill.invoiceNo && String(lastBill.invoiceNo).startsWith("INV-")) {
    const invTime = parseInt(String(lastBill.invoiceNo).replace("INV-", ""), 10);
    if (!isNaN(invTime)) return invTime;
  }
  return 0;
}

// 5. Search and Sort (Guaranteed Recent Top)
function applySearchAndSort() {
  let result = [...allCustomers];

  if (searchCustomerInput) {
    const term = searchCustomerInput.value.toLowerCase().trim();
    if (term !== "") {
      result = result.filter(c => 
        (c.name || "").toLowerCase().includes(term) || 
        (c.mobile || "").toLowerCase().includes(term)
      );
    }
  }

  const sortValue = sortSelect ? sortSelect.value : "recent";

  if (sortValue === "recent") {
    result.sort((a, b) => {
      const dateA = parseDateToTimestamp(a.lastPurchase);
      const dateB = parseDateToTimestamp(b.lastPurchase);
      
      // 1. Primary: Compare Dates (e.g. 26/7/2026 > 25/7/2026)
      if (dateB !== dateA) {
        return dateB - dateA;
      }
      // 2. Secondary: Compare Invoice Time for Same Day
      return getLatestInvoiceTime(b) - getLatestInvoiceTime(a);
    });
  } else if (sortValue === "name") {
    result.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } else if (sortValue === "purchaseHigh") {
    result.sort((a, b) => (Number(b.totalPurchase) || 0) - (Number(a.totalPurchase) || 0));
  } else if (sortValue === "purchaseLow") {
    result.sort((a, b) => (Number(a.totalPurchase) || 0) - (Number(b.totalPurchase) || 0));
  }

  renderCustomersTable(result);
}

// 6. Render Table with Individual Delete Option
function renderCustomersTable(customersList) {
  if (!customersTableBody) return;
  customersTableBody.innerHTML = "";

  if (customersList.length === 0) {
    renderEmptyTable();
    return;
  }

  customersList.forEach((cust) => {
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid #ddd";

    const safeMobile = String(cust.mobile).replace(/'/g, "\\'");
    const safeName = String(cust.name).replace(/'/g, "\\'");

    tr.innerHTML = `
      <td style="padding:12px;"><b>${cust.name}</b></td>
      <td>${cust.mobile}</td>
      <td>${cust.totalBills}</td>
      <td>₹${Number(cust.totalPurchase || 0).toFixed(2)}</td>
      <td>${cust.lastPurchase}</td>
      <td style="display: flex; gap: 8px; align-items: center; padding-top: 10px;">
        <button onclick="viewCustomerBills('${safeMobile}')" 
                style="background:#007bff; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:14px;">
          👁️ View Bill
        </button>
        <button onclick="deleteSingleCustomer('${safeMobile}', '${safeName}')" 
                style="background:#dc3545; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer; font-size:14px;"
                title="Delete Record">
          🗑️
        </button>
      </td>
    `;
    customersTableBody.appendChild(tr);
  });
}

if (searchCustomerInput) searchCustomerInput.addEventListener("input", applySearchAndSort);
if (sortSelect) sortSelect.addEventListener("change", applySearchAndSort);

// 7. Individual Row Delete Handler
window.deleteSingleCustomer = async function(mobile, name) {
  if (!confirm(`⚠️ Kya aap "${name}" ka record delete karna chahte hain?`)) return;

  try {
    // 1. Delete from LocalStorage
    let localCustomers = JSON.parse(localStorage.getItem('customers')) || [];
    localCustomers = localCustomers.filter(c => {
      const mob = String(c.mobile || "N/A").trim();
      const cName = String(c.name || "Walk-in Customer").trim();
      if (mobile !== "N/A" && mobile !== "") {
        return mob !== mobile;
      } else {
        return cName.toLowerCase() !== name.toLowerCase();
      }
    });
    localStorage.setItem('customers', JSON.stringify(localCustomers));

    // 2. Delete Firestore Sales docs
    const salesRef = collection(db, "sales");
    let q = (mobile !== "N/A" && mobile !== "") 
      ? query(salesRef, where("mobile", "==", mobile))
      : query(salesRef, where("customerName", "==", name));

    const salesSnap = await getDocs(q);
    const deletePromises = [];
    salesSnap.forEach((docSnap) => deletePromises.push(deleteDoc(doc(db, "sales", docSnap.id))));
    await Promise.all(deletePromises);

    // 3. Refresh State
    allCustomers = allCustomers.filter(c => {
      if (mobile !== "N/A" && mobile !== "") {
        return String(c.mobile).trim() !== mobile;
      } else {
        return String(c.name).trim().toLowerCase() !== name.toLowerCase();
      }
    });

    applySearchAndSort();
    alert(`"${name}" deleted!`);

  } catch (err) {
    console.error("Delete Error:", err);
    alert("Delete failed: " + err.message);
  }
};

if (logoutBtn) {
  logoutBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await signOut(auth);
      window.location.href = "index.html";
    } catch (err) {
      console.error("Logout Error:", err);
    }
  });
}

// 8. View Bill Modal Engine
window.viewCustomerBills = function(mobile) {
  const cust = allCustomers.find(c => String(c.mobile).trim() === String(mobile).trim());
  if (!cust) return;

  let sortedBills = [...(cust.bills || [])].reverse();
  let billsListHtml = "";

  if (sortedBills.length === 0) {
    billsListHtml = `<p style="text-align:center; padding:15px; color:#666;">No item details available.</p>`;
  } else {
    billsListHtml = sortedBills.map((b, index) => {
      let itemsRows = (b.medicines || []).map(m => `
        <tr>
          <td style="border:1px solid #ddd; padding:6px;">${m.medicine || m.name || 'Medicine'}</td>
          <td style="border:1px solid #ddd; padding:6px; text-align:center;">₹${Number(m.price || 0).toFixed(2)}</td>
          <td style="border:1px solid #ddd; padding:6px; text-align:center;">${Number(m.quantity || m.qty || 1)}</td>
          <td style="border:1px solid #ddd; padding:6px; text-align:right;">₹${Number(m.total || 0).toFixed(2)}</td>
        </tr>
      `).join("");

      return `
        <div class="printable-bill" id="bill-print-${index}" style="background:#fff; border:1px solid #ccc; border-radius:6px; padding:15px; margin-bottom:20px;">
          <div style="text-align:center; border-bottom:1px solid #eee; padding-bottom:8px; margin-bottom:10px;">
            <h2 style="margin:0; color:#007bff;">MediTrack AI</h2>
            <p style="margin:2px 0; font-size:12px; color:#666;">Medical Store Management System</p>
          </div>
          <div style="font-size:13px; margin-bottom:10px;">
            <p style="margin:2px 0;"><strong>Invoice No:</strong> ${b.invoiceNo}</p>
            <p style="margin:2px 0;"><strong>Date & Time:</strong> ${b.date} ${b.time}</p>
            <p style="margin:2px 0;"><strong>Customer:</strong> ${cust.name}</p>
            <p style="margin:2px 0;"><strong>Mobile:</strong> ${cust.mobile}</p>
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:10px;">
            <thead>
              <tr style="background:#f8f9fa;">
                <th style="border:1px solid #ddd; padding:6px; text-align:left;">Medicine</th>
                <th style="border:1px solid #ddd; padding:6px;">Price</th>
                <th style="border:1px solid #ddd; padding:6px;">Qty</th>
                <th style="border:1px solid #ddd; padding:6px; text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>${itemsRows}</tbody>
          </table>
          <div style="text-align:right; font-size:15px; font-weight:bold; margin-bottom:12px;">
            Grand Total: ₹${Number(b.grandTotal || 0).toFixed(2)}
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:11px; color:#888;">Thank You For Visiting! Get Well Soon 😊</span>
            <button onclick="printSingleBill('bill-print-${index}')" style="background:#28a745; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">
              🖨️ Print Bill
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  closeCustomerModal();
  const modalHtml = `
    <div id="customerBillModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:9999;">
      <div style="background:#f4f6f9; padding:20px; border-radius:8px; width:520px; max-width:90%; color:#333; max-height:85vh; overflow-y:auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:2px solid #007bff; padding-bottom:8px;">
          <h3 style="margin:0;">📜 Full Bills - ${cust.name}</h3>
          <button onclick="closeCustomerModal()" style="padding:5px 10px; background:#dc3545; color:white; border:none; border-radius:4px; cursor:pointer;">✖ Close</button>
        </div>
        <div>${billsListHtml}</div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);
};

window.printSingleBill = function(billDivId) {
  const printElement = document.getElementById(billDivId);
  if (!printElement) return;
  const printWindow = window.open("", "_blank");
  printWindow.document.write(`
    <html>
      <head><title>Print Invoice</title></head>
      <body>${printElement.outerHTML}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
};

window.closeCustomerModal = function() {
  const modal = document.getElementById("customerBillModal");
  if (modal) modal.remove();
};