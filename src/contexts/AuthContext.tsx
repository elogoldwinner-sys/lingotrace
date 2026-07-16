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
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
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
  signInWithGoogle: () => Promise<void>;
  /** Google sign-in for the /join flow — does NOT create a teacher profile. */
  signInWithGooglePopupOnly: () => Promise<User>;
  registerWithEmail: (email: string, password: string) => Promise<User>;
  signInWithEmailPassword: (email: string, password: string) => Promise<User>;
  refreshPortalRole: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const googleProvider = new GoogleAuthProvider();

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

  /**
   * Signs the teacher in with Google. There is no separate sign-up flow —
   * the first time a Google account signs in, a matching `teachers/{uid}`
   * Firestore profile is created automatically (using the name/photo Google
   * provides); on every later sign-in the existing profile is just loaded.
   */
  async function signInWithGoogle() {
    const credential = await signInWithPopup(auth, googleProvider);
    const firebaseUser = credential.user;
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

  /** Google sign-in used by the /join page. Deliberately does not touch `teachers/` — the join page decides what profile (student/parent) to create. */
  async function signInWithGooglePopupOnly() {
    const credential = await signInWithPopup(auth, googleProvider);
    return credential.user;
  }

  async function registerWithEmail(email: string, password: string) {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    return credential.user;
  }

  async function signInWithEmailPassword(email: string, password: string) {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return credential.user;
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
        signInWithGoogle,
        signInWithGooglePopupOnly,
        registerWithEmail,
        signInWithEmailPassword,
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
