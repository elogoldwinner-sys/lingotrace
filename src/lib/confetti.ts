import confetti from "canvas-confetti";

/**
 * Plays a short celebration: a burst of confetti "sprinkles" falling from
 * the top of the screen, followed by a couple of firework-style bursts.
 * Fire-and-forget — used for the weekly class-champions reveal.
 */
export function triggerWeeklyChampionsCelebration() {
  const duration = 2600;
  const end = Date.now() + duration;

  const colors = ["#C9A227", "#B0B7C6", "#B08D57", "#1F2A44"]; // gold / silver / bronze / navy

  // Sprinkles falling from the top edge, drifting left and right.
  (function fallFromTop() {
    confetti({
      particleCount: 3,
      startVelocity: 0,
      ticks: 220,
      origin: { x: Math.random(), y: -0.05 },
      colors,
      shapes: ["square", "circle"],
      gravity: 0.55,
      scalar: 0.9,
      drift: Math.random() < 0.5 ? -0.4 : 0.4,
    });
    if (Date.now() < end) {
      requestAnimationFrame(fallFromTop);
    }
  })();

  // A couple of firework-style bursts from random spots.
  const fireworkTimes = [200, 900, 1600];
  fireworkTimes.forEach((delay) => {
    setTimeout(() => {
      confetti({
        particleCount: 90,
        spread: 100,
        startVelocity: 45,
        origin: { x: 0.2 + Math.random() * 0.6, y: 0.3 + Math.random() * 0.2 },
        colors,
      });
    }, delay);
  });
}

const CELEBRATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const celebrationKey = (uid: string) => `lingotrace:champions-confetti:${uid}`;

/**
 * Teacher login confetti is limited to once per 24 hours per device: it plays on the first login/dashboard visit, then
 * stays quiet for a whole day. The timestamp is only stored when the celebration actually plays.
 */
export function canCelebrateToday(uid: string | undefined): boolean {
  if (!uid) return true;
  try {
    const last = Number(localStorage.getItem(celebrationKey(uid)));
    return !last || Date.now() - last >= CELEBRATION_COOLDOWN_MS;
  } catch {
    return true;
  }
}

export function markCelebrated(uid: string | undefined) {
  if (!uid) return;
  try {
    localStorage.setItem(celebrationKey(uid), String(Date.now()));
  } catch {
    /* storage unavailable — the in-memory guard still prevents repeats within this visit */
  }
}
