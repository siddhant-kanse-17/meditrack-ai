import { auth } from "./firebase.js";
import { 
    onAuthStateChanged, 
    updateProfile, 
    updateEmail, 
    updatePassword, 
    EmailAuthProvider, 
    reauthenticateWithCredential, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const profileForm = document.getElementById("profileForm");
const securityForm = document.getElementById("securityForm");

const adminNameInput = document.getElementById("adminNameInput");
const currentPasswordInput = document.getElementById("currentPassword");
const newEmailInput = document.getElementById("newEmail");
const newPasswordInput = document.getElementById("newPassword");

const saveProfileBtn = document.getElementById("saveProfileBtn");
const saveSecurityBtn = document.getElementById("saveSecurityBtn");
const logoutBtn = document.getElementById("logoutBtn");

// 1. Instant Auth Guard & Initial Data Load
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace("index.html");
  } else {
    document.documentElement.style.display = 'block';
    
    // Load Admin Name from localStorage or Firebase displayName
    const currentAdminName = localStorage.getItem("adminName") || user.displayName || "";
    if (adminNameInput) adminNameInput.value = currentAdminName;
    if (newEmailInput) newEmailInput.value = user.email || "";
  }
});

// 2. Update Admin Name (Saves to both Firebase Profile and LocalStorage)
if (profileForm) {
    profileForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const newName = adminNameInput.value.trim();

        if (!newName) {
            alert("Please enter a valid name.");
            return;
        }

        try {
            saveProfileBtn.disabled = true;
            saveProfileBtn.innerText = "Saving...";

            if (auth.currentUser) {
                await updateProfile(auth.currentUser, { displayName: newName });
            }
            
            // Save to localStorage so dashboard reads it instantly
            localStorage.setItem("adminName", newName);

            alert("Admin Name updated successfully! 🎉");
        } catch (err) {
            alert("Failed to update name: " + err.message);
        } finally {
            saveProfileBtn.disabled = false;
            saveProfileBtn.innerText = "Save Name";
        }
    });
}

// 3. Update Email / Password securely
if (securityForm) {
    securityForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const user = auth.currentUser;
        const currentPassword = currentPasswordInput.value;
        const newEmail = newEmailInput.value.trim();
        const newPassword = newPasswordInput.value;

        if (!currentPassword) {
            alert("Please enter your current password.");
            return;
        }

        if (!newEmail && !newPassword) {
            alert("Please enter either a new email or a new password.");
            return;
        }

        try {
            saveSecurityBtn.disabled = true;
            saveSecurityBtn.innerText = "Updating...";

            // Re-authenticate user before changing sensitive credentials
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);

            if (newEmail && newEmail !== user.email) {
                await updateEmail(user, newEmail);
            }

            if (newPassword) {
                if (newPassword.length < 6) {
                    alert("Password must be at least 6 characters long.");
                    saveSecurityBtn.disabled = false;
                    saveSecurityBtn.innerText = "Update Credentials";
                    return;
                }
                await updatePassword(user, newPassword);
            }

            alert("Credentials updated successfully! 🎉");
            currentPasswordInput.value = "";
            newPasswordInput.value = "";

        } catch (err) {
            console.error("Update Error:", err);
            alert("Error: " + err.message);
        } finally {
            saveSecurityBtn.disabled = false;
            saveSecurityBtn.innerText = "Update Credentials";
        }
    });
}

// 4. Logout
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