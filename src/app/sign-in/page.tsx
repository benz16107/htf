"use client";

export const dynamic = 'force-dynamic';
import Link from "next/link";
import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import SetupRedirect from "@/components/SetupRedirect";

export default function SignInPage() {
  const router = useRouter();
  const [redirectTo, setRedirectTo] = useState("/setup/baselayer");
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const r = params.get("redirectTo")?.trim();
      if (r) setRedirectTo(r);
    }
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Email/password sign-in
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
    } else {
      window.location.href = redirectTo;
    }
    setLoading(false);
  }

  // Social login (Google example)
  async function handleSocialLogin(provider: "google" | "github") {
    setLoading(true);
    setError(null);
    setMessage(null);
    const { error: socialError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    });
    if (socialError) {
      setError(socialError.message);
    } else {
      // For OAuth, Supabase will redirect back to your app, so SetupRedirect or landing page logic will handle it
    }
    setLoading(false);
  }

  return (
    <>
      <SetupRedirect />
      <main className="container stack">
        <section className="card stack">
          <h1>Welcome Back</h1>
          <p className="muted">Sign in to your company account.</p>

          <form className="stack" onSubmit={handleSignIn}>
            <label className="field">
              Email
              <input
                required
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
              />
            </label>
            <label className="field">
              Password
              <input
                required
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
              />
            </label>
            <button className="btn primary" type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="row">
            <button className="btn" onClick={() => handleSocialLogin("google")} disabled={loading}>
              Sign in with Google
            </button>
          </div>

          <p className="muted" style={{ marginTop: "1rem", textAlign: "center" }}>
            Don't have an account? <Link href="/sign-up" style={{ color: "var(--accent-text)" }}>Sign up</Link>
          </p>

          {error && <p className="muted" style={{ color: "#c44" }}>{error}</p>}
          {message && <p className="muted" style={{ color: "#4c4" }}>{message}</p>}

          <Link className="btn" href="/">
            Back to landing
          </Link>
        </section>
      </main>
    </>
  );
}
