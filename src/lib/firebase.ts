import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBTFvdeLDkWKfUrNWCe7wWMk9VNzxwP8Ss",
  authDomain: "kevisa-5983b.firebaseapp.com",
  projectId: "kevisa-5983b",
  storageBucket: "kevisa-5983b.firebasestorage.app",
  messagingSenderId: "1009737796478",
  appId: "1:1009737796478:web:d55807a14c66ae901bc12f",
  measurementId: "G-1FSQBXGYE3",
};

const isBrowser = typeof window !== "undefined";

// Initialize eagerly in the browser so Firebase SDK instanceof checks
// (used by signInWithPopup, signInWithEmailAndPassword, etc.) work correctly.
// During SSR we keep these as `null as any` — all auth code runs in event
// handlers or useEffect, which only execute client-side.
const app: FirebaseApp = (isBrowser
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null) as unknown as FirebaseApp;

// NOTE: These are null during SSR and on the very first synchronous JS frame
// before Firebase initialises. All consumers MUST use optional chaining:
//   auth?.currentUser   db?.collection(...)   etc.
export const auth: Auth = (isBrowser && app ? getAuth(app) : null) as unknown as Auth;
export const db: Firestore = (isBrowser && app ? getFirestore(app) : null) as unknown as Firestore;
export const storage: FirebaseStorage = (isBrowser && app ? getStorage(app) : null) as unknown as FirebaseStorage;
export const googleProvider: GoogleAuthProvider = (isBrowser
  ? new GoogleAuthProvider()
  : null) as unknown as GoogleAuthProvider;

export function getFirebaseAuth(): Auth {
  return auth;
}
export function getFirebaseDb(): Firestore {
  return db;
}
export function getGoogleProvider(): GoogleAuthProvider {
  return googleProvider;
}
