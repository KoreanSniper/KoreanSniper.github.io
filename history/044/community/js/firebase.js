import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {   apiKey: "AIzaSyDByzSlI85c2_uvbyZ_Y_bHmPbcGcq7kJ0",   authDomain: "koreansniper-github-io.firebaseapp.com",   projectId: "koreansniper-github-io",   storageBucket: "koreansniper-github-io.firebasestorage.app",   messagingSenderId: "762725531858",   appId: "1:762725531858:web:1a66955dbe14d298b86d0b",   measurementId: "G-4MGW9WMTB7" };

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);