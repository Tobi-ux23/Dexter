# Real Firebase Admin Authentication & Google Sign-In

Transform the Blueprint Desk Executive Terminal from a placeholder email gate into a production-grade, secure authentication system backed by Firebase Authentication with Google Sign-In, strict administrator email authorization, and session-only persistence.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were selected and confirmed in Phase 1:
> - **Authentication Provider**: Firebase Authentication using Google Sign-In via `signInWithPopup` (GoogleAuthProvider).
> - **Authorized Administrator Access**: Pre-configured exclusively for `bungorajesh23@gmail.com`. Non-authorized Google accounts are immediately rejected and signed out with clear security alerts.
> - **Session Persistence**: Strict `browserSessionPersistence` (session-only). Closing the browser tab terminates the session automatically, preventing unauthorized access on shared devices.
> - **Placeholder Removal**: Replaces static `admin@dextertech.com` hints and simulated inputs with real Google authentication, live admin identity display (avatar and real email), and server-verified sign-out.

---

## 1. Overview & Core Concept

- **What It Does**: Upgrades the `#admin23` Blueprint Desk from mock local client checks to real, cryptographically verified Firebase Authentication. The login card presents an official Google Sign-In button matching Dexter Create's high-contrast dark aesthetic. Upon successful sign-in, the system verifies that the authenticated user matches `bungorajesh23@gmail.com`. If authorized, the admin dashboard unlocks; if unauthorized, the session is purged and an access denied notification is shown.
- **Target Persona**: Dexter Create site administrator (`bungorajesh23@gmail.com`) managing project briefs, client blueprints, showcase templates, and FAQs.
- **Key Value**: Guarantees zero unauthorized access to client submissions and agency data, replaces all demo placeholder copy with real credentials, and maintains zero-trust security.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Navigation**: Administrator accesses `/#admin23`.
2. **Terminal Gate Screen**:
   - Clean, dark executive card (`#12141a` background, subtle purple/blue ambient glow).
   - Wordmark and "Executive Terminal · Restricted Access" badge.
   - Authorized admin indicator showing designated executive access.
   - High-contrast **"Sign In with Google"** button featuring the authentic Google symbol and clean typography (`Sign In as Administrator ↗`).
3. **Authentication Execution**:
   - Clicking triggers `signInWithPopup(auth, googleProvider)`.
   - Temporary loading state on the button (`Verifying Credentials...`).
4. **Authorization Gate**:
   - **Authorized (`bungorajesh23@gmail.com`)**: Transitions smoothly to Step 2 Executive Dashboard, displaying the real user profile picture and email tag in the dashboard header.
   - **Unauthorized Account**: Immediate `signOut(auth)` execution, displaying an access denied alert banner explaining that the account is not registered on the agency whitelist.
5. **Sign Out & Session End**:
   - "Sign Out" button in dashboard header calls `signOut(auth)`, purges session cache, and resets back to public site or gate.
   - Closing the browser tab automatically terminates the session due to `browserSessionPersistence`.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Google Popup Authentication vs Redirect Flow**
  - *Chosen Approach*: `signInWithPopup(auth, provider)`
  - *Why*: In iframe sandbox environments (like AI Studio previews), `signInWithRedirect` often fails due to redirect URL whitelist restrictions and third-party cookie blocks. `signInWithPopup` is officially recommended and functions seamlessly.
- **Decision 2: Whitelist Gate in Firebase Client + Rules Sync**
  - *Chosen Approach*: Enforce authorization both in client authentication state (`onAuthStateChanged` whitelisting `bungorajesh23@gmail.com`) and prepare rules synchronization for Firestore.
  - *Why*: Prevents any authenticated Google user outside the designated administrator from viewing sensitive client briefs.

---

## 4. Technical Architecture & Data Strategy

### System Flow Diagram
```
┌────────────────────────────────────────────────────────┐
│             Admin Desk Gate (/#admin23)                │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
              [Sign In with Google Button]
                            │
                            ▼
      signInWithPopup(auth, GoogleAuthProvider)
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
    [Google Auth Success]           [Popup Cancelled / Error]
            │                               │
            ▼                               ▼
  Check email === 'bungorajesh23@gmail.com'  Display error alert
            │
      ┌─────┴────────────────┐
      ▼                      ▼
  [Authorized]          [Unauthorized]
      │                      │
      │                 signOut(auth)
      │                 Display "Access Denied: Account
      │                 not on administrator whitelist"
      ▼
  Set browserSessionPersistence
  Unlock Executive Dashboard
  Display real admin avatar & email
```

### Components to Update
1. **`src/firebase-init.ts`**:
   - Import `getAuth`, `GoogleAuthProvider`, `signInWithPopup`, `signOut`, `setPersistence`, `browserSessionPersistence`, `onAuthStateChanged`.
   - Export configured `auth` and `googleProvider`.
   - Expose authentication methods through `FirebaseSync` bridge.
2. **`index.html` (Admin Auth Gate)**:
   - Remove mock email text input and "Default authorized: admin@dextertech.com" placeholder.
   - Render polished Google Sign-In button with loading indicator.
   - Connect click handler to `handleGoogleAdminSignIn()`.
   - Update header to display real authenticated administrator email and profile avatar.
   - Update `handleAdminLogout()` to call `signOut(auth)`.
3. **Session Listener**:
   - Attach `onAuthStateChanged` to restore active admin sessions across page refreshes during the same browser session.
