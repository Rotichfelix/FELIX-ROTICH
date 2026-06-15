import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize the central Firebase Applet instance
const app = initializeApp(firebaseConfig);

// Expose standard Firebase Storage
export const storage = getStorage(app);

// Expose Firestore using the custom database ID provided by the metadata agent and hardened long polling settings for iframe sandbox security
const firestoreDbId = (firebaseConfig as any).firestoreDatabaseId;
export const db = firestoreDbId 
  ? initializeFirestore(app, { experimentalForceLongPolling: true }, firestoreDbId)
  : initializeFirestore(app, { experimentalForceLongPolling: true });

// Expose standard Firebase Authentication
export const auth = getAuth(app);

// Google OAuth Login Provider Config
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleProvider.addScope('https://www.googleapis.com/auth/gmail.send');

// Hardened connection validation check
export async function checkFirestoreConnection() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.warn("[Firebase] Client is currently operating in offline mode (navigator.onLine is false).");
    return;
  }
  try {
    const connectionPromise = getDocFromServer(doc(db, 'test', 'connection'));
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("Connection check timed out after 2500ms")), 2500)
    );
    await Promise.race([connectionPromise, timeoutPromise]);
    console.log("[Firebase] Firestore server connection validated successfully.");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn("[Firebase] Operating in offline fallback mode. Database diagnostics:", msg);
  }
}

checkFirestoreConnection();
