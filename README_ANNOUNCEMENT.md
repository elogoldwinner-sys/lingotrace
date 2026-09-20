# LingoTrace — Announcement targeting, clickable icons, select-all attendance

## What's new

1. **Choose who sees an announcement.** In the announcement editor, pick
   **Everyone** or **Specific classes** (tick one or more of your classes).
   Students and parents only see announcements meant for their class (a
   parent sees the announcements for every class one of their children is
   in) plus anything sent to Everyone.
2. **Clickable icons.** In the editor, under **Clickable icons**, tap
   **Add icon**, upload the icon image, and paste the link it should open
   (optionally a short label shown under it). Up to 8 per announcement. They
   show under the message text and open the link in a new tab. Only
   `http(s)`, `mailto` and `tel` links are accepted.
3. **Select all students in attendance.** When a session is open on the
   Attendance page there's now a **Select all students** checkbox (plus a
   checkbox on each student). With anyone ticked, **Mark selected as:
   Present / Absent / Late / Excused** applies that status to all of them at
   once — points are granted exactly as if you'd tapped each button.

Because each class can now have its own announcement, announcements are no
longer a single replace-the-last post: you can have several live at once,
newest first. Each one shows who it's for on your Dashboard, with its own
**Edit announcement** link, and **Remove announcement** inside the editor
deletes just that one. The announcement you already had keeps showing to
everyone until you edit or remove it.

## Files in this zip (all overwrite existing files at these paths)

- `src/types/index.ts`
- `src/lib/services/announcementsService.ts`
- `src/components/common/AnnouncementCard.tsx`
- `src/pages/DashboardPage.tsx`
- `src/pages/portal/StudentPortalPage.tsx`
- `src/pages/portal/ParentPortalPage.tsx`
- `src/pages/AttendancePage.tsx`
- `src/i18n/en.json`, `src/i18n/ar.json`
- `firestore.rules`
- `README_ANNOUNCEMENT.md`

## ⚠️ Firestore rules — publish this in the Firebase console

Same as before, this doesn't go out with your GitHub Pages deploy. Open
Firebase console → Firestore Database → Rules, paste the full contents of
this zip's `firestore.rules`, and click **Publish**. Until you do, saving an
announcement will fail with a permissions error.

The `/announcements` rule now lets a teacher create announcements as
themselves and edit/delete only their own (the original announcement, which
has no owner, can be edited or removed by any teacher).

**Note on privacy:** targeting decides what each portal *shows*. Firestore
can't filter a list of documents by "is this the reader's class", so any
signed-in user's account could technically read every announcement. Fine for
class notices; don't put anything in an announcement that no signed-in
student or parent should see.

## Build check
`tsc -b`, `vite build`, and `oxlint src` all ran clean with zero errors
before this was packaged.

---

# LingoTrace — Announcement feature (original version)

*(Superseded where it differs from the section above: announcements used to
be a single school-wide post.)*

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

---

# Students of the Week (weekly class champions)

This update builds out the "students of the week" board and moves/adds it
to the places you asked for.

## What changed

- **Ties share a spot.** If two (or more) students in a class have the
  exact same points for the week, they're grouped into the same podium
  spot instead of one of them getting bumped out — e.g. two students tied
  for 2nd both show at 2nd place, and nobody shows at 3rd that week.
  (`src/types/index.ts` — `RankingPosition`, and
  `src/lib/services/classRankingsService.ts` — `groupIntoPositions`.)
- **Teacher dashboard → Students tab.** The board now appears in the class
  header on the **Students** page, right under the class tabs (5A/5B/5C),
  and updates live as you switch classes or award points. It's driven by
  the same reveal-schedule setting you already had ("🏆 Champions
  schedule" in the top bar) — no new setting needed. (It's no longer
  duplicated on the Dashboard overview page; that page still keeps the
  board warm in the background so the "🎉 celebrate" confetti still fires
  there too.)
- **Parent portal → school-wide.** Every signed-in parent now sees a board
  for **every class that currently has one** — not only the classes their
  own child is in — shown once above the child tabs, the same way the
  single school-wide announcement already works. Each class's board is
  labeled with that class's name.
- **Skinned to match the mood.** `WeeklyChampions` now reads the active
  theme (`ThemeContext`) and renders two different designs:
  - **Classic mode:** an elegant medallion podium — soft gold/silver/
    bronze rings, a subtle gold-to-silver shimmer border, serif heading.
  - **Kid mode:** a bright, bouncy winner's-podium — literal stepped
    blocks of different heights, chunky drop shadows, sparkle/confetti
    accents, bold rounded type.
  (`src/components/common/WeeklyChampions.tsx`)

## Files touched

- `src/types/index.ts` — `RankingPosition` type; `ClassRanking` now has
  `positions: RankingPosition[]` and a denormalized `className` instead of
  separate `gold`/`silver`/`bronze` fields.
- `src/lib/services/classRankingsService.ts` — tie-aware grouping,
  denormalizes `className` at compute time, adds
  `subscribeToAllClassRankings` for the school-wide parent view.
- `src/components/common/WeeklyChampions.tsx` — redesigned, theme-aware,
  tie-aware podium.
- `src/pages/StudentsPage.tsx` — computes/subscribes to the selected
  class's board and shows it in the class header.
- `src/pages/DashboardPage.tsx` — no longer renders the board (moved to
  Students), still warms it and fires the confetti celebration.
- `src/pages/portal/ParentPortalPage.tsx` — school-wide board list above
  the child tabs; removed the old per-child single-class board (now
  covered by the school-wide list).
- `src/pages/portal/StudentPortalPage.tsx` — updated for the new data
  shape (still shows only that student's own class).

## Nothing new to publish in Firestore rules

`classRankings/{classId}` was already `allow read: if true`, which also
covers listing the whole collection for the new school-wide parent view —
no rules changes needed for this update.

## Build check
`tsc -b`, `vite build`, and `oxlint src` all ran clean with zero errors
before this was packaged.
