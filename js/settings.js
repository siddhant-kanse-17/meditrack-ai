import { auth } from "./firebase.js";
import { 
    onAuthStateChanged, 
    updateProfile, 
    updateEmail, 
    updatePassword, 
    EmailAuthProvider, 
    reauthenticateWithCredential, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const profileForm = document.getElementById("profileForm");
const securityForm = document.getElementById("securityForm");

const adminNameInput = document.getElementById("adminNameInput");
const currentPasswordInput = document.getElementById("currentPassword");
const newEmailInput = document.getElementById("newEmail");
const newPasswordInput = document.getElementById("newPassword");

const saveProfileBtn = document.getElementById("saveProfileBtn");
const saveSecurityBtn = document.getElementById("saveSecurityBtn");
const logoutBtn = document.getElementById("logoutBtn");

// 1. Auth Guard & Initial Data Load
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "index.html";
    } else {
        adminNameInput.value = user.displayName || "";
        newEmailInput.value = user.email || "";
    }
});

// 2. Update Admin Name
profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newName = adminNameInput.value.trim();

    try {
        saveProfileBtn.disabled = true;
        saveProfileBtn.innerText = "Saving...";

        if (auth.currentUser) {
            await updateProfile(auth.currentUser, { displayName: newName });
            alert("Name updated successfully!");
        }
    } catch (err) {
        alert("Failed to update name: " + err.message);
    } finally {
        saveProfileBtn.disabled = false;
        saveProfileBtn.innerText = "Save Name";
    }
});

// 3. Update Email / Password
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

    try {
        saveSecurityBtn.disabled = true;
        saveSecurityBtn.innerText = "Updating...";

        // Re-authenticate
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);

        if (newEmail && newEmail !== user.email) {
            await updateEmail(user, newEmail);
        }

        if (newPassword) {
            if (newPassword.length < 6) {
                alert("Password must be at least 6 characters.");
                return;
            }
            await updatePassword(user, newPassword);
        }

        alert("Credentials updated successfully!");
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

// 4. Logout
if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        await signOut(auth);
        window.location.href = "index.html";
    });
}