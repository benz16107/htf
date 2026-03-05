import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function companyOwnerRole() {
  return "OWNER" as const;
}

function toCompanyKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export async function POST(request: Request) {
  const formData = await request.formData();

  const email = (formData.get("email")?.toString() ?? "").trim();
  const companyName = (formData.get("companyName")?.toString() ?? "").trim();
  const redirectTo = (formData.get("redirectTo")?.toString() ?? "").trim();

  if (!email || !companyName) {
    return NextResponse.redirect(new URL("/sign-in?error=missing_fields", request.url));
  }

  const companyKey = toCompanyKey(companyName);

  const existingCompany = await db.company.findUnique({
    where: { key: companyKey },
  });

  const existingUser = await db.user.findUnique({
    where: { email },
  });

  if (existingCompany) {
    const linkedAccount = await db.userCompanyRole.findFirst({
      where: { companyId: existingCompany.id },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });

    if (linkedAccount && linkedAccount.user.email !== email) {
      return NextResponse.redirect(
        new URL("/sign-in?error=company_account_exists", request.url),
      );
    }
  }

  if (existingUser) {
    const anotherCompanyAccountLink = await db.userCompanyRole.findFirst({
      where: {
        userId: existingUser.id,
        company: {
          key: {
            not: companyKey,
          },
        },
      },
      include: {
        company: true,
      },
    });

    if (anotherCompanyAccountLink) {
      return NextResponse.redirect(
        new URL("/sign-in?error=account_has_other_company", request.url),
      );
    }
  }

  const [user, company] = await Promise.all([
    db.user.upsert({
      where: { email },
      update: {},
      create: { email },
    }),
    db.company.upsert({
      where: { key: companyKey },
      update: { name: companyName },
      create: {
        key: companyKey,
        name: companyName,
      },
    }),
  ]);

  await db.userCompanyRole.upsert({
    where: {
      userId_companyId: {
        userId: user.id,
        companyId: company.id,
      },
    },
    update: { role: "OWNER" },
    create: {
      userId: user.id,
      companyId: company.id,
      role: companyOwnerRole(),
    },
  });

  return NextResponse.redirect(new URL(redirectTo || "/setup/baselayer", request.url));
}
