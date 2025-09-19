export async function fetchJSON<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function safeJSON<T>(res: Response): Promise<T | undefined> {
  try {
    return (await res.json()) as T;
  } catch {
    return undefined;
  }
}

export const api = {
  status: () => fetchJSON<{ status: string; hasQR: boolean }>("/api/status"),
  panelStatus: () =>
    fetchJSON<{ loggedIn: boolean; requireOtp: boolean }>("/api/panel/status"),
  loginUP: (username: string, password: string) =>
    fetch("/api/panel/login-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
  otpSend: () => fetch("/api/panel/otp/send", { method: "POST" }),
  otpVerify: (code: string) =>
    fetch("/api/panel/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }),
  getConfig: () =>
    fetchJSON<{ prefix: string; ownerJid: string | null }>("/api/config"),
  patchConfig: (payload: { prefix?: string; ownerJid?: string | null }) =>
    fetchJSON("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  requestPair: (phone: string) =>
    fetchJSON<{ code: string }>(`/api/pair?phone=${encodeURIComponent(phone)}`, {
      method: "POST",
    }),
  testOwner: () => fetch("/api/admin/test-owner", { method: "POST" }),
};

