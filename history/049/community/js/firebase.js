console.warn("[BlockRail] 경고: 이곳에 코드를 넣지 마십시오. 보안에 큰 위험이 있을수 있습니다.");
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {   apiKey: "AIzaSyDByzSlI85c2_uvbyZ_Y_bHmPbcGcq7kJ0",   authDomain: "koreansniper-github-io.firebaseapp.com",   projectId: "koreansniper-github-io",   storageBucket: "koreansniper-github-io.firebasestorage.app",   messagingSenderId: "762725531858",   appId: "1:762725531858:web:1a66955dbe14d298b86d0b",   measurementId: "G-4MGW9WMTB7" };

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
// GitHub Pages 환경에서 WebChannel이 간헐적으로 400을 반환하므로 장기 폴링을 강제한다.
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
});

