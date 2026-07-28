import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// DOM Elements
const salesTableBody = document.getElementById("salesTableBody") || document.getElementById("salesTable");
const totalSalesElement = document.getElementById("totalSales");
const searchSalesInput = document.getElementById("searchSales") || document.getElementById("searchInvoice");
const invoiceModal = document.getElementById("invoiceModal");
const modalContent = document.getElementById("modalContent") || document.getElementById("invoiceDetails");

let allSales = [];

// Instant Auth Guard
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace("index.html");
  } else {
    document.documentElement.style.display = 'block';
    loadSalesHistory();
  }
});

/**
 * Fetch sales data from Firestore with LocalStorage fallback
 */
async function loadSalesHistory() {
  try {
    const salesQuery = query(collection(db, "sales"), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(salesQuery);

    allSales = [];
    querySnapshot.forEach((doc) => {
      allSales.push({ id: doc.id, ...doc.data() });
    });

    // Fallback to local storage if Firestore has no records
    if (allSales.length === 0) {
      allSales = JSON.parse(localStorage.getItem("sales")) || [];
    }
  } catch (error) {
    console.warn("Firestore fetch error, falling back to local storage:", error);
    allSales = JSON.parse(localStorage.getItem("sales")) || [];
  }

  renderSalesTable(allSales);
}

/**
 * Render table rows & update total calculation
 */
function renderSalesTable(salesData) {
  if (!salesTableBody) return;

  if (salesData.length === 0) {
    salesTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 20px; color: #666;">
          No sales records found.
        </td>
      </tr>`;
    if (totalSalesElement) totalSalesElement.innerText = "Total Sales: ₹0.00";
    return;
  }

  let runningTotal = 0;

  salesTableBody.innerHTML = salesData
    .map((sale) => {
      const invId = sale.invoiceNo || sale.id || "N/A";
      const custName = sale.customerName || sale.customer || "Walk-in Customer";
      const mobile = sale.mobile || sale.phone || "N/A";
      const grandTotal = Number(sale.grandTotal || sale.total || 0);

      runningTotal += grandTotal;

      // Date parsing logic
      let formattedDate = sale.date || "N/A";
      if (sale.timestamp?.toDate) {
        formattedDate = sale.timestamp.toDate().toLocaleDateString();
      } else if (sale.timestamp?.seconds) {
        formattedDate = new Date(sale.timestamp.seconds * 1000).toLocaleDateString();
      }

      return `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 10px;"><strong>${invId}</strong></td>
          <td>${custName}</td>
          <td>${mobile}</td>
          <td><strong>₹${grandTotal.toFixed(2)}</strong></td>
          <td>${formattedDate}</td>
          <td>
            <button class="view-btn" data-id="${sale.id || invId}" 
                    style="background-color: #007bff; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">
              View Details
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  if (totalSalesElement) {
    totalSalesElement.innerText = `Total Sales: ₹${runningTotal.toFixed(2)}`;
  }

  // Attach event listeners dynamically to action buttons
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const saleId = e.currentTarget.getAttribute("data-id");
      openModal(saleId);
    });
  });
}

/**
 * Open Modal and present sales details
 */
function openModal(saleId) {
  const sale = allSales.find((s) => s.id === saleId || s.invoiceNo === saleId);
  if (!sale || !invoiceModal || !modalContent) return;

  const items = sale.items || sale.medicines || [];

  let itemsTableRows = "";
  if (Array.isArray(items) && items.length > 0) {
    itemsTableRows = items
      .map((item) => {
        const name = item.name || item.medicine || "Item";
        const qty = item.quantity || item.qty || 1;
        const price = Number(item.price || 0);
        const total = Number(item.total || price * qty);

        return `
          <tr>
            <td style="padding: 6px; text-align: left;">${name}</td>
            <td style="padding: 6px; text-align: center;">${qty}</td>
            <td style="padding: 6px; text-align: right;">₹${price.toFixed(2)}</td>
            <td style="padding: 6px; text-align: right;">₹${total.toFixed(2)}</td>
          </tr>`;
      })
      .join("");
  } else {
    itemsTableRows = `<tr><td colspan="4" style="text-align: center; padding: 10px;">No items recorded</td></tr>`;
  }

  modalContent.innerHTML = `
    <div id="printableArea">
      <h3 style="margin-top:0; border-bottom: 2px solid #007bff; padding-bottom: 8px; color: #007bff;">💊 MediTrack AI - Invoice</h3>
      <p style="margin: 4px 0;"><strong>Invoice No:</strong> ${sale.invoiceNo || sale.id}</p>
      <p style="margin: 4px 0;"><strong>Customer:</strong> ${sale.customerName || sale.customer || "Walk-in Customer"}</p>
      <p style="margin: 4px 0;"><strong>Mobile:</strong> ${sale.mobile || sale.phone || "N/A"}</p>
      <p style="margin: 4px 0;"><strong>Date:</strong> ${sale.date || "N/A"}</p>
      
      <hr style="border: none; border-top: 1px dashed #ccc; margin: 12px 0;">
      
      <p style="margin: 8px 0;"><strong>Purchased Items:</strong></p>
      <table border="1" cellpadding="6" cellspacing="0" style="width: 100%; border-collapse: collapse; text-align: left;">
        <thead>
          <tr style="background: #f4f4f4;">
            <th>Item</th>
            <th style="text-align: center;">Qty</th>
            <th style="text-align: right;">Price</th>
            <th style="text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsTableRows}
        </tbody>
      </table>
      
      <h3 style="text-align: right; margin-top: 15px; color: #28a745;">
        Total Amount: ₹${Number(sale.grandTotal || sale.total || 0).toFixed(2)}
      </h3>
    </div>

    <div class="no-print" style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 15px;">
      <button id="printInvoiceBtn" style="background: #28a745; color: white; border: none; padding: 8px 14px; border-radius: 4px; cursor: pointer;">Print Invoice</button>
      <button id="closeModalBtn" style="background: #dc3545; color: white; border: none; padding: 8px 14px; border-radius: 4px; cursor: pointer;">Close</button>
    </div>
  `;

  invoiceModal.style.display = "flex";

  // Bind click handlers dynamically to modal controls
  document.getElementById("closeModalBtn")?.addEventListener("click", closeModal);
  document.getElementById("printInvoiceBtn")?.addEventListener("click", () => window.print());
}

/**
 * Close modal dialog
 */
function closeModal() {
  if (invoiceModal) {
    invoiceModal.style.display = "none";
  }
}

// Global exposure for inline HTML fallbacks
window.openModal = openModal;
window.closeModal = closeModal;

/**
 * Live search filter logic
 */
if (searchSalesInput) {
  searchSalesInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase().trim();

    const filtered = allSales.filter((s) => {
      const inv = (s.invoiceNo || s.id || "").toLowerCase();
      const cust = (s.customerName || s.customer || "").toLowerCase();
      const mob = (s.mobile || s.phone || "").toLowerCase();

      return inv.includes(term) || cust.includes(term) || mob.includes(term);
    });

    renderSalesTable(filtered);
  });
}