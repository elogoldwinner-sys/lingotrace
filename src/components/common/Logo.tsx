/**
 * The LingoBite mascot logo. Replaces the 🍪 emoji that previously stood in
 * for a real brand mark across the login screens, sidebar, and portals.
 * `/logo-192.png` (see public/) is high-enough resolution to stay crisp
 * when scaled down to the small sizes used here, without shipping the full
 * 512px asset on every screen that shows it.
 */
export default function Logo({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/logo-192.png"
      alt="LingoBite"
      width={size}
      height={size}
      className={`inline-block object-contain ${className}`}
    />
  );
}
