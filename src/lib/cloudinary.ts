const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
}

/**
 * Uploads a file to Cloudinary using the app's unsigned upload preset.
 * Used for student/teacher profile photos (`resourceType: "image"`, the
 * default) and announcement images/videos (`resourceType: "video"` for
 * video files — Cloudinary requires the matching endpoint per resource
 * type, an image-upload request rejects video files).
 */
export async function uploadToCloudinary(
  file: File,
  folder: string = "lingotrace",
  resourceType: "image" | "video" = "image"
): Promise<CloudinaryUploadResult> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary is not configured. Check VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in your .env file."
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", folder);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(
      errorBody?.error?.message || "Cloudinary upload failed. Please try again."
    );
  }

  const data = await response.json();
  return { secure_url: data.secure_url, public_id: data.public_id };
}
