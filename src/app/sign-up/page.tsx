"use client";
import Link from "next/link";
import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";
import SetupRedirect from "@/components/SetupRedirect";

import { Suspense } from "react";

function SignUpContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirectTo = searchParams.get("redirectTo")?.trim() || "/setup/baselayer";
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    // Email/password sign-up
    async function handleSignUp(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) {
            setError(signUpError.message);
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
        <main className="container stack">
            <section className="card stack">
                <h1>Create Company Account</h1>
                <p className="muted">Sign up to get started.</p>

                <form className="stack" onSubmit={handleSignUp}>
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
                        {loading ? "Creating account..." : "Sign up"}
                    </button>
                </form>

                <div className="row">
                    <button className="btn" onClick={() => handleSocialLogin("google")} disabled={loading}>
                        Sign up with Google
                    </button>
                </div>

                <p className="muted" style={{ marginTop: "1rem", textAlign: "center" }}>
                    Already have an account? <Link href="/sign-in" style={{ color: "var(--accent-text)" }}>Sign in</Link>
                </p>

                {error && <p className="muted" style={{ color: "#c44" }}>{error}</p>}
                {message && <p className="muted" style={{ color: "#4c4" }}>{message}</p>}

                <Link className="btn" href="/">
                    Back to landing
                </Link>
            </section>
        </main>
    );
}

export default function SignUpPage() {
    return (
        <Suspense fallback={<div style={{ minHeight: 40 }} />}>
            <SignUpContent />
        </Suspense>
    );
}
