import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrigin } from "@/lib/request-origin";
import { createSession, hashPassword, SESSION_COOKIE_OPTIONS } from "@/lib/auth";

function toCompanyKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const origin = getRequestOrigin(request);

  const email = (formData.get("email")?.toString() ?? "").trim().toLowerCase();
  const password = formData.get("password")?.toString() ?? "";
  const companyName = (formData.get("companyName")?.toString() ?? "").trim();

  if (!email || !password || !companyName) {
    return NextResponse.redirect(new URL("/sign-up?error=missing_fields", origin));
  }

  if (password.length < 8) {
    return NextResponse.redirect(new URL("/sign-up?error=password_too_short", origin));
  }

  let companyKey = toCompanyKey(companyName);
  if (!companyKey) {
    companyKey = `company_${crypto.randomUUID().slice(0, 8)}`;
  }

  const existingUser = await db.user.findUnique({
    where: { email },
  });
  if (existingUser) {
    return NextResponse.redirect(new URL("/sign-up?error=email_taken", origin));
  }

  const existingCompany = await db.company.findUnique({
    where: { key: companyKey },
  });
  if (existingCompany) {
    const link = await db.userCompanyRole.findFirst({
      where: { companyId: existingCompany.id },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    if (link && link.user.email !== email) {
      return NextResponse.redirect(new URL("/sign-up?error=company_taken", origin));
    }
  }

  try {
    const passwordHash = await hashPassword(password);

    const [user, company] = await Promise.all([
      db.user.create({
        data: { email, passwordHash },
      }),
      db.company.upsert({
        where: { key: companyKey },
        update: { name: companyName },
        create: { key: companyKey, name: companyName },
      }),
    ]);

    await db.userCompanyRole.upsert({
      where: {
        userId_companyId: { userId: user.id, companyId: company.id },
      },
      update: { role: "OWNER" },
      create: {
        userId: user.id,
        companyId: company.id,
        role: "OWNER",
      },
    });

    const token = await createSession(user.id, company.id);
    const res = NextResponse.redirect(new URL("/setup/baselayer", origin));
    res.cookies.set("htf_session", token, SESSION_COOKIE_OPTIONS);
    return res;
  } catch (e) {
    console.error("[sign-up] Error:", e instanceof Error ? e.message : e);
    return NextResponse.redirect(new URL("/sign-up?error=signup_failed", origin));
  }
}
