import { auth } from "./firebase.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const loginBtn = document.getElementById("loginBtn");
  const errorMsgEl = document.getElementById("error");

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Fetch values directly inside the event handler to preserve mobile keyboard input
      const emailEl = document.getElementById("email");
      const passwordEl = document.getElementById("password");

      const email = emailEl ? emailEl.value.trim() : "";
      const password = passwordEl ? passwordEl.value.trim() : "";

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

        if (errorMsgEl) errorMsgEl.style.display = "none";

        // Direct Firebase Login
        await signInWithEmailAndPassword(auth, email, password);

        // Save Admin Name
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

        // Show alert popup on mobile to catch exact error if any
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
    });
  }
});