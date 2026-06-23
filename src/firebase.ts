import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { 
  initializeFirestore, 
  doc, 
  getDocFromServer,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  setLogLevel
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

// Silence connection-unavailable warnings from logging continuously when offline
setLogLevel('error');

// Initialize the central Firebase Applet instance
const app = initializeApp(firebaseConfig);

// Expose standard Firebase Storage
export const storage = getStorage(app);

// Safe local cache resolver for iframe sandboxes to prevent IndexedDB lock & permission faults
const safeLocalCache = (() => {
  try {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return memoryLocalCache();
    }
    
    // Proactively test IndexedDB open permissions to detect sandbox restrictions synchronously
    const testRequest = window.indexedDB.open("dummy-perm-test", 1);
    if (!testRequest) {
      return memoryLocalCache();
    }

    const isIframe = window.self !== window.top;
    if (isIframe) {
      // In restricted iframe environments, persistentMultipleTabManager throws locks errors. Single-tab mode is secure.
      return persistentLocalCache({});
    }

    return persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    });
  } catch (e) {
    console.warn("[Firebase] Browser sandbox/iframe IndexedDB restriction detected. Falling back to memoryLocalCache:", e);
    return memoryLocalCache();
  }
})();

// Expose Firestore using the custom database ID provided by the metadata config
const firestoreDbId = (firebaseConfig as any).firestoreDatabaseId;
export const db = firestoreDbId 
  ? initializeFirestore(app, { 
      experimentalForceLongPolling: true,
      localCache: safeLocalCache
    }, firestoreDbId)
  : initializeFirestore(app, { 
      experimentalForceLongPolling: true,
      localCache: safeLocalCache
    });

// Expose standard Firebase Authentication
export const auth = getAuth(app);

// Google OAuth Login Provider Config
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleProvider.addScope('https://www.googleapis.com/auth/drive');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleProvider.addScope('https://www.googleapis.com/auth/gmail.send');
googleProvider.addScope('https://www.googleapis.com/auth/forms.body');
googleProvider.addScope('https://www.googleapis.com/auth/forms.responses.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/documents');
googleProvider.addScope('https://www.googleapis.com/auth/classroom.courses.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/classroom.rosters.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/classroom.announcements');

// Hardened connection validation check (lazy check, can be invoked if required but not auto-run on module load to keep startup warnings clean)
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

// checkFirestoreConnection(); // Disabled auto-run on load to avoid 10-second backend connect warnings when offline or sandbox-restricted
