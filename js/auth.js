import { auth } from "./firebase.js";
import { 
  signInWithEmailAndPassword, 
  setPersistence, 
  browserLocalPersistence 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const errorMsgEl = document.getElementById("error");

async function handleLogin(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value.trim() : "";

  if (!email || !password) {
    if (errorMsgEl) {
      errorMsgEl.innerText = "Please fill in both Email & Password.";
      errorMsgEl.style.display = "block";
    } else {
      alert("Please fill in both Email & Password.");
    }
    return;
  }

  try {
    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.innerText = "Logging in...";
    }

    if (errorMsgEl) errorMsgEl.innerText = "";

    // Direct Firebase Sign In First (Fastest for Mobile)
    await signInWithEmailAndPassword(auth, email, password);
    
    // Set Persistence asynchronously
    setPersistence(auth, browserLocalPersistence).catch(() => {});

    // Save Admin name
    const nameFromEmail = email.split("@")[0];
    const capitalized = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);
    localStorage.setItem("adminName", capitalized);

    // Redirect to Dashboard
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
    } else if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password" || error.code === "auth/user-not-found") {
      msg = "Incorrect Email or Password.";
    }

    if (errorMsgEl) {
      errorMsgEl.innerText = msg;
      errorMsgEl.style.display = "block";
    } else {
      alert(msg);
    }
  }
}

if (loginForm) {
  loginForm.addEventListener("submit", handleLogin);
}