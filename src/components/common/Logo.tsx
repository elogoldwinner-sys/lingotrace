/**
 * The LingoBite mascot logo. Replaces the 🍪 emoji that previously stood in
 * for a real brand mark across the login screens, sidebar, and portals.
 * `/logo-192.png` (see public/) is high-enough resolution to stay crisp
 * when scaled down to the small sizes used here, without shipping the full
 * 512px asset on every screen that shows it.
 *
 * The path is prefixed with `import.meta.env.BASE_URL` (set to "/lingotrace/"
 * in vite.config.ts for GitHub Pages) rather than hardcoded as "/logo-192.png".
 * Vite automatically rewrites root-relative paths written directly in
 * index.html to include the base path, but it has no way to do that for a
 * path referenced inside a React component at runtime — so a hardcoded
 * "/logo-192.png" resolved to the domain root instead of "/lingotrace/logo-192.png"
 * and 404'd.
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
      src={`${import.meta.env.BASE_URL}logo-192.png`}
      alt="LingoBite"
      width={size}
      height={size}
      className={`inline-block object-contain ${className}`}
    />
  );
}
