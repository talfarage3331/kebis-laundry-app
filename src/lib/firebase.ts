import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBTFvdeLDkWKfUrNWCe7wWMk9VNzxwP8Ss",
  authDomain: "kevisa-5983b.firebaseapp.com",
  projectId: "kevisa-5983b",
  storageBucket: "kevisa-5983b.firebasestorage.app",
  messagingSenderId: "1009737796478",
  appId: "1:1009737796478:web:d55807a14c66ae901bc12f",
  measurementId: "G-1FSQBXGYE3",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
