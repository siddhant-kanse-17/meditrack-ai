import { auth } from "./firebase.js";
import { signInWithEmailAndPassword } from "firebase/auth";

const loginForm = document.getElementById("loginForm");
const error = document.getElementById("error");

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {

        await signInWithEmailAndPassword(auth, email, password);

        alert("Login Successful!");

        window.location.href = "dashboard.html";

    } catch (err) {

        error.innerText = err.message;
    }

});