import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported as isAnalyticsSupported } from "firebase/analytics";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot
} from "firebase/firestore";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  User
} from "firebase/auth";

// Firebase Configuration loaded strictly from Vite environment variables (VITE_*)
// Real credentials live in .env locally and in Vercel Environment Variables in production.
// No keys or credentials are hardcoded or obfuscated in repository code.
export const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY || "").trim(),
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "").trim(),
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID || "").trim(),
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "").trim(),
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "").trim(),
  appId: (import.meta.env.VITE_FIREBASE_APP_ID || "").trim(),
  measurementId: (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "").trim()
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.apiKey.length > 5);

// Initialize Firebase App & Services safely
let appInstance: any = null;
let dbInstance: any = null;
let authInstance: any = null;

if (isFirebaseConfigured) {
  try {
    appInstance = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    dbInstance = getFirestore(appInstance);
    authInstance = getAuth(appInstance);
  } catch (e) {
    console.warn("Firebase initialization warning:", e);
  }
} else {
  console.warn("⚠️ Firebase configuration missing: VITE_FIREBASE_API_KEY is not defined in environment variables. Add it in Vercel Project Settings > Environment Variables.");
}

export const app = appInstance;
export const db = dbInstance;
export const auth = authInstance;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account"
});

// Designated Sole Administrator Account
export const DESIGNATED_ADMIN_EMAIL = "bungorajesh23@gmail.com";

// Safe Analytics Initialization
export let analytics: any = null;
if (typeof window !== "undefined" && appInstance && firebaseConfig.measurementId) {
  isAnalyticsSupported().then(supported => {
    if (supported) {
      analytics = getAnalytics(appInstance);
      console.log("Firebase Analytics initialized:", firebaseConfig.measurementId);
    }
  }).catch(err => {
    console.warn("Firebase Analytics initialization notice:", err);
  });
}

// Error Handling Specification
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const currentUser = authInstance ? authInstance.currentUser : null;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid || null,
      email: currentUser?.email || null,
      emailVerified: currentUser?.emailVerified || null,
      isAnonymous: currentUser?.isAnonymous || null,
      tenantId: currentUser?.tenantId || null,
      providerInfo: currentUser?.providerData?.map((p: any) => ({
        providerId: p.providerId,
        email: p.email || null
      })) || []
    },
    operationType,
    path
  };
  console.warn("Firestore Notice:", JSON.stringify(errInfo));
}

// Global Bridge for BlueprintStore, FaqQuestionsStore, TemplateStore & Admin Authentication
const FirebaseSync = {
  isReady: true,
  isConfigured: isFirebaseConfigured,
  projectId: firebaseConfig.projectId,
  db: dbInstance,
  app: appInstance,
  auth: authInstance,
  designatedAdminEmail: DESIGNATED_ADMIN_EMAIL,

  // --- AUTHENTICATION (Google Sign-In with Restricted Admin Whitelist) ---
  isAuthorizedAdmin(user: User | null): boolean {
    if (!user || !user.email) return false;
    return user.email.toLowerCase() === DESIGNATED_ADMIN_EMAIL.toLowerCase();
  },

  async signInAdminWithGoogle(): Promise<{ user: User; email: string; displayName: string | null; photoURL: string | null }> {
    if (!isFirebaseConfigured || !authInstance) {
      throw new Error('Firebase environment variables (VITE_FIREBASE_API_KEY) are missing in this deployment. Please add them in your Vercel Project Settings > Environment Variables.');
    }
    try {
      await setPersistence(authInstance, browserLocalPersistence);
    } catch (pErr) {
      console.warn("Device persistence notice:", pErr);
    }

    const credential = await signInWithPopup(authInstance, googleProvider);
    const user = credential.user;

    if (!this.isAuthorizedAdmin(user)) {
      await signOut(authInstance);
      throw new Error('Access Denied.');
    }

    return {
      user,
      email: user.email!,
      displayName: user.displayName || user.email!.split('@')[0],
      photoURL: user.photoURL || null
    };
  },

  async signOutAdmin(): Promise<void> {
    if (authInstance) {
      await signOut(authInstance);
    }
  },

  onAdminAuthStateChanged(callback: (user: User | null, isAuthorized: boolean) => void) {
    if (!authInstance) {
      callback(null, false);
      return () => {};
    }
    return onAuthStateChanged(authInstance, user => {
      const isAuth = this.isAuthorizedAdmin(user);
      callback(user, isAuth);
    });
  },

  getCurrentAdminUser(): User | null {
    if (!authInstance) return null;
    const user = authInstance.currentUser;
    return this.isAuthorizedAdmin(user) ? user : null;
  },

  // --- BLUEPRINTS (Project Intake Briefs) ---
  async addBlueprint(data: any) {
    if (!dbInstance) return;
    const docId = data.id || 'bp_' + Date.now().toString(36);
    try {
      await setDoc(doc(dbInstance, "blueprints", docId), data, { merge: true });
      console.log("Synced blueprint to Firestore:", docId);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `blueprints/${docId}`);
    }
  },

  async updateBlueprintStatus(id: string, newStatus: string) {
    if (!dbInstance) return;
    try {
      await updateDoc(doc(dbInstance, "blueprints", id), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      console.log("Updated blueprint status in Firestore:", id, newStatus);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `blueprints/${id}`);
    }
  },

  async updateBlueprintNotes(id: string, notes: string) {
    if (!dbInstance) return;
    try {
      await updateDoc(doc(dbInstance, "blueprints", id), {
        internal_notes: notes,
        updatedAt: new Date().toISOString()
      });
      console.log("Updated blueprint notes in Firestore:", id);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `blueprints/${id}`);
    }
  },

  async deleteBlueprint(id: string) {
    if (!dbInstance) return;
    try {
      await deleteDoc(doc(dbInstance, "blueprints", id));
      console.log("Deleted blueprint from Firestore:", id);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `blueprints/${id}`);
    }
  },

  async purgePlaceholderBlueprints() {
    if (!dbInstance) return;
    const placeholderIds = ['bp_seed_001', 'bp_seed_002', 'bp_seed_003', 'bp_seed_004'];
    for (const id of placeholderIds) {
      try {
        await deleteDoc(doc(dbInstance, "blueprints", id));
      } catch (_) {}
    }
  },

  listenBlueprints(callback: (items: any[]) => void) {
    if (!dbInstance) return () => {};
    const placeholderIds = new Set(['bp_seed_001', 'bp_seed_002', 'bp_seed_003', 'bp_seed_004']);
    this.purgePlaceholderBlueprints().catch(() => {});
    try {
      return onSnapshot(
        collection(dbInstance, "blueprints"),
        snapshot => {
          const items: any[] = [];
          snapshot.forEach(docSnap => {
            const id = docSnap.id;
            if (placeholderIds.has(id)) {
              deleteDoc(doc(dbInstance, "blueprints", id)).catch(() => {});
              return;
            }
            items.push({ ...docSnap.data(), id });
          });
          callback(items);
        },
        error => {
          handleFirestoreError(error, OperationType.LIST, "blueprints");
        }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, "blueprints");
      return () => {};
    }
  },

  // --- QUESTIONS (Visitor Inquiries) ---
  async addQuestion(data: any) {
    if (!dbInstance) return;
    const docId = data.id || 'faq_' + Date.now().toString(36);
    try {
      await setDoc(doc(dbInstance, "questions", docId), data, { merge: true });
      console.log("Synced question to Firestore:", docId);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `questions/${docId}`);
    }
  },

  async updateQuestionStatus(id: string, status: string) {
    if (!dbInstance) return;
    try {
      const payload: any = { status };
      if (status === 'Replied') payload.repliedAt = new Date().toISOString();
      await updateDoc(doc(dbInstance, "questions", id), payload);
      console.log("Updated question status in Firestore:", id, status);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `questions/${id}`);
    }
  },

  async deleteQuestion(id: string) {
    if (!dbInstance) return;
    try {
      await deleteDoc(doc(dbInstance, "questions", id));
      console.log("Deleted question from Firestore:", id);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `questions/${id}`);
    }
  },

  listenQuestions(callback: (items: any[]) => void) {
    if (!dbInstance) return () => {};
    try {
      return onSnapshot(
        collection(dbInstance, "questions"),
        snapshot => {
          const items: any[] = [];
          snapshot.forEach(docSnap => {
            items.push({ ...docSnap.data(), id: docSnap.id });
          });
          callback(items);
        },
        error => {
          handleFirestoreError(error, OperationType.LIST, "questions");
        }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, "questions");
      return () => {};
    }
  },

  // --- TEMPLATES (Showcase Templates) ---
  async addTemplate(data: any) {
    if (!dbInstance) return;
    const docId = data.id || 'tmpl_' + Date.now().toString(36);
    try {
      await setDoc(doc(dbInstance, "templates", docId), data, { merge: true });
      console.log("Synced template to Firestore:", docId);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `templates/${docId}`);
    }
  },

  async updateTemplate(id: string, data: any) {
    if (!dbInstance) return;
    try {
      const payload = {
        ...data,
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(dbInstance, "templates", id), payload, { merge: true });
      console.log("Updated template in Firestore:", id);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `templates/${id}`);
    }
  },

  async deleteTemplate(id: string) {
    if (!dbInstance) return;
    try {
      await deleteDoc(doc(dbInstance, "templates", id));
      console.log("Deleted template from Firestore:", id);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `templates/${id}`);
    }
  },

  async purgePlaceholderTemplates() {
    if (!dbInstance) return;
    const placeholderIds = [
      'tmpl_apex', 'tmpl_veloce', 'tmpl_kroma', 'tmpl_pulse',
      'tmpl_mv25wztql13w', 'tmpl_mv3fi9smdqow', 'tmpl_mv3gil1zm371'
    ];
    for (const id of placeholderIds) {
      try {
        await deleteDoc(doc(dbInstance, "templates", id));
      } catch (_) {}
    }
  },

  listenTemplates(callback: (items: any[]) => void) {
    if (!dbInstance) return () => {};
    const placeholderIds = new Set([
      'tmpl_apex', 'tmpl_veloce', 'tmpl_kroma', 'tmpl_pulse',
      'tmpl_mv25wztql13w', 'tmpl_mv3fi9smdqow', 'tmpl_mv3gil1zm371'
    ]);
    // Proactively clean legacy placeholder templates from the database
    this.purgePlaceholderTemplates().catch(() => {});
    try {
      return onSnapshot(
        collection(dbInstance, "templates"),
        snapshot => {
          const items: any[] = [];
          snapshot.forEach(docSnap => {
            const id = docSnap.id;
            if (placeholderIds.has(id)) {
              deleteDoc(doc(dbInstance, "templates", id)).catch(() => {});
              return;
            }
            items.push({ ...docSnap.data(), id: docSnap.id });
          });
          callback(items);
        },
        error => {
          handleFirestoreError(error, OperationType.LIST, "templates");
        }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, "templates");
      return () => {};
    }
  },

  // --- FAQS (FAQ Articles & Knowledge Items) ---
  async addFaq(data: any) {
    if (!dbInstance) return;
    const docId = data.id || 'faq_item_' + Date.now().toString(36);
    try {
      await setDoc(doc(dbInstance, "faqs", docId), data, { merge: true });
      console.log("Synced FAQ item to Firestore:", docId);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `faqs/${docId}`);
    }
  },

  async deleteFaq(id: string) {
    if (!dbInstance) return;
    try {
      await deleteDoc(doc(dbInstance, "faqs", id));
      console.log("Deleted FAQ item from Firestore:", id);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `faqs/${id}`);
    }
  },

  listenFaqs(callback: (items: any[]) => void) {
    if (!dbInstance) return () => {};
    try {
      return onSnapshot(
        collection(dbInstance, "faqs"),
        snapshot => {
          const items: any[] = [];
          snapshot.forEach(docSnap => {
            items.push({ ...docSnap.data(), id: docSnap.id });
          });
          callback(items);
        },
        error => {
          handleFirestoreError(error, OperationType.LIST, "faqs");
        }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, "faqs");
      return () => {};
    }
  }
};

// Expose to window for the vanilla HTML application
if (typeof window !== "undefined") {
  (FirebaseSync as any).firebaseConfig = firebaseConfig;
  (window as any).FirebaseSync = FirebaseSync;
  (window as any).firebaseConfig = firebaseConfig;
  window.dispatchEvent(new CustomEvent("firebase:ready", { detail: FirebaseSync }));
}

export default FirebaseSync;
