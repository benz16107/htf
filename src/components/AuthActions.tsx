"use client";

import { SignOutButton } from "@clerk/nextjs";
import type { AuthMode } from "@/lib/auth";

type AuthActionsProps = {
  authMode: AuthMode;
};

export function AuthActions({ authMode }: AuthActionsProps) {
  return (
    <form action="/api/auth/logout" method="post">
      <button className="btn danger" type="submit">
        Sign out
      </button>
    </form>
  );
  // Supabase-only sign-out
  return (
    <form action="/api/auth/logout" method="post">
      <button className="btn danger" type="submit">
        Sign out
      </button>
    </form>
  );
}
