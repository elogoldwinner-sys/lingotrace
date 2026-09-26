import {
  createContext,
  useContext,
  useEffect,
  useRef,
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
import { collection, doc, getDoc, getDocs, query, setDoc, serverTimestamp, where } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import type { ParentProfile, StudentRecord, TeacherGender, UserProfile } from "../types";
import { findStudentByAuthUid, setTeacherWhatsappForClasses } from "../lib/services/studentsService";
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
  updateTeacherWhatsapp: (whatsappNumber: string) => Promise<void>;
  updateTeacherRankingPeriod: (start: number, end: number) => Promise<void>;
  updateTeacherGender: (gender: TeacherGender) => Promise<void>;
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

  /**
   * `onAuthStateChanged` fires its own `resolveRole` the instant Firebase
   * notices a sign-in, which can run concurrently with the explicit
   * `signInTeacherWithGoogle` -> `ensureTeacherAccount` flow that creates the
   * `teachers/{uid}` doc on first login. Without ordering, whichever call's
   * network round-trip finishes last wins — and if that's a `resolveRole`
   * call whose read started before the doc was created, it stomps the good
   * profile/role state with nulls (the teacher's own avatar/photo then
   * silently stops working for the rest of the session). This token makes
   * only the most recently *started* resolveRole call allowed to write
   * state, so a stale, slower read can never overwrite a fresher one.
   */
  const resolveTokenRef = useRef(0);

  /**
   * Resolves every portal identity a signed-in Google account holds.
   *
   * A single account (uid) can simultaneously have a `teachers/{uid}`
   * profile AND a parent profile AND/OR a student record — e.g. a teacher
   * who also joined a class as a parent with the same Google account. All
   * three are looked up in parallel and kept independently in state rather
   * than short-circuiting on the first match, so nothing here decides "the"
   * role for the account — each portal simply checks whether its own
   * identity (profile / portalParent / portalStudent) exists, and a person
   * with more than one can switch between portals instead of being locked
   * into whichever happened to resolve first.
   *
   * `role` is kept only as a legacy convenience label (teacher > parent >
   * student) for any older code that reads it — it is no longer used to
   * gate access anywhere in the app.
   */
  async function resolveRole(firebaseUser: User) {
    const token = ++resolveTokenRef.current;
    const [teacherSnap, parentProfile, student] = await Promise.all([
      getDoc(doc(db, "teachers", firebaseUser.uid)),
      getParentProfile(firebaseUser.uid),
      findStudentByAuthUid(firebaseUser.uid),
    ]);
    if (token !== resolveTokenRef.current) return;

    const teacherProfile = teacherSnap.exists() ? (teacherSnap.data() as UserProfile) : null;
    setProfile(teacherProfile);
    setPortalParent(parentProfile);
    setPortalStudent(student);
    setRole(teacherProfile ? "teacher" : parentProfile ? "parent" : student ? "student" : null);
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
   * Creates the `teachers/{uid}` profile on first teacher sign-in. Deliberately
   * does NOT check for (or block on) an existing parent/student profile on
   * this uid — an account can hold a teacher profile alongside a parent or
   * student one at the same time; see resolveRole above.
   */
  async function ensureTeacherAccount(firebaseUser: User) {
    const profileRef = doc(db, "teachers", firebaseUser.uid);
    const snapshot = await getDoc(profileRef);

    if (!snapshot.exists()) {
      const newProfile: Omit<UserProfile, "createdAt"> = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || "",
        displayName: firebaseUser.displayName || "Teacher",
        role: "teacher",
        photoURL: firebaseUser.photoURL || undefined,
      };
      await setDoc(
        profileRef,
        { ...newProfile, createdAt: serverTimestamp() },
        { merge: true }
      );
    }
    // Re-resolve from a fresh read now that the doc is guaranteed to exist,
    // instead of setting local state directly here — this is the same
    // token-guarded path `onAuthStateChanged` uses, so whichever call ran
    // last always wins instead of racing it (see resolveRole above).
    await resolveRole(firebaseUser);
  }

  /**
   * Sends the browser to Google for the teacher login page. There is no
   * separate sign-up flow — the first time a Google account signs in, a
   * matching `teachers/{uid}` Firestore profile is created automatically
   * (using the name/photo Google provides); on every later sign-in the
   * existing profile is just loaded. An account that already has a parent
   * or student portal profile can freely become a teacher too — see
   * ensureTeacherAccount/resolveRole above.
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

  /**
   * Lets a teacher replace their Google-provided photo with their own
   * upload. Uses `setDoc(..., { merge: true })` rather than `updateDoc` so
   * this can never silently fail with "no document to update" if the
   * `teachers/{uid}` profile doc happens to be missing/incomplete — it
   * self-heals instead. Also always writes new local state (with a
   * reconstructed fallback profile when `profile` is currently null)
   * instead of the previous no-op-when-null guard, which was why the
   * photo appeared to change nothing when `profile` was null.
   */
  async function updateTeacherPhoto(photoURL: string) {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    await setDoc(doc(db, "teachers", currentUser.uid), { photoURL }, { merge: true });
    setProfile((prev) =>
      prev
        ? { ...prev, photoURL }
        : {
            uid: currentUser.uid,
            email: currentUser.email || "",
            displayName: currentUser.displayName || "Teacher",
            role: "teacher",
            photoURL,
            createdAt: Date.now(),
          }
    );
  }

  /**
   * Lets a teacher set/update their WhatsApp contact number. Saved on their
   * own profile (the source of truth), and also denormalized onto every
   * student they teach (`teacherWhatsapp`) so the parent portal can read it
   * under the student-read permissions parents already have, without a new
   * Firestore rule granting parents any access to the teacher's own profile.
   */
  async function updateTeacherWhatsapp(whatsappNumber: string) {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    await setDoc(doc(db, "teachers", currentUser.uid), { whatsappNumber }, { merge: true });
    setProfile((prev) =>
      prev
        ? { ...prev, whatsappNumber }
        : {
            uid: currentUser.uid,
            email: currentUser.email || "",
            displayName: currentUser.displayName || "Teacher",
            role: "teacher",
            whatsappNumber,
            createdAt: Date.now(),
          }
    );
    const classesSnap = await getDocs(query(collection(db, "classes"), where("teacherId", "==", currentUser.uid)));
    const classIds = classesSnap.docs.map((d) => d.id);
    await setTeacherWhatsappForClasses(classIds, whatsappNumber);
  }

  /**
   * Lets a teacher choose the exact start/end date range the class-
   * champions board is computed over (default is "the last 7 days" — see
   * getDefaultRankingPeriod). Purely a teacher-side setting: only the
   * teacher's own client ever reads it (to know which period to compute),
   * so no denormalization onto students/parents is needed the way
   * whatsappNumber requires.
   */
  async function updateTeacherRankingPeriod(start: number, end: number) {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    await setDoc(
      doc(db, "teachers", currentUser.uid),
      { rankingPeriodStart: start, rankingPeriodEnd: end },
      { merge: true }
    );
    setProfile((prev) =>
      prev
        ? { ...prev, rankingPeriodStart: start, rankingPeriodEnd: end }
        : {
            uid: currentUser.uid,
            email: currentUser.email || "",
            displayName: currentUser.displayName || "Teacher",
            role: "teacher",
            rankingPeriodStart: start,
            rankingPeriodEnd: end,
            createdAt: Date.now(),
          }
    );
  }

  /**
   * Saves which teacher illustration (male / female) the kid-mode dashboard
   * shows. Teacher-side only, so it just lives on the teacher's own profile.
   */
  async function updateTeacherGender(gender: TeacherGender) {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const previous = profile?.gender;
    // Optimistic: the dashboard picture should flip the instant the toggle is pressed.
    setProfile((prev) =>
      prev
        ? { ...prev, gender }
        : {
            uid: currentUser.uid,
            email: currentUser.email || "",
            displayName: currentUser.displayName || "Teacher",
            role: "teacher",
            gender,
            createdAt: Date.now(),
          }
    );
    try {
      await setDoc(doc(db, "teachers", currentUser.uid), { gender }, { merge: true });
    } catch (err) {
      setProfile((prev) => (prev ? { ...prev, gender: previous } : prev));
      throw err;
    }
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
        updateTeacherWhatsapp,
        updateTeacherRankingPeriod,
        updateTeacherGender,
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
