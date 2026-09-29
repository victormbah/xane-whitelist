export const API_BASE_URL = "https://xane-whitelist.onrender.com";

export type OtpPurpose = "phone" | "email";
export type XaneTagType = "free" | "premium";

export interface ApiError {
  error?: string;
  reason?: string;
  suggestions?: string[];
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    // Keep the response error useful even if the server returns no JSON.
  }

  if (!response.ok) {
    const body = (payload || {}) as ApiError;

    throw new Error(
      body.error ||
        body.reason ||
        `Request failed (${response.status})`
    );
  }

  return payload as T;
}

export function normalizePhone(localPhone: string): string {
  let digits = localPhone.replace(/\D/g, "");

  if (digits.startsWith("234")) {
    digits = digits.slice(3);
  }

  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  return `+234${digits}`;
}

/**
 * Removes only the XaneTag prefix/suffix.
 *
 * IMPORTANT:
 * Invalid characters are NOT removed here.
 * This allows the UI to tell the user:
 * "Can't use '.'"
 * instead of silently changing "vic.tor" to "victor".
 */
export function normalizeTag(tag: string): string {
  return tag
    .trim()
    .replace(/^@+/, "")
    .replace(/\.xane$/i, "");
}

export function displayTag(tag: string): string {
  const normalized = normalizeTag(tag).toLowerCase();

  return normalized
    ? `@${normalized}.xane`
    : "";
}

export async function requestOtp(
  identifier: string,
  purpose: OtpPurpose
): Promise<{
  verified?: boolean;
  bypassed?: boolean;
  expiresInSeconds?: number;
  resendAfterSeconds: number;
}> {
  return request("/api/waitlist/otp/request", {
    method: "POST",
    body: JSON.stringify({
      identifier,
      purpose,
    }),
  });
}

export async function verifyOtp(
  identifier: string,
  purpose: OtpPurpose,
  code: string
) {
  return request<{ verified: boolean }>(
    "/api/waitlist/otp/verify",
    {
      method: "POST",
      body: JSON.stringify({
        identifier,
        purpose,
        code,
      }),
    }
  );
}

export async function checkXaneTag(
  tag: string,
  type: "free" | "premium"
) {
  const rawTag = normalizeTag(tag);

  return request<{
    available: boolean;
    reason?: string;
    suggestions?: string[];
  }>(
    `/api/waitlist/check-username?tag=${encodeURIComponent(
      rawTag
    )}&type=${type}`
  );
}

export async function joinWaitlist(payload: {
  fullName: string;
  phone: string;
  email: string;
  xaneTag: string;
  premiumXaneTag?: string;
  referralCode?: string;
}) {
  return request<{
    userId: string;
    xaneTag: string;
    telegramDeepLink: string;
  }>("/api/waitlist/join", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getTelegramStatus(userId: string) {
  return request<{
    telegramConnected: boolean;
    status: string;
  }>(
    `/api/waitlist/telegram-status/${encodeURIComponent(
      userId
    )}`
  );
}

export async function getMe(userId: string) {
  return request<{
    xaneTag: string;
    position: number | null;
    level: string;
    referralCount: number;
    referralLink: string;
    status: string;
  }>(
    `/api/waitlist/me/${encodeURIComponent(userId)}`
  );
}

export async function getClimb(userId: string) {
  return request<{
    position: number | null;
    referralCount: number;
    currentLevel: {
      key: string;
      threshold: number;
      label: string;
    };
    nextLevel: {
      key: string;
      threshold: number;
      label: string;
      referralsNeeded: number;
    } | null;
    ladder: {
      key: string;
      threshold: number;
      label: string;
    }[];
    referralLink: string;
  }>(
    `/api/waitlist/climb/${encodeURIComponent(userId)}`
  );
}

export async function getLeaderboard() {
  return request<{
    leaderboard: {
      rank: number;
      username: string;
      badge: string;
      friends: number;
    }[];
  }>("/api/leaderboard?limit=100");
}