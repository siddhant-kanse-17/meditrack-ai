import { auth } from "./firebase.js";
import { 
  signInWithEmailAndPassword, 
  setPersistence, 
  browserLocalPersistence 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email") || document.getElementById("loginEmail");
const passwordInput = document.getElementById("password") || document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn") || document.querySelector("button[type='submit']");
const errorMsgEl = document.getElementById("errorMessage") || document.getElementById("error");

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    // 1. Crucial for Mobile: Page reload roko!
    e.preventDefault();

    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value.trim() : "";

    if (!email || !password) {
      if (errorMsgEl) errorMsgEl.innerText = "Please fill in all fields.";
      else alert("Please fill in both Email & Password.");
      return;
    }

    try {
      if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.innerText = "Logging in...";
      }

      // 2. Mobile Browser Local Storage Session Ensure Karo
      await setPersistence(auth, browserLocalPersistence);

      // 3. Firebase Sign In
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Admin name save karo dashboard ke liye
      const nameFromEmail = email.split("@")[0];
      const capitalized = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);
      localStorage.setItem("adminName", capitalized);

      // Successful login -> Redirect to Dashboard
      window.location.href = "dashboard.html";

    } catch (error) {
      console.error("Login Error:", error);
      
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.innerText = "Login";
      }

      let msg = "Invalid Email or Password!";
      if (error.code === "auth/network-request-failed") {
        msg = "Network error. Please check your internet connection.";
      } else if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
        msg = "Incorrect Email or Password.";
      }

      if (errorMsgEl) {
        errorMsgEl.innerText = msg;
        errorMsgEl.style.display = "block";
      } else {
        alert(msg);
      }
    }
  });
}