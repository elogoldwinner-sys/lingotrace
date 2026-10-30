import { STUDENT_GROUPS, type StudentGroup, type StudentRecord } from "../types";
import type { CardArt, CardItem } from "./cardExport";
import card1 from "../assets/numbered-cards/card-1.png";
import card2 from "../assets/numbered-cards/card-2.png";
import card3 from "../assets/numbered-cards/card-3.png";
import card4 from "../assets/numbered-cards/card-4.png";

const CARD_IMAGES: Record<number, string> = { 1: card1, 2: card2, 3: card3, 4: card4 };
export const CARD_NUMBERS = [1, 2, 3, 4];

/** The four blank number cards (1–4). */
export const CARD_ARTS: CardArt[] = CARD_NUMBERS.map((n) => ({ number: n, url: CARD_IMAGES[n] }));

/**
 * What is written on a student's card: the Arabic and/or English name the
 * teacher entered (both → two lines, Arabic first), otherwise the student's
 * main name.
 */
export function studentCardLines(student: StudentRecord): string[] {
  const ar = student.nameAr?.trim();
  const en = student.nameEn?.trim();
  if (ar && en) return [ar, en];
  return [ar || en || student.name.trim()];
}

export interface ClassCardsPlan {
  items: CardItem[];
  /** Students who can't get a card: no group yet, or more than 4 in their group. */
  skipped: StudentRecord[];
}

/**
 * One card per student, numbered exactly like the Numbered Heads draw: a
 * student's number is their position (1–4) in their group's name-sorted
 * list, so the card a student holds matches the number that is drawn.
 */
export function planClassCards(students: StudentRecord[]): ClassCardsPlan {
  const items: CardItem[] = [];
  const skipped: StudentRecord[] = students.filter((s) => !s.group);
  const used = new Map<string, number>();

  for (const group of STUDENT_GROUPS as StudentGroup[]) {
    const members = students.filter((s) => s.group === group).sort((a, b) => a.name.localeCompare(b.name));
    members.forEach((student, i) => {
      const art = CARD_ARTS[i];
      if (!art) {
        skipped.push(student);
        return;
      }
      const lines = studentCardLines(student);
      // File names: "A-1 Name.png"; a repeated name gets a counter so nothing is overwritten.
      const base = `${group}-${art.number} ${lines.join(" ")}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
      const count = (used.get(base) || 0) + 1;
      used.set(base, count);
      items.push({ art, lines, filename: `${count > 1 ? `${base} (${count})` : base}.png` });
    });
  }
  return { items, skipped };
}
