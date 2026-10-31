import emailjs from "@emailjs/browser";
import { whatsappLink } from "../whatsapp";

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
// A dedicated template is recommended (see README_SCHOOL_PORTAL.md); the parent-report template is the fallback.
const FEEDBACK_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_FEEDBACK_TEMPLATE_ID || import.meta.env.VITE_EMAILJS_TEMPLATE_ID;

export interface FeedbackEmail {
  to_email: string;
  to_name: string;
  from_name: string;
  from_title: string;
  school_name: string;
  about: string;
  message: string;
}

export async function sendFeedbackEmail(p: FeedbackEmail) {
  if (!SERVICE_ID || !FEEDBACK_TEMPLATE_ID || !PUBLIC_KEY) {
    throw new Error("EmailJS is not configured. Check your VITE_EMAILJS_* environment variables.");
  }
  // The extra parent-report variable names make the fallback template render sensibly too.
  return emailjs.send(
    SERVICE_ID,
    FEEDBACK_TEMPLATE_ID,
    {
      ...p,
      parent_name: p.to_name,
      student_name: p.about,
      class_name: p.school_name,
      points: "",
      attendance_summary: "",
      notes: p.message,
      badges: "",
    },
    { publicKey: PUBLIC_KEY }
  );
}

/** A wa.me chat link with the message already typed in (WhatsApp cannot be sent automatically from a web page). */
export function whatsappFeedbackLink(number: string, message: string) {
  return `${whatsappLink(number)}?text=${encodeURIComponent(message)}`;
}
