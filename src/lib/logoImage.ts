/** Cloudinary: ask for a PNG (keeps transparency) at a sane size — also gives a clean, CORS-safe URL for canvas drawing. */
export function logoFetchUrl(url: string): string {
  return url.includes("/image/upload/") ? url.replace("/image/upload/", "/image/upload/f_png,w_800,c_limit/") : url;
}

/** Loads a school logo for drawing onto a canvas; resolves null (never throws) when there is none or it can't be loaded. */
export function loadLogoImage(url?: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = logoFetchUrl(url);
  });
}
