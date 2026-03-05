import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { authCookieNames } from "@/lib/auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

function isSessionValid(raw?: string) {
  if (!raw) {
    return false;
  }

  try {
    const parsed = JSON.parse(raw) as { userId?: string; companyId?: string };
    return Boolean(parsed.userId && parsed.companyId);
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const sessionRaw = request.cookies.get(authCookieNames.session)?.value;

  if (isSessionValid(sessionRaw)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    return response;
  }

  if (request.nextUrl.pathname.startsWith("/sign-in") || request.nextUrl.pathname.startsWith("/sign-up")) {
    return response;
  }

  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: [
    "/setup/:path*",
    "/dashboard/:path*",
    "/profile/:path*",
    "/api/setup/:path*",
    "/api/risk/:path*",
  ],
};
