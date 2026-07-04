import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, updateDoc, getDoc } from "firebase/firestore";
import readline from "readline";

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
const auth = getAuth(app);
const db = getFirestore(app);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const email = "talfarage3331@gmail.com";

rl.question(`Enter password for ${email}: `, async (password) => {
  rl.close();
  try {
    console.log("Signing in...");
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;
    console.log(`Signed in successfully. UID: ${uid}`);

    const userDocRef = doc(db, "users", uid);
    console.log("Checking current profile...");
    const snap = await getDoc(userDocRef);

    if (snap.exists()) {
      console.log("Updating profile role to 'admin'...");
      await updateDoc(userDocRef, { role: "admin" });
    } else {
      console.log("Document does not exist. Creating profile with role 'admin'...");
      await updateDoc(userDocRef, {
        email: email,
        role: "admin",
        fullName: "System Admin"
      });
    }

    console.log("SUCCESS: User profile has been successfully updated with role: 'admin'!");
  } catch (error) {
    console.error("FAILED to set admin role:", error.message || error);
  }
});
