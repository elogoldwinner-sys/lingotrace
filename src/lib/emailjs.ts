import emailjs from "@emailjs/browser";

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

export interface ParentReportParams {
  to_email: string;
  parent_name: string;
  student_name: string;
  class_name: string;
  points: number;
  attendance_summary: string;
  notes: string;
  badges: string;
  message: string;
}

/**
 * Sends a parent progress-report email using the LingoBite Tracker EmailJS template.
 * Template variables match exactly what's defined in the template HTML:
 * to_email, parent_name, student_name, class_name, points, attendance_summary,
 * notes, badges, message.
 */
export async function sendParentReport(params: ParentReportParams) {
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    throw new Error(
      "EmailJS is not configured. Check your VITE_EMAILJS_* environment variables."
    );
  }

  return emailjs.send(
    SERVICE_ID,
    TEMPLATE_ID,
    { ...params },
    { publicKey: PUBLIC_KEY }
  );
}
