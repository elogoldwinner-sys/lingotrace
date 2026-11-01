import { useLocation } from "react-router-dom";
import { useSchool, useFeature } from "../contexts/SchoolContext";
import type { SchoolLetterhead } from "../types";

/**
 * The letterhead printed reports go on, or null: it must be uploaded, switched on by the principal and allowed by the
 * platform admin. Staff in the school portal use their school's; teachers use the school they are approved in.
 */
export function useLetterhead(): SchoolLetterhead | null {
  const { school, memberSchool } = useSchool();
  const { pathname } = useLocation();
  const allowed = useFeature("letterhead");
  const source = pathname.startsWith("/school") ? school : memberSchool;
  const lh = source?.letterhead;
  if (!allowed || !lh || !lh.enabled || !lh.imageUrl) return null;
  return lh;
}
