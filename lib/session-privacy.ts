const ownerKey = "sanispa-local-owner";
const anonymousOwner = "anonymous";
const privateKeys = ["sanispa-diagnostic-draft", "sanispa-water-session-token"];

/** Keep an anonymous draft through signup, but never hand an account's draft to another user. */
export function reconcileLocalOwner(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, userId: string | null, previousUser?: string | null) {
  const previous = previousUser === undefined ? storage.getItem(ownerKey) : previousUser;
  const changed = Boolean(previous && previous !== anonymousOwner && previous !== userId);
  // Discard drafts from older app versions whose owner cannot be established.
  if (changed || (previousUser === undefined && previous === null)) for (const key of privateKeys) storage.removeItem(key);
  if (userId) storage.setItem(ownerKey, userId);
  else storage.setItem(ownerKey, anonymousOwner);
  return changed;
}
