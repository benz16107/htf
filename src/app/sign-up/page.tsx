"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SignUpForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const errorMessage =
    error === "missing_fields"
      ? "Please fill in all fields."
      : error === "password_too_short"
        ? "Password must be at least 8 characters."
        : error === "email_taken"
          ? "An account with this email already exists. Try signing in."
          : error === "company_taken"
            ? "This company name is already registered with another account."
            : error === "signup_failed"
              ? "Something went wrong. Please try again."
              : null;

  return (
    <div className="auth-page">
      <div className="auth-card auth-card--signin animate-scale">
        <Link href="/" className="row gap-2xs" style={{ marginBottom: "1.5rem", textDecoration: "none", color: "inherit" }}>
          <div className="sidebar-logo-mark" />
          <span style={{ fontWeight: 700, fontSize: "1.125rem", letterSpacing: "-0.03em" }}>PENTAGON</span>
        </Link>

        <header className="auth-card__header">
          <h1>Create account</h1>
          <p className="muted text-sm">Create your account. You’ll complete setup next.</p>
        </header>

        {errorMessage && (
          <div className="auth-card__error" role="alert">
            {errorMessage}
          </div>
        )}

        <form action="/api/auth/sign-up" method="post" className="auth-card__form">
          <div className="field">
            <label htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
            />
          </div>
          <div className="field">
            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              type="password"
              name="password"
              required
              autoComplete="new-password"
              minLength={8}
              placeholder="At least 8 characters"
            />
          </div>
          <div className="field">
            <label htmlFor="signup-company">Company name</label>
            <input
              id="signup-company"
              type="text"
              name="companyName"
              required
              autoComplete="organization"
              placeholder="Acme Inc"
            />
          </div>
          <button type="submit" className="btn primary auth-card__submit">
            Create account
          </button>
        </form>

        <footer className="auth-card__footer">
          <p className="muted text-sm">
            Already have an account?{" "}
            <Link href="/sign-in" className="link" style={{ color: "var(--accent-text)", fontWeight: 600 }}>Sign in</Link>
          </p>
          <Link href="/" className="btn secondary auth-card__back">
            Back to home
          </Link>
        </footer>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="auth-page"><div className="auth-card auth-card--signin"><p className="muted">Loading…</p></div></div>}>
      <SignUpForm />
    </Suspense>
  );
}
