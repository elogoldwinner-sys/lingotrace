# School portal — principal, department head, counselor

## Deploy order
1. Copy the files in this package over your project (same folders).
2. `firebase deploy --only firestore:rules` — **required**, the portal and the approvals depend on the new rules.
3. (Optional) In EmailJS create a template for feedback with these variables:
   `to_email, to_name, from_name, from_title, school_name, about, message`
   and set `VITE_EMAILJS_FEEDBACK_TEMPLATE_ID`. Without it, feedback reuses the parent-report template.
4. No new Firestore indexes are needed.

## How it works
- `/school-login` → Google sign-in. A principal with no school sees "create my school" (`/school/setup`).
- School id = the principal's uid (one school per principal). Staff are matched by their Gmail (`staffAccess/{gmail}`).
- Teachers: on next login they pick school + subject + grade/section of each existing class → request is **pending** until the principal approves (only the principal can change the status — enforced by the rules).
- Classes get `schoolId, grade, section, classKey ("5-A"), subject`. Everything staff see is read through these fields.
- Scopes enforced by the security rules (not only the UI): principal = whole school; department head = classes of their subject; counselor = assigned grades/classes; supervisor/coordinator = head's subject ∩ assigned grades/classes.
- "Compare across subjects" in the teacher portal is switched by `schools/{id}.allowSubjectCompare` (Settings → toggle); the rule also blocks the read when it is off.

## Things to test after deploying (rules could not be run against the emulator here)
1. Principal creates school → adds a department head and a counselor.
2. A teacher requests to join → principal approves → classes appear in the principal's overview.
3. Department head sees only their subject; counselor only assigned classes; try opening a report of another subject (should fail to load).
4. Toggle "compare across subjects" off → teacher's Class statistics loses the tab.
