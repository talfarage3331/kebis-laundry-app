import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBTFvdeLDkWKfUrNWCe7wWMk9VNzxwP8Ss",
  authDomain: "kevisa-5983b.firebaseapp.com",
  projectId: "kevisa-5983b",
  storageBucket: "kevisa-5983b.firebasestorage.app",
  messagingSenderId: "1009737796478",
  appId: "1:1009737796478:web:d55807a14c66ae901bc12f",
  measurementId: "G-1FSQBXGYE3",
};

/**
 * Lazily initialize Firebase only in browser/Worker environments that support it.
 * Calling these during SSR (Cloudflare Worker rendering) is safe — they return null
 * and all Firebase-dependent code already runs inside useEffect (client-only).
 */
function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null;
  try {
    return getApps().length ? getApp() : initializeApp(firebaseConfig);
  } catch {
    return null;
  }
}

// These are module-level singletons but evaluated lazily via getters,
// so they are never called at SSR module-evaluation time.
let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

function ensureApp(): FirebaseApp {
  if (!_app) _app = getFirebaseApp();
  if (!_app) throw new Error("Firebase is not available in this environment");
  return _app;
}

export function getFirebaseAuth(): Auth {
  if (!_auth) _auth = getAuth(ensureApp());
  return _auth;
}

export function getFirebaseDb(): Firestore {
  if (!_db) _db = getFirestore(ensureApp());
  return _db;
}

export function getGoogleProvider(): GoogleAuthProvider {
  return new GoogleAuthProvider();
}

/**
 * Backwards-compatible proxy exports so existing imports of `auth`, `db`, and
 * `googleProvider` keep working without touching every call site.
 *
 * These are Proxy objects that forward all property/method access to the real
 * Firebase instances, but only resolve them on first use (which is always
 * client-side because all Firebase calls are inside useEffect / event handlers).
 */
export const auth: Auth = new Proxy({} as Auth, {
  get(_target, prop) {
    return (getFirebaseAuth() as any)[prop];
  },
  set(_target, prop, value) {
    (getFirebaseAuth() as any)[prop] = value;
    return true;
  },
});

export const db: Firestore = new Proxy({} as Firestore, {
  get(_target, prop) {
    return (getFirebaseDb() as any)[prop];
  },
  set(_target, prop, value) {
    (getFirebaseDb() as any)[prop] = value;
    return true;
  },
});

export const googleProvider: GoogleAuthProvider = new Proxy({} as GoogleAuthProvider, {
  get(_target, prop) {
    return (getGoogleProvider() as any)[prop];
  },
});
