import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";

// DOM Elements
const customersTableBody = document.getElementById("customersTableBody") || document.querySelector("tbody");
const searchCustomerInput = document.getElementById("searchCustomerInput") || document.getElementById("searchCustomer");
const sortSelect = document.getElementById("sortCustomersSelect");
const resetCustBtn = document.getElementById("resetCustomersBtn");
const logoutBtn = document.getElementById("logoutBtn");

let allCustomers = [];

// 1. Auth Guard Check
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    loadCustomersData();
  }
});

// 2. Core Load Engine (LocalStorage + Firestore Merge)
async function loadCustomersData() {
  try {
    const customerMap = {};

    // 2A. Read LocalStorage Saved Customers First
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

    // 2B. Read Firestore "sales" collection & Auto-Group
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
            // Check if this invoice is already merged from LocalStorage
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

// 3. Render Empty Table State
function renderEmptyTable() {
  if (customersTableBody) {
    customersTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#888;">No customer records found.</td></tr>`;
  }
}

/**
 * Helper to parse Indian Date format (DD/MM/YYYY) into Timestamp
 */
function parseDateToTimestamp(dateStr) {
  if (!dateStr || dateStr === "N/A") return 0;
  
  if (dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day).getTime();
    }
  }
  
  const parsed = new Date(dateStr).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Get latest invoice timestamp for sub-sorting same-day customers
 */
function getLatestInvoiceTime(cust) {
  if (!cust.bills || cust.bills.length === 0) return 0;
  const lastBill = cust.bills[cust.bills.length - 1];
  
  // Extract timestamp from Invoice Number (e.g., INV-1785058651800)
  if (lastBill.invoiceNo && lastBill.invoiceNo.startsWith("INV-")) {
    const invTime = parseInt(lastBill.invoiceNo.replace("INV-", ""), 10);
    if (!isNaN(invTime)) return invTime;
  }
  return 0;
}

// 4. Search and Sort Filter Logic (Recent First & Same-Day Fix)
function applySearchAndSort() {
  let result = [...allCustomers];

  // Search Filter
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

      // 1. If Dates are different -> Latest Date at Top
      if (dateB !== dateA) {
        return dateB - dateA;
      }

      // 2. If Date is SAME -> Latest Invoice Timestamp (INV-...) at Top
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

// 5. Render DOM Rows
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

    tr.innerHTML = `
      <td style="padding:12px;"><b>${cust.name}</b></td>
      <td>${cust.mobile}</td>
      <td>${cust.totalBills}</td>
      <td>₹${Number(cust.totalPurchase || 0).toFixed(2)}</td>
      <td>${cust.lastPurchase}</td>
      <td>
        <button onclick="viewCustomerBills('${cust.mobile}')" 
                style="background:#007bff; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:14px;" 
                title="View Bills">
          👁️ View Bill
        </button>
      </td>
    `;

    customersTableBody.appendChild(tr);
  });
}

// 6. Dynamic Event Listeners
if (searchCustomerInput) {
  searchCustomerInput.addEventListener("input", applySearchAndSort);
}

if (sortSelect) {
  sortSelect.addEventListener("change", applySearchAndSort);
}

// Reset Customers Handler
if (resetCustBtn) {
  resetCustBtn.addEventListener('click', function () {
    if (confirm("⚠️ Are you sure you want to delete all customer records and local bill history?")) {
      localStorage.removeItem('customers');
      localStorage.removeItem('bills');
      localStorage.removeItem('sales');
      localStorage.removeItem('customersReset');

      allCustomers = [];
      renderEmptyTable();
      alert("Customer records reset successfully!");
    }
  });
}

// Logout Handler
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

// 7. View Bill Modal Engine
window.viewCustomerBills = function(mobile) {
  const cust = allCustomers.find(c => String(c.mobile).trim() === String(mobile).trim());
  if (!cust) return;

  let sortedBills = [...(cust.bills || [])].reverse();

  let billsListHtml = "";
  if (sortedBills.length === 0) {
    billsListHtml = `<p style="text-align:center; padding:15px; color:#666;">No item details available for this customer.</p>`;
  } else {
    billsListHtml = sortedBills.map((b, index) => {
      let itemsRows = (b.medicines || []).map(m => {
        const medName = m.medicine || m.name || 'Medicine';
        const price = Number(m.price || 0);
        const qty = Number(m.quantity || m.qty || 1);
        const total = Number(m.total || price * qty);
        return `
          <tr>
            <td style="border:1px solid #ddd; padding:6px;">${medName}</td>
            <td style="border:1px solid #ddd; padding:6px; text-align:center;">₹${price.toFixed(2)}</td>
            <td style="border:1px solid #ddd; padding:6px; text-align:center;">${qty}</td>
            <td style="border:1px solid #ddd; padding:6px; text-align:right;">₹${total.toFixed(2)}</td>
          </tr>
        `;
      }).join("");

      return `
        <div class="printable-bill" id="bill-print-${index}" style="background:#fff; border:1px solid #ccc; border-radius:6px; padding:15px; margin-bottom:20px; font-family:sans-serif;">
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
            <tbody>
              ${itemsRows || '<tr><td colspan="4" style="text-align:center;">No items recorded</td></tr>'}
            </tbody>
          </table>

          <div style="text-align:right; font-size:15px; font-weight:bold; margin-bottom:12px;">
            Grand Total: ₹${Number(b.grandTotal || 0).toFixed(2)}
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:11px; color:#888;">Thank You For Visiting! Get Well Soon 😊</span>
            <button onclick="printSingleBill('bill-print-${index}')" style="background:#28a745; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:13px;">
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
      <div style="background:#f4f6f9; padding:20px; border-radius:8px; width:520px; max-width:90%; color:#333; box-shadow:0 4px 15px rgba(0,0,0,0.2); max-height:85vh; overflow-y:auto;">
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

  const printContent = printElement.outerHTML;
  const printWindow = window.open("", "_blank");
  printWindow.document.write(`
    <html>
      <head>
        <title>Print Invoice</title>
        <style>
          body { font-family: sans-serif; padding: 20px; }
          button { display: none !important; }
          table { width: 100%; border-collapse: collapse; }
        </style>
      </head>
      <body>
        ${printContent}
      </body>
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