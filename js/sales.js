import {
    collection,
    getDocs
} from "firebase/firestore";

import { db } from "./firebase.js";

const salesTable = document.getElementById("salesTable");
const totalSales = document.getElementById("totalSales");

// Modal Elements
const invoiceModal = document.getElementById("invoiceModal");
const invoiceDetails = document.getElementById("invoiceDetails");

const searchInvoice = document.getElementById("searchInvoice");
const searchCustomer = document.getElementById("searchCustomer");
const searchBtn = document.getElementById("searchBtn");

async function loadSales(invoiceSearch = "", customerSearch = "") {

    salesTable.innerHTML = "";

    let grandTotal = 0;

    const querySnapshot = await getDocs(collection(db, "sales"));

    querySnapshot.forEach((docSnap) => {

        const sale = docSnap.data();

        // Filter by Invoice Number
        if (
            invoiceSearch &&
            !sale.invoiceNo.toLowerCase().includes(invoiceSearch.toLowerCase())
        ) {
            return;
        }

        // Filter by Customer Name
        if (
            customerSearch &&
            !sale.customer.toLowerCase().includes(customerSearch.toLowerCase())
        ) {
            return;
        }

        grandTotal += sale.grandTotal || 0;

        salesTable.innerHTML += `
        <tr>

            <td>${sale.invoiceNo}</td>

            <td>${sale.customer}</td>

            <td>${sale.mobile}</td>

            <td>₹${sale.grandTotal}</td>

            <td>${sale.date}</td>

            <td>${sale.time}</td>

            <td>
                <button onclick="viewInvoice('${sale.invoiceNo}')">
                    View
                </button>
            </td>

        </tr>
        `;

    });

    totalSales.innerText = `Total Sales : ₹${grandTotal}`;

}

// Initial Load
loadSales();

// Search Button Event Listener
searchBtn.addEventListener("click", () => {

    loadSales(
        searchInvoice.value.trim(),
        searchCustomer.value.trim()
    );

});

// View Invoice Details (Renders inside Modal)
window.viewInvoice = async function(invoiceNo){

    const querySnapshot = await getDocs(collection(db,"sales"));

    querySnapshot.forEach((docSnap)=>{

        const sale = docSnap.data();

        if(sale.invoiceNo === invoiceNo){

            let medicineRows = "";

            if (sale.medicines && Array.isArray(sale.medicines)) {
                sale.medicines.forEach((item) => {
                    medicineRows += `
                        <tr>
                            <td>${item.medicine}</td>
                            <td>${item.quantity}</td>
                            <td>₹${item.price}</td>
                            <td>₹${item.total}</td>
                        </tr>
                    `;
                });
            }

            invoiceDetails.innerHTML = `
            <p><b>Invoice :</b> ${sale.invoiceNo}</p>
            <p><b>Customer :</b> ${sale.customer}</p>
            <p><b>Mobile :</b> ${sale.mobile}</p>
            <p><b>Date :</b> ${sale.date}</p>
            <p><b>Time :</b> ${sale.time}</p>

            <br>
            <h4>Purchased Items</h4>
            <table border="1" cellpadding="8" cellspacing="0" style="width:100%; margin-top:10px;">
                <thead>
                    <tr>
                        <th>Medicine</th>
                        <th>Qty</th>
                        <th>Price</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${medicineRows}
                </tbody>
            </table>

            <br>
            <p><b>Grand Total :</b> ₹${sale.grandTotal}</p>
            `;

            invoiceModal.style.display = "block";

        }

    });

}

// Close Modal Function
window.closeModal = function(){

    invoiceModal.style.display = "none";

}

// Print Invoice Function
window.printInvoice = function () {

    const printContents = document.getElementById("invoiceDetails").innerHTML;

    const printWindow = window.open("", "", "width=800,height=600");

    printWindow.document.write(`
        <html>

        <head>

            <title>Invoice</title>

            <style>

                body{
                    font-family:Arial,sans-serif;
                    margin:30px;
                }

                h1{
                    text-align:center;
                }

                table{
                    width:100%;
                    border-collapse:collapse;
                    margin-top:15px;
                }

                table,th,td{
                    border:1px solid black;
                }

                th,td{
                    padding:8px;
                    text-align:center;
                }

            </style>

        </head>

        <body>

            <h1>MediTrack AI</h1>

            ${printContents}

        </body>

        </html>
    `);

    printWindow.document.close();

    printWindow.print();

}