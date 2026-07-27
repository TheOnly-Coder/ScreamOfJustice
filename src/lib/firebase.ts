import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore, doc, getDocFromServer } from 'firebase/firestore';
import { getDatabase, Database } from 'firebase/database';
import firebaseConfig from '../../firebase-applet-config.json';

// ============================================================
// Default Firebase App (CallOfBooty — Firestore)
// ============================================================
const defaultApp: FirebaseApp = initializeApp(firebaseConfig, 'default');
export const defaultAuth: Auth = getAuth(defaultApp);
export const defaultDb: Firestore = getFirestore(defaultApp, firebaseConfig.firestoreDatabaseId);

async function testConnection() {
  try {
    await getDocFromServer(doc(defaultDb, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

// ============================================================
// Fast Firebase App (Scream of Justice — Realtime Database)
// ============================================================
const fastFirebaseConfig = {
  apiKey: "AIzaSyCGNgO66TR_YHLmiOCAYItn0a2gEAT23a0",
  authDomain: "scream-of-justice.firebaseapp.com",
  databaseURL: "https://scream-of-justice-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId: "scream-of-justice",
  storageBucket: "scream-of-justice.firebasestorage.app",
  messagingSenderId: "178618721941",
  appId: "1:178618721941:web:3abf958b76fa0cc0405d9c",
  measurementId: "G-P0L934D218"
};

const fastApp: FirebaseApp = initializeApp(fastFirebaseConfig, 'fast');
export const fastAuth: Auth = getAuth(fastApp);
export const fastDb: Database = getDatabase(fastApp);

// ============================================================
// Helper: get active backend based on mode
// ============================================================
export interface ActiveBackend {
  auth: Auth;
  db: Firestore | Database;
  dbType: 'firestore' | 'realtime';
}

export function getActiveBackend(mode: 'default' | 'fast'): ActiveBackend {
  if (mode === 'fast') {
    return { auth: fastAuth, db: fastDb, dbType: 'realtime' };
  }
  return { auth: defaultAuth, db: defaultDb, dbType: 'firestore' };
}

// ============================================================
// Backward-compatible exports (used by ProfileModal, AdminPanelModal)
// ============================================================
export const auth = defaultAuth;
export const db = defaultDb;
