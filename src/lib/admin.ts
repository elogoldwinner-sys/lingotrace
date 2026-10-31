/**
 * The platform administrator. This only decides which screens the client shows — the REAL check is in
 * firestore.rules (`isAdmin()`), which must contain the same address. Change it in both places.
 */
export const ADMIN_EMAIL = "elo.gold.winner@gmail.com";

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase() === ADMIN_EMAIL;
}
