import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDHRdCrpkuCIzLD9fIdIu4VnZtf8Lb9uVM",
  authDomain: "meditrack-ai-71ad4.firebaseapp.com",
  projectId: "meditrack-ai-71ad4",
  storageBucket: "meditrack-ai-71ad4.firebasestorage.app",
  messagingSenderId: "820598903713",
  appId: "1:820598903713:web:1fad0fd0e6fa7c73f7f1e0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };