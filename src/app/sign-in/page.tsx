"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function SignInPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const redirectTo = searchParams.get("redirectTo") ?? "/dashboard";

  const errorMessage =
    error === "missing_fields"
      ? "Please enter your email and password."
      : error === "invalid_credentials"
        ? "Invalid email or password."
        : null;

  return (
    <div className="auth-page">
      <div className="auth-card auth-card--signin">
        <header className="auth-card__header">
          <h1>Sign in</h1>
          <p className="muted text-sm">Sign in to your account to continue.</p>
        </header>

        {errorMessage && (
          <div className="auth-card__error" role="alert">
            {errorMessage}
          </div>
        )}

        <form action="/api/auth/sign-in" method="post" className="auth-card__form">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <div className="field">
            <label htmlFor="signin-email">Email</label>
            <input
              id="signin-email"
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>
          <div className="field">
            <label htmlFor="signin-password">Password</label>
            <input
              id="signin-password"
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="Enter your password"
            />
          </div>
          <button type="submit" className="btn primary auth-card__submit">
            Sign in
          </button>
        </form>

        <footer className="auth-card__footer">
          <p className="muted text-sm">
            Don&apos;t have an account?{" "}
            <Link href="/sign-up" className="link">Sign up</Link>
          </p>
          <Link href="/" className="btn secondary auth-card__back">
            Back to home
          </Link>
        </footer>
      </div>
    </div>
  );
}
