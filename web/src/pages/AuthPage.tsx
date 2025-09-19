import React, { useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { useToast } from "../providers/ToastProvider";
import { api, safeJSON } from "../lib/api";
import type { Status } from "../types";

type Props = {
  status: Status;
  requireOtp: boolean;
  onAuthed: () => void;
};

export function AuthPage({ status, requireOtp, onAuthed }: Props) {
  const { show } = useToast();
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  async function loginWithPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const username = String(form.get("username") || "");
    const password = String(form.get("password") || "");
    const res = await api.loginUP(username, password);
    if (res.ok) onAuthed();
    else show("Invalid credentials", "error");
  }

  async function sendOtp() {
    try {
      setSendingOtp(true);
      const res = await api.otpSend();
      if (res.ok) show("OTP sent to owner JID", "success");
      else {
        const body = await safeJSON<{ error?: string }>(res);
        const msg =
          body?.error === "owner_not_set"
            ? "Owner JID not set in Config"
            : body?.error === "socket_not_ready"
            ? "Bot socket not ready"
            : body?.error === "too_frequent"
            ? "Please wait before requesting another OTP"
            : body?.error === "rate_limited"
            ? "Too many OTP requests; try again later"
            : body?.error === "locked"
            ? "Too many failures; OTP temporarily locked"
            : "Failed to send OTP";
        show(msg, "error");
      }
    } finally {
      setSendingOtp(false);
    }
  }

  async function verifyOtp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const code = String(form.get("code") || "");
    setVerifyingOtp(true);
    try {
      const res = await api.otpVerify(code);
      if (res.ok) onAuthed();
      else {
        const body = await safeJSON<{ error?: string }>(res);
        const msg =
          body?.error === "expired"
            ? "OTP expired; request a new one"
            : body?.error === "invalid"
            ? "Invalid OTP; try again"
            : body?.error === "locked"
            ? "Too many attempts; temporarily locked"
            : "OTP verification failed";
        show(msg, "error");
      }
    } finally {
      setVerifyingOtp(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-10">
      <Card title={requireOtp ? "Enter OTP" : "Sign in"}>
        {!requireOtp ? (
          <form className="mt-2 space-y-3" onSubmit={loginWithPassword}>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Username</label>
              <input
                name="username"
                className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Password</label>
              <input
                type="password"
                name="password"
                className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500"
              />
            </div>
            <Button className="w-full mt-2" type="submit">Sign in</Button>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Bot is {status}. Username/password works when bot is logged out.</p>
          </form>
        ) : (
          <div className="mt-2">
            <p className="text-sm text-neutral-600 dark:text-neutral-300">We sent a one-time code to the Owner JID on WhatsApp. Enter it below.</p>
            <form className="mt-3 flex gap-2" onSubmit={verifyOtp}>
              <input
                name="code"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="6-digit code"
                className="flex-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500"
              />
              <Button disabled={verifyingOtp}>{verifyingOtp ? "Verifying…" : "Verify"}</Button>
            </form>
            <Button onClick={sendOtp} disabled={sendingOtp} variant="outline" className="mt-3 text-sm">
              {sendingOtp ? "Sending…" : "Resend OTP"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
