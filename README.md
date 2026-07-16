# LingoTrace

A teacher-facing SaaS for tracking classes, students, attendance, sessions, notes, points, and badges — built with React, TypeScript, Vite, Firebase (Auth + Firestore), Tailwind CSS, Cloudinary, and EmailJS.

Styled to match **LingoBite**'s theme: navy (`#0d1b2a`), gold (`#c9993f`), cream (`#faf6ef`), Playfair Display for headings, Inter for body text.

## What's included (Phase 1)

- Google sign-in only, no separate sign-up flow (first Google sign-in auto-creates a `teachers/{uid}` Firestore profile)
- Dashboard with live stats
- Classes: create / list / delete
- Students: create / list / delete, profile photo upload via Cloudinary
- Attendance: per-class, per-day roster with present/absent/late/excused
- Sessions: lesson log per class (topic, objectives)
- Notes: per-student notes with a parent-visibility toggle
- Points engine: transactional point awards, running total updates instantly
- Badge engine: automatic point-threshold badges, awarded via Firestore arrayUnion, with a re-evaluation function for backfilling
- In-app notifications (Firestore-backed, badge/points/note/attendance/system types)
- Parent progress-report email via EmailJS (uses the exact template from LingoTrace.docx)
- Full English/Arabic i18n with RTL support (toggle in the top bar)
- Mobile-first responsive layout

## Not yet built (Phase 2 — flagged as "future" in your own spec too)

- Assignment/project system (open/close dates, link types, grading, late penalties, file uploads)
- Statistics/leaderboard views, PDF/Excel/CSV export
- Academic calendar, resource library, learning objectives library
- Parent portal, student portal, AI assistant, QR attendance, calendar integrations

## Setup

1. npm install
2. Fill in .env — the Firebase projectId (lingotrace-f4c54), Cloudinary cloud name/upload preset, and EmailJS service/template IDs are already filled in from your docs. You still need to add:
   - VITE_FIREBASE_API_KEY
   - VITE_FIREBASE_MESSAGING_SENDER_ID
   - VITE_FIREBASE_APP_ID
   - VITE_EMAILJS_PUBLIC_KEY

   All of these are in your Firebase console (Project settings -> General -> Your apps) and EmailJS dashboard (Account -> General).
3. In the Firebase console, under Authentication -> Sign-in method, enable Google as a sign-in provider (Email/Password is not used). Also create a Firestore database in production mode.
4. Set Firestore security rules so teachers can only read/write their own classes/students/etc. (not included here — ask if you want a starter ruleset).
5. npm run dev

## Project structure

```
src/
  components/
    layout/       Sidebar, Topbar, AppLayout
    auth/         ProtectedRoute
    common/       Modal, Spinner, EmptyState
  contexts/       AuthContext
  lib/
    firebase.ts
    cloudinary.ts
    emailjs.ts
    firestoreService.ts   <- generic CRUD/subscription factory
    services/              <- one file per collection (classes, students, attendance, sessions, notes, points, badges, notifications)
  pages/          One page per route
  i18n/           en.json, ar.json, index.ts
  types/          Shared TypeScript interfaces
```

## Deploying to GitHub Pages

A workflow at .github/workflows/deploy.yml builds and deploys automatically on every push to main. To activate it:

1. Push this project to your elogoldwinner-sys/lingotrace repo (the workflow file must be in .github/workflows/ for the Actions tab to pick it up — that's why nothing showed up before).
2. In the repo: Settings -> Pages -> Build and deployment -> Source -> select "GitHub Actions".
3. In the repo: Settings -> Secrets and variables -> Actions -> New repository secret, and add each of the VITE_* values from your .env (Firebase, Cloudinary, EmailJS). The workflow reads them from secrets rather than a committed .env, since .env is gitignored and shouldn't be pushed.
4. Push to main (or run the workflow manually from the Actions tab) — it will appear as a run named "Deploy to GitHub Pages".
5. Your site will be live at https://elogoldwinner-sys.github.io/lingotrace/.

vite.config.ts is already set with base: '/lingotrace/' to match this repo name, and the router/index.html include the standard GitHub Pages SPA redirect trick so deep links (e.g. /students) don't 404 on a hard refresh.

## Verifying

```
node node_modules/typescript/bin/tsc -b   # typecheck
npm run build                              # production build
```

Both pass cleanly as of this delivery.
