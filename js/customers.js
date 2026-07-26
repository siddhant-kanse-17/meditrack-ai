import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";

const customersTableBody = document.getElementById("customersTableBody");
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

// 2. Fetch Sales & Group by Customer Mobile
async function loadCustomersData() {
    // Check if user clicked reset button previously
    if (localStorage.getItem('customersReset') === 'true') {
        allCustomers = [];
        if (customersTableBody) {
            customersTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#888;">No customer records found.</td></tr>`;
        }
        return;
    }

    try {
        const salesSnapshot = await getDocs(collection(db, "sales"));
        const customerMap = {};

        if (!salesSnapshot.empty) {
            salesSnapshot.forEach((docSnap) => {
                const sale = docSnap.data();
                const mobile = sale.mobile || sale.customerPhone || sale.customerMobile || "N/A";
                
                let name = sale.customerName || sale.customer || sale.name || sale.custName;
                if (!name || name.trim() === "" || name === "Guest Customer") {
                    name = mobile !== "N/A" ? `Customer (${mobile.slice(-4)})` : "Walk-in Customer";
                }

                const amount = Number(sale.grandTotal || sale.totalAmount || 0);
                const date = sale.date || "N/A";

                const billRecord = {
                    id: docSnap.id,
                    invoiceNo: sale.invoiceNo || docSnap.id,
                    grandTotal: amount,
                    date: date,
                    time: sale.time || "",
                    medicines: sale.medicines || sale.items || []
                };

                if (!customerMap[mobile]) {
                    customerMap[mobile] = {
                        name: name,
                        mobile: mobile,
                        totalBills: 1,
                        totalPurchase: amount,
                        lastPurchase: date,
                        bills: [billRecord]
                    };
                } else {
                    if (customerMap[mobile].name.startsWith("Customer (") && !name.startsWith("Customer (")) {
                        customerMap[mobile].name = name;
                    }
                    customerMap[mobile].totalBills += 1;
                    customerMap[mobile].totalPurchase += amount;
                    customerMap[mobile].lastPurchase = date;
                    customerMap[mobile].bills.push(billRecord);
                }
            });
        }

        // Check LocalStorage for local fallback records
        const localCustomers = JSON.parse(localStorage.getItem('customers')) || [];
        localCustomers.forEach(localCust => {
            if (localCust.mobile && !customerMap[localCust.mobile]) {
                customerMap[localCust.mobile] = localCust;
            }
        });

        allCustomers = Object.values(customerMap);
        
        if (allCustomers.length === 0) {
            if (customersTableBody) {
                customersTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#888;">No customer records found.</td></tr>`;
            }
            return;
        }

        // Apply filters & render
        applySearchAndSort();

    } catch (err) {
        console.error("Error loading customers:", err);
        if (customersTableBody) {
            customersTableBody.innerHTML = `<tr><td colspan="6" style="color:red; text-align:center;">Error loading customer records.</td></tr>`;
        }
    }
}

// 3. Filter and Sort Handler
function applySearchAndSort() {
    let result = [...allCustomers];

    // Filter by Search Term
    if (searchCustomerInput) {
        const term = searchCustomerInput.value.toLowerCase().trim();
        if (term !== "") {
            result = result.filter(c => 
                (c.name || "").toLowerCase().includes(term) || 
                (c.mobile || "").toLowerCase().includes(term)
            );
        }
    }

    // Sort Logic
    const sortValue = sortSelect ? sortSelect.value : "recent";

    if (sortValue === "recent") {
        result.sort((a, b) => new Date(b.lastPurchase || 0) - new Date(a.lastPurchase || 0));
    } else if (sortValue === "name") {
        result.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (sortValue === "purchaseHigh") {
        result.sort((a, b) => (Number(b.totalPurchase) || 0) - (Number(a.totalPurchase) || 0));
    } else if (sortValue === "purchaseLow") {
        result.sort((a, b) => (Number(a.totalPurchase) || 0) - (Number(b.totalPurchase) || 0));
    }

    renderCustomersTable(result);
}

// 4. Render Table Function
function renderCustomersTable(customersList) {
    if (!customersTableBody) return;
    customersTableBody.innerHTML = "";

    if (customersList.length === 0) {
        customersTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#888;">No matching customers found.</td></tr>`;
        return;
    }

    customersList.forEach((cust) => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td><b>${cust.name}</b></td>
            <td>${cust.mobile}</td>
            <td>${cust.totalBills}</td>
            <td>₹${cust.totalPurchase}</td>
            <td>${cust.lastPurchase}</td>
            <td>
                <button onclick="viewCustomerBills('${cust.mobile}')" style="background:#007bff; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:14px;" title="View Bills">
                    👁️ View Bill
                </button>
            </td>
        `;

        customersTableBody.appendChild(tr);
    });
}

// 5. Dynamic Event Listeners
if (searchCustomerInput) {
    searchCustomerInput.addEventListener("input", applySearchAndSort);
}

if (sortSelect) {
    sortSelect.addEventListener("change", applySearchAndSort);
}

// Reset Customers Data Sheet Handler
if (resetCustBtn) {
    resetCustBtn.addEventListener('click', function () {
        const isConfirmed = window.confirm("⚠️ Kya aap poora Customer data aur billing history permanently reset karna chahte hain?");

        if (isConfirmed) {
            // 1. Clear both customers list and related sales/bills
            localStorage.removeItem('customers');
            localStorage.removeItem('bills');
            localStorage.removeItem('sales');

            // 2. Set persistent reset flag
            localStorage.setItem('customersReset', 'true');

            alert("Customer data permanently delete ho gaya hai!");

            // 3. Page reload so UI updates cleanly
            location.reload();
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

// 6. Global Modal Handler for Detailed Invoices
window.viewCustomerBills = function(mobile) {
    const cust = allCustomers.find(c => c.mobile === mobile);
    if (!cust) return;

    let sortedBills = [...cust.bills].reverse();

    let billsListHtml = sortedBills.map((b, index) => {
        let itemsRows = (b.medicines || []).map(m => {
            const medName = m.medicine || m.name || 'Medicine';
            const price = Number(m.price || 0);
            const qty = Number(m.quantity || m.qty || 1);
            const total = Number(m.total || price * qty);
            return `
                <tr>
                    <td style="border:1px solid #ddd; padding:6px;">${medName}</td>
                    <td style="border:1px solid #ddd; padding:6px; text-align:center;">₹${price}</td>
                    <td style="border:1px solid #ddd; padding:6px; text-align:center;">${qty}</td>
                    <td style="border:1px solid #ddd; padding:6px; text-align:right;">₹${total}</td>
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
                        ${itemsRows}
                    </tbody>
                </table>

                <div style="text-align:right; font-size:15px; font-weight:bold; margin-bottom:12px;">
                    Grand Total: ₹${b.grandTotal}
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

// Single Bill Print Execution
window.printSingleBill = function(billDivId) {
    const printContent = document.getElementById(billDivId).outerHTML;
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

// Modal Close Helper
window.closeCustomerModal = function() {
    const modal = document.getElementById("customerBillModal");
    if (modal) modal.remove();
};