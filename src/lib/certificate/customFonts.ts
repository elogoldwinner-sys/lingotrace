/**
 * Optional exact-match fonts. Any file dropped into
 * src/assets/certificate/fonts/ named Cakerolli-Bold.* / Cakerolli-Regular.*
 * is bundled by Vite and picked up here. With no files the object is simply empty.
 */
const files = import.meta.glob<string>("../../assets/certificate/fonts/*.{ttf,otf,woff,woff2}", {
  eager: true,
  query: "?url",
  import: "default",
});

function find(pattern: RegExp): string | null {
  for (const [path, url] of Object.entries(files)) {
    if (pattern.test(path)) return url;
  }
  return null;
}

export const customBoldFontUrl = find(/cakerolli[-_ ]?bold/i);
export const customRegularFontUrl = find(/cakerolli[-_ ]?regular/i);
