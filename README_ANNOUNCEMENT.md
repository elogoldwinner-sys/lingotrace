# LingoTrace — Announcement feature

New: a single school-wide announcement (text + optional image + optional
video, all in one post) that any signed-in user — teacher, student, or
parent — sees, and only a teacher can post/edit/remove.

## Files in this zip

**New files** — add these:
- `src/lib/services/announcementsService.ts`
- `src/components/common/AnnouncementCard.tsx`

**Changed files** — overwrite the existing ones at these paths:
- `src/types/index.ts` (added the `Announcement` type)
- `src/lib/cloudinary.ts` (added video-upload support, alongside the existing image upload — nothing about the existing photo-upload features changes)
- `src/pages/DashboardPage.tsx` (teacher's announcement composer/editor, at the top of the Dashboard)
- `src/pages/portal/StudentPortalPage.tsx` (shows the announcement, if any)
- `src/pages/portal/ParentPortalPage.tsx` (shows the announcement, if any — once, above the child tabs, since it's the same for every child)
- `src/i18n/en.json`, `src/i18n/ar.json` (new `announcement.*` strings)
- `firestore.rules` (new rule — see below)

## ⚠️ Firestore rules — publish this in the Firebase console

As before, this doesn't go out with your GitHub Pages deploy. Open
Firebase console → Firestore Database → Rules, paste the full contents of
this zip's `firestore.rules`, and click **Publish**.

The new rule added:
```
match /announcements/{docId} {
  allow read: if isSignedIn();
  allow write: if isSignedIn() &&
    exists(/databases/$(database)/documents/teachers/$(request.auth.uid));
}
```
Anyone signed in can read it; only a signed-in teacher account can write it.

## How it works

- On your **Dashboard**, there's a "Post an announcement" button at the top
  (or, once you've posted one, the current announcement with an "Edit"
  link underneath). Click it to write a message, and optionally attach one
  image and/or one video (uploaded through your existing Cloudinary setup —
  same account as your profile photos).
- It's a single post — posting a new one replaces the last one. There's a
  "Remove announcement" option in the editor if you want to clear it.
- It shows up automatically at the top of the **student portal** and the
  **parent portal** (and on your own Dashboard) for anyone signed in — no
  extra setup needed per class or per student.

## Build check
`tsc -b && vite build` and `oxlint src` both ran clean with zero errors
before this was packaged.
