# Admin portal, plan features and support tickets

## Deploy
1. Copy these files over your project (same folders).
2. `firebase deploy --only firestore:rules` — **required.** The admin address in `firestore.rules` (`isAdmin()`) and in `src/lib/admin.ts` is `elo.gold.winner@gmail.com`.
3. Sign in at `/admin-login` with that Google account → `/admin`.
4. **Existing schools start on the basic plan** (every controlled feature off). Open Admin → Schools, tick the schools and press "Paid preset" to give them everything, or switch features one by one.

## What the admin controls (Admin → Schools → a school)
| Switch | Effect when OFF |
|---|---|
| Department heads & counselors | Principal's "Add staff" is faded; existing heads/counselors see "account paused"; rules block creating them and reading class data as them |
| Supervisors & coordinators | Same, for the department head's "Add staff" |
| Comparing classes | Faded in School portal → Compare, teacher's Class statistics tab and "Compare" button |
| Comparing classes across subjects | Faded in the same places; rules block the cross-subject points read |
| Exams & Games | Sidebar item faded, page inert; rules block creating/editing assignments |
| Numbered Heads Together | Button in live session faded; numbered-cards settings faded |
| Edit mark reasons | Preferences reasons card faded; "Add my own" faded; everyone gets the standard reasons |
| Certificates | The "Certificate" button on the Students page is faded (certificates already issued stay visible in the student/parent portals) |

Basic features (everything else) always work. Teachers who are not part of a school are not limited.
The plan label (Free/Paid) is only a label; the switches decide access.

## Limits (Admin → a school → Limits)
Teachers in the school (principal can't approve more), classes per teacher (New class disabled), students per class (Add / bulk import disabled). Blank = "Unlimited". Basic plan defaults: 5 / 6 / 40 (`FREE_LIMITS` in `src/lib/features.ts`); the Paid preset sets all to unlimited.
Limits only stop NEW additions; nothing existing is removed. Firestore rules can't count documents, so limits are enforced in the app, not in the rules. Students who join through a class invite link are not counted against the cap. When a principal hits the teacher cap, a "Request access" link opens a pre-filled ticket.

## Tickets
Principal → School portal → **Support** (new ticket, follow replies, close). Locked features have a "Request access" badge that opens a pre-filled ticket. Admin → **Tickets** (filters, search, reply, change status). Red dots show unread on both sides.

## Enforcement honesty
Rules enforce: creating staff, reading class data as paused staff, cross-subject points, creating exam/game links, tickets, and that only the admin can write plans. UI-only (data is the teacher's own): Numbered Heads, Edit reasons, Comparing classes in a teacher's own Class statistics.
The admin can read schools, teachers/staff lists and tickets — not classes, students or points.

## Not tested here
No emulator or `npm install` was possible in the build sandbox. Please run `npm run build` and test the rules (Rules Playground / emulator) after deploying.
