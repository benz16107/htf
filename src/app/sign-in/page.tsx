"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SignInForm() {
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
      <div className="auth-card auth-card--signin animate-scale">
        <Link href="/" className="row gap-2xs" style={{ marginBottom: "1.5rem", textDecoration: "none", color: "inherit" }}>
          <div className="brand-mark" />
          <span className="product-wordmark">PENTAGON</span>
        </Link>

        <header className="auth-card__header">
          <h1>Sign in</h1>
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
              placeholder="you@company.com"
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
            <span className="material-symbols-rounded btn__icon" aria-hidden>
              login
            </span>
            Sign in
          </button>
        </form>

        <footer className="auth-card__footer">
          <p className="muted text-sm">
            No account yet?{" "}
            <Link href="/sign-up" className="link">Create one</Link>
          </p>
          <Link href="/" className="btn secondary auth-card__back">
            <span className="material-symbols-rounded btn__icon" aria-hidden>
              arrow_back
            </span>
            Back to home
          </Link>
        </footer>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="auth-page"><div className="auth-card auth-card--signin"><p className="muted">Loading…</p></div></div>}>
      <SignInForm />
    </Suspense>
  );
}
