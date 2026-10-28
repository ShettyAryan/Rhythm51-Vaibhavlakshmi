"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input } from "@/components/admin/ui";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? "Sign in failed");
          router.replace(next);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Sign in failed");
          setBusy(false);
        }
      }}
    >
      <Field label="Email">
        <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} name="email" />
      </Field>
      <Field label="Password">
        <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} name="password" />
      </Field>
      {error && (
        <p className="text-sm text-red-700" role="alert" data-testid="login-error">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" className="w-full" loading={busy}>
        Sign in
      </Button>
    </form>
  );
}
