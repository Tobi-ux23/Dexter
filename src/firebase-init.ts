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
  browserSessionPersistence,
  onAuthStateChanged,
  User
} from "firebase/auth";

// User-provided Firebase Configuration
export const firebaseConfig = {
  apiKey: "AIzaSyAldTkWbpPDl9OWDeNraYKlu1A9w_WX0ps",
  authDomain: "dexter-908fe.firebaseapp.com",
  projectId: "dexter-908fe",
  storageBucket: "dexter-908fe.firebasestorage.app",
  messagingSenderId: "770214303009",
  appId: "1:770214303009:web:d2a1786c2eee5ec23a9a60",
  measurementId: "G-GG3H3N55N8"
};

// Initialize Firebase App & Services
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account"
});

// Designated Sole Administrator Account
export const DESIGNATED_ADMIN_EMAIL = "bungorajesh23@gmail.com";

// Safe Analytics Initialization
export let analytics: any = null;
if (typeof window !== "undefined") {
  isAnalyticsSupported().then(supported => {
    if (supported) {
      analytics = getAnalytics(app);
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
  const currentUser = auth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid || null,
      email: currentUser?.email || null,
      emailVerified: currentUser?.emailVerified || null,
      isAnonymous: currentUser?.isAnonymous || null,
      tenantId: currentUser?.tenantId || null,
      providerInfo: currentUser?.providerData?.map(p => ({
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
  projectId: firebaseConfig.projectId,
  db,
  app,
  auth,
  designatedAdminEmail: DESIGNATED_ADMIN_EMAIL,

  // --- AUTHENTICATION (Google Sign-In with Restricted Admin Whitelist) ---
  isAuthorizedAdmin(user: User | null): boolean {
    if (!user || !user.email) return false;
    return user.email.toLowerCase() === DESIGNATED_ADMIN_EMAIL.toLowerCase();
  },

  async signInAdminWithGoogle(): Promise<{ user: User; email: string; displayName: string | null; photoURL: string | null }> {
    try {
      await setPersistence(auth, browserSessionPersistence);
    } catch (pErr) {
      console.warn("Session persistence notice:", pErr);
    }

    const credential = await signInWithPopup(auth, googleProvider);
    const user = credential.user;

    if (!this.isAuthorizedAdmin(user)) {
      await signOut(auth);
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
    await signOut(auth);
  },

  onAdminAuthStateChanged(callback: (user: User | null, isAuthorized: boolean) => void) {
    return onAuthStateChanged(auth, user => {
      const isAuth = this.isAuthorizedAdmin(user);
      callback(user, isAuth);
    });
  },

  getCurrentAdminUser(): User | null {
    const user = auth.currentUser;
    return this.isAuthorizedAdmin(user) ? user : null;
  },

  // --- BLUEPRINTS (Project Intake Briefs) ---
  async addBlueprint(data: any) {
    const docId = data.id || 'bp_' + Date.now().toString(36);
    try {
      await setDoc(doc(db, "blueprints", docId), data, { merge: true });
      console.log("Synced blueprint to Firestore:", docId);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `blueprints/${docId}`);
    }
  },

  async updateBlueprintStatus(id: string, newStatus: string) {
    try {
      await updateDoc(doc(db, "blueprints", id), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      console.log("Updated blueprint status in Firestore:", id, newStatus);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `blueprints/${id}`);
    }
  },

  async updateBlueprintNotes(id: string, notes: string) {
    try {
      await updateDoc(doc(db, "blueprints", id), {
        internal_notes: notes,
        updatedAt: new Date().toISOString()
      });
      console.log("Updated blueprint notes in Firestore:", id);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `blueprints/${id}`);
    }
  },

  async deleteBlueprint(id: string) {
    try {
      await deleteDoc(doc(db, "blueprints", id));
      console.log("Deleted blueprint from Firestore:", id);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `blueprints/${id}`);
    }
  },

  listenBlueprints(callback: (items: any[]) => void) {
    try {
      return onSnapshot(
        collection(db, "blueprints"),
        snapshot => {
          const items: any[] = [];
          snapshot.forEach(docSnap => {
            items.push({ ...docSnap.data(), id: docSnap.id });
          });
          callback(items);
        },
        error => {
          handleFirestoreError(error, OperationType.LIST, "blueprints");
        }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, "blueprints");
    }
  },

  // --- QUESTIONS (Visitor Inquiries) ---
  async addQuestion(data: any) {
    const docId = data.id || 'faq_' + Date.now().toString(36);
    try {
      await setDoc(doc(db, "questions", docId), data, { merge: true });
      console.log("Synced question to Firestore:", docId);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `questions/${docId}`);
    }
  },

  async updateQuestionStatus(id: string, status: string) {
    try {
      const payload: any = { status };
      if (status === 'Replied') payload.repliedAt = new Date().toISOString();
      await updateDoc(doc(db, "questions", id), payload);
      console.log("Updated question status in Firestore:", id, status);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `questions/${id}`);
    }
  },

  async deleteQuestion(id: string) {
    try {
      await deleteDoc(doc(db, "questions", id));
      console.log("Deleted question from Firestore:", id);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `questions/${id}`);
    }
  },

  listenQuestions(callback: (items: any[]) => void) {
    try {
      return onSnapshot(
        collection(db, "questions"),
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
    }
  },

  // --- TEMPLATES (Showcase Templates) ---
  async addTemplate(data: any) {
    const docId = data.id || 'tmpl_' + Date.now().toString(36);
    try {
      await setDoc(doc(db, "templates", docId), data, { merge: true });
      console.log("Synced template to Firestore:", docId);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `templates/${docId}`);
    }
  },

  async deleteTemplate(id: string) {
    try {
      await deleteDoc(doc(db, "templates", id));
      console.log("Deleted template from Firestore:", id);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `templates/${id}`);
    }
  },

  listenTemplates(callback: (items: any[]) => void) {
    try {
      return onSnapshot(
        collection(db, "templates"),
        snapshot => {
          const items: any[] = [];
          snapshot.forEach(docSnap => {
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
    }
  },

  // --- FAQS (FAQ Articles & Knowledge Items) ---
  async addFaq(data: any) {
    const docId = data.id || 'faq_item_' + Date.now().toString(36);
    try {
      await setDoc(doc(db, "faqs", docId), data, { merge: true });
      console.log("Synced FAQ item to Firestore:", docId);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `faqs/${docId}`);
    }
  },

  async deleteFaq(id: string) {
    try {
      await deleteDoc(doc(db, "faqs", id));
      console.log("Deleted FAQ item from Firestore:", id);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `faqs/${id}`);
    }
  },

  listenFaqs(callback: (items: any[]) => void) {
    try {
      return onSnapshot(
        collection(db, "faqs"),
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
    }
  }
};

// Expose to window for the vanilla HTML application
if (typeof window !== "undefined") {
  (window as any).FirebaseSync = FirebaseSync;
  window.dispatchEvent(new CustomEvent("firebase:ready", { detail: FirebaseSync }));
}

export default FirebaseSync;
