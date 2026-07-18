import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithRedirect,
  getRedirectResult,
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

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  role: PortalRole;
  portalStudent: StudentRecord | null;
  portalParent: ParentProfile | null;
  loading: boolean;
  /** Teacher login: sends the browser to Google, full-page. */
  signInTeacherWithGoogle: () => Promise<void>;
  /** Call on mount of the teacher login page to pick up the result after Google redirects back. Returns true if a fresh sign-in was completed. */
  completeTeacherSignIn: () => Promise<boolean>;
  /** Join/portal-login: sends the browser to Google, full-page — does NOT create a teacher profile. */
  beginGoogleSignIn: () => Promise<void>;
  /** Call on mount of the join/portal-login page to pick up the result after Google redirects back. Returns the signed-in user, or null if this load isn't a redirect return. */
  completeGoogleSignIn: () => Promise<User | null>;
  updateTeacherPhoto: (photoURL: string) => Promise<void>;
  refreshPortalRole: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const googleProvider = new GoogleAuthProvider();

/**
 * Everywhere in this app that signs a person in with Google uses the
 * *redirect* flow (signInWithRedirect + getRedirectResult), never
 * signInWithPopup. Google's own sign-in page sets a strict
 * Cross-Origin-Opener-Policy header that breaks Firebase's popup flow in
 * ways that don't produce a recognizable error — it's not reliably
 * catchable, so the fix is to not use popups at all. Redirect is a plain
 * full-page navigation and doesn't depend on window.closed monitoring, so
 * it isn't affected by COOP.
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
    await signInWithRedirect(auth, googleProvider);
  }

  async function completeTeacherSignIn(): Promise<boolean> {
    const result = await getRedirectResult(auth);
    if (!result?.user) return false;
    await ensureTeacherAccount(result.user);
    return true;
  }

  /** Google sign-in used by the /join and /portal-login pages. Deliberately does not touch `teachers/` — the calling page decides what profile (student/parent) to create or look up. */
  async function beginGoogleSignIn() {
    await signInWithRedirect(auth, googleProvider);
  }

  async function completeGoogleSignIn(): Promise<User | null> {
    const result = await getRedirectResult(auth);
    return result?.user || null;
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
        completeTeacherSignIn,
        beginGoogleSignIn,
        completeGoogleSignIn,
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
