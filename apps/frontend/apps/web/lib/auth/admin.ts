const adminIds = new Set(
  (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

export function isAdminUser(userId: string | null | undefined) {
  if (!userId) {
    return false;
  }

  return adminIds.has(userId);
}

export function getAdminUserIds() {
  return Array.from(adminIds);
}
