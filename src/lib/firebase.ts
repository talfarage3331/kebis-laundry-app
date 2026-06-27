import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  type AppCheck,
} from "firebase/app-check";

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

// ── Firebase App Check ─────────────────────────────────────────────────────
// App Check uses reCAPTCHA v3 to attest that requests come from a genuine
// browser app, blocking bots, curl scripts, and other automated clients
// from invoking Firestore/Auth operations and inflating Free Tier usage.
//
// To enable:
//   1. Go to Firebase Console → App Check → Register your app with reCAPTCHA v3.
//   2. Add your reCAPTCHA v3 site key to the .env file:
//        VITE_RECAPTCHA_V3_SITE_KEY=<your-key>
//   3. In the Firebase Console, enforce App Check on Firestore and Auth.
//
// NOTE: App Check is a best-effort anti-abuse layer. It is NOT a substitute
// for Firestore Security Rules — both layers must be active.
export let appCheck: AppCheck | null = null;

if (isBrowser && app) {
  const siteKey = import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY;
  if (siteKey && siteKey !== "<your-recaptcha-v3-site-key-here>") {
    try {
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(siteKey),
        // Automatically refresh tokens before they expire so long-running
        // sessions are never blocked mid-use.
        isTokenAutoRefreshEnabled: true,
      });
      console.log("[Firebase] App Check initialized successfully.");
    } catch (error) {
      console.error("[Firebase] Failed to initialize App Check:", error);
    }
  } else {
    console.warn(
      "[Firebase] App Check site key is missing or has placeholder value. App Check is disabled."
    );
  }
}

// NOTE: These are null during SSR and on the very first synchronous JS frame
// before Firebase initialises. All consumers MUST use optional chaining:
//   auth?.currentUser   db?.collection(...)   etc.
export const auth: Auth = (isBrowser && app ? getAuth(app) : null) as unknown as Auth;
export const db: Firestore = (isBrowser && app ? getFirestore(app) : null) as unknown as Firestore;
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
