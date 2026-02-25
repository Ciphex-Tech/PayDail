export function isAdminEmail(email: string | null | undefined) {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return false;

  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;

  const allowed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return allowed.includes(e);
}
