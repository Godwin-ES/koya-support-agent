const GUEST_ID_KEY = "relaypay-support-guest-id";

export function guestBrowserId(): string {
  const existing = globalThis.localStorage?.getItem(GUEST_ID_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  globalThis.localStorage?.setItem(GUEST_ID_KEY, created);
  return created;
}

export function conversationIdentity(accessToken: string | null): { access_token: string } | { browser_id: string } {
  return accessToken ? { access_token: accessToken } : { browser_id: guestBrowserId() };
}

export function limitsIdentityHeaders(accessToken: string | null): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : { "X-Guest-Id": guestBrowserId() };
}
