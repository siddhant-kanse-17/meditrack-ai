import { db } from "./firebase-config.js";
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

    // LocalStorage fallback if Firestore returns no records
    if (allSales.length === 0) {
      allSales = JSON.parse(localStorage.getItem("sales")) || [];
    }
  } catch (error) {
    console.warn("Firestore fetch failed, using local storage fallback:", error);
    allSales = JSON.parse(localStorage.getItem("sales")) || [];
  }

  renderSalesTable(allSales);
}

/**
 * Render table rows & calculate grand total
 */
function renderSalesTable(salesData) {
  if (!salesTableBody) return;

  if (salesData.length === 0) {
    salesTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 15px; color: #666;">
          No sales records found.
        </td>
      </tr>`;
    if (totalSalesElement) totalSalesElement.innerText = "Total Sales: ₹0.00";
    return;
  }

  let runningTotal = 0;

  salesTableBody.innerHTML = salesData
    .map((sale) => {
      // Field normalization to handle schema differences
      const invoiceNo = sale.invoiceNo || sale.id || "N/A";
      const customer = sale.customerName || sale.customer || "Walk-in Customer";
      const mobile = sale.mobile || sale.phone || "N/A";
      const totalAmount = Number(sale.grandTotal || sale.total || 0);
      
      runningTotal += totalAmount;

      // Date parsing
      let formattedDate = sale.date || "N/A";
      if (sale.timestamp?.toDate) {
        formattedDate = sale.timestamp.toDate().toLocaleDateString();
      } else if (sale.timestamp?.seconds) {
        formattedDate = new Date(sale.timestamp.seconds * 1000).toLocaleDateString();
      }

      return `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 10px;"><strong>${invoiceNo}</strong></td>
          <td>${customer}</td>
          <td>${mobile}</td>
          <td><strong>₹${totalAmount.toFixed(2)}</strong></td>
          <td>${formattedDate}</td>
          <td>
            <button onclick="openModal('${sale.id || invoiceNo}')" 
                    style="background:#007bff; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">
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
}

/**
 * Filter handler for Search Input
 */
if (searchSalesInput) {
  searchSalesInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase().trim();

    const filtered = allSales.filter((sale) => {
      const invoice = (sale.invoiceNo || sale.id || "").toLowerCase();
      const customer = (sale.customerName || sale.customer || "").toLowerCase();
      const mobile = (sale.mobile || sale.phone || "").toLowerCase();

      return invoice.includes(term) || customer.includes(term) || mobile.includes(term);
    });

    renderSalesTable(filtered);
  });
}

/**
 * Open Modal and display invoice details
 */
window.openModal = function (saleId) {
  const sale = allSales.find((s) => s.id === saleId || s.invoiceNo === saleId);
  if (!sale || !invoiceModal || !modalContent) return;

  const items = sale.items || sale.medicines || [];
  
  let itemsTableRows = "";
  if (Array.isArray(items) && items.length > 0) {
    itemsTableRows = items
      .map((item) => {
        const name = item.name || item.medicine || "Item";
        const qty = item.quantity || 1;
        const price = Number(item.price || 0);
        const itemTotal = Number(item.total || price * qty);

        return `
          <tr>
            <td style="padding:6px; text-align:left;">${name}</td>
            <td style="padding:6px; text-align:center;">${qty}</td>
            <td style="padding:6px; text-align:right;">₹${price.toFixed(2)}</td>
            <td style="padding:6px; text-align:right;">₹${itemTotal.toFixed(2)}</td>
          </tr>`;
      })
      .join("");
  } else {
    itemsTableRows = `<tr><td colspan="4" style="text-align:center; padding:10px;">No items recorded</td></tr>`;
  }

  modalContent.innerHTML = `
    <div id="printableArea">
      <h2 style="margin-top:0; border-bottom:2px solid #007bff; padding-bottom:8px; color:#007bff;">💊 MediTrack AI - Invoice</h2>
      <p style="margin:4px 0;"><strong>Invoice No:</strong> ${sale.invoiceNo || sale.id}</p>
      <p style="margin:4px 0;"><strong>Customer:</strong> ${sale.customerName || sale.customer || "Walk-in Customer"}</p>
      <p style="margin:4px 0;"><strong>Mobile:</strong> ${sale.mobile || sale.phone || "N/A"}</p>
      <p style="margin:4px 0;"><strong>Date:</strong> ${sale.date || "N/A"}</p>
      
      <hr style="border:none; border-top:1px dashed #ccc; margin:12px 0;">
      
      <h4 style="margin:8px 0;">Purchased Items:</h4>
      <table border="1" cellpadding="6" cellspacing="0" style="width:100%; border-collapse:collapse; text-align:left;">
        <thead>
          <tr style="background:#f4f4f4;">
            <th>Item</th>
            <th style="text-align:center;">Qty</th>
            <th style="text-align:right;">Price</th>
            <th style="text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsTableRows}
        </tbody>
      </table>
      
      <h3 style="text-align:right; margin-top:15px; color:#28a745;">
        Grand Total: ₹${Number(sale.grandTotal || sale.total || 0).toFixed(2)}
      </h3>
    </div>

    <div class="no-print" style="display:flex; justify-content:flex-end; gap:10px; margin-top:15px;">
      <button onclick="printInvoice()" style="background:#28a745; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;">Print Invoice</button>
      <button onclick="closeModal()" style="background:#dc3545; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;">Close</button>
    </div>
  `;

  invoiceModal.style.display = "flex";
};

/**
 * Close Modal
 */
window.closeModal = function () {
  if (invoiceModal) invoiceModal.style.display = "none";
};

/**
 * Print Invoice
 */
window.printInvoice = function () {
  window.print();
};

// Initialize on DOM load
document.addEventListener("DOMContentLoaded", loadSalesHistory);