import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import type { ParentProfile, StudentRecord, UserProfile } from "../types";
import { findStudentByAuthUid } from "../lib/services/studentsService";
import { getParentProfile } from "../lib/services/parentsService";

export type PortalRole = "teacher" | "student" | "parent" | null;

/**
 * True when a Google sign-in popup failed because the person closed it, a
 * second popup request superseded it, or the browser blocked it outright.
 * These aren't real errors — the login pages should reset quietly instead
 * of showing a scary error banner for them.
 */
export function isDismissedPopupError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return (
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request" ||
    code === "auth/popup-blocked"
  );
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  role: PortalRole;
  portalStudent: StudentRecord | null;
  portalParent: ParentProfile | null;
  loading: boolean;
  /** Teacher login via a Google popup. Resolves once the teacher profile is confirmed/created. */
  signInTeacherWithGoogle: () => Promise<void>;
  /** Join/portal-login via a Google popup — does NOT create a teacher profile. Resolves with the signed-in user. */
  beginGoogleSignIn: () => Promise<User>;
  updateTeacherPhoto: (photoURL: string) => Promise<void>;
  refreshPortalRole: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const googleProvider = new GoogleAuthProvider();

/**
 * Everywhere in this app that signs a person in with Google uses
 * signInWithPopup, not signInWithRedirect.
 *
 * signInWithRedirect relies on a cross-origin iframe that talks to the
 * Firebase authDomain (lingotrace-f4c54.firebaseapp.com) to hand the
 * result back to getRedirectResult(). Since June 2024 Chrome (and Firefox/
 * Safari before that) block that cross-origin storage access by default,
 * and this app is hosted on GitHub Pages rather than Firebase Hosting, so
 * there's no way to make authDomain match the app's own origin without
 * extra infra (see https://firebase.google.com/docs/auth/web/redirect-best-practices).
 * In practice this meant getRedirectResult() came back with no result and
 * the user landed back on the login screen without ever signing in.
 *
 * signInWithPopup has its own known quirk: Google's own sign-in page sets a
 * strict Cross-Origin-Opener-Policy header, so Firebase's internal
 * `popup.closed` polling throws "Cross-Origin-Opener-Policy policy would
 * block the window.closed call" in the console. That error is harmless —
 * Firebase falls back to listening for the popup's postMessage instead —
 * so it's safe to ignore rather than treat as a sign that popups are
 * broken. What we *do* need to handle explicitly are the popup's real
 * failure modes: the user closing it, a second click firing before the
 * first popup resolves, or the browser blocking it outright — see the
 * error handling in signInTeacherWithGoogle/beginGoogleSignIn below.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<PortalRole>(null);
  const [portalStudent, setPortalStudent] = useState<StudentRecord | null>(null);
  const [portalParent, setPortalParent] = useState<ParentProfile | null>(null);
  const [loading, setLoading] = useState(true);

  /** Resolves which role a signed-in user has: teacher, student, or parent. */
  async function resolveRole(firebaseUser: User) {
    const teacherSnap = await getDoc(doc(db, "teachers", firebaseUser.uid));
    if (teacherSnap.exists()) {
      setProfile(teacherSnap.data() as UserProfile);
      setRole("teacher");
      setPortalStudent(null);
      setPortalParent(null);
      return;
    }
    setProfile(null);

    const parentProfile = await getParentProfile(firebaseUser.uid);
    if (parentProfile) {
      setRole("parent");
      setPortalParent(parentProfile);
      setPortalStudent(null);
      return;
    }

    const student = await findStudentByAuthUid(firebaseUser.uid);
    if (student) {
      setRole("student");
      setPortalStudent(student);
      setPortalParent(null);
      return;
    }

    setRole(null);
    setPortalStudent(null);
    setPortalParent(null);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await resolveRole(firebaseUser);
      } else {
        setProfile(null);
        setRole(null);
        setPortalStudent(null);
        setPortalParent(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  /** Re-checks the current user's role — used right after a /join signup creates their profile doc. */
  async function refreshPortalRole() {
    if (auth.currentUser) {
      await resolveRole(auth.currentUser);
    }
  }

  async function ensureTeacherAccount(firebaseUser: User) {
    const [existingParent, existingStudent] = await Promise.all([
      getParentProfile(firebaseUser.uid),
      findStudentByAuthUid(firebaseUser.uid),
    ]);
    if (existingParent || existingStudent) {
      await firebaseSignOut(auth);
      throw new Error("account-is-not-a-teacher");
    }

    const profileRef = doc(db, "teachers", firebaseUser.uid);
    const snapshot = await getDoc(profileRef);

    if (!snapshot.exists()) {
      const newProfile: UserProfile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || "",
        displayName: firebaseUser.displayName || "Teacher",
        role: "teacher",
        photoURL: firebaseUser.photoURL || undefined,
        createdAt: Date.now(),
      };
      await setDoc(profileRef, {
        ...newProfile,
        createdAt: serverTimestamp(),
      });
      setProfile(newProfile);
    } else {
      setProfile(snapshot.data() as UserProfile);
    }
    setRole("teacher");
    setPortalStudent(null);
    setPortalParent(null);
  }

  /**
   * Sends the browser to Google for the teacher login page. There is no
   * separate sign-up flow — the first time a Google account signs in, a
   * matching `teachers/{uid}` Firestore profile is created automatically
   * (using the name/photo Google provides); on every later sign-in the
   * existing profile is just loaded.
   *
   * Guarded so an account that's already registered as a student or parent
   * portal account can never also become a teacher just by visiting the
   * teacher login page.
   */
  async function signInTeacherWithGoogle() {
    const result = await signInWithPopup(auth, googleProvider);
    await ensureTeacherAccount(result.user);
  }

  /** Google sign-in used by the /join and /portal-login pages. Deliberately does not touch `teachers/` — the calling page decides what profile (student/parent) to create or look up. */
  async function beginGoogleSignIn(): Promise<User> {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  }

  /** Lets a teacher replace their Google-provided photo with their own upload. */
  async function updateTeacherPhoto(photoURL: string) {
    if (!auth.currentUser) return;
    await updateDoc(doc(db, "teachers", auth.currentUser.uid), { photoURL });
    setProfile((prev) => (prev ? { ...prev, photoURL } : prev));
  }

  async function signOut() {
    await firebaseSignOut(auth);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        portalStudent,
        portalParent,
        loading,
        signInTeacherWithGoogle,
        beginGoogleSignIn,
        updateTeacherPhoto,
        refreshPortalRole,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
