import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

// Special layout for the integrations page.  We deliberately avoid redirecting
// to dashboard even if the company has already completed setup, because users
// may navigate here from the dashboard to add new connectors.  The normal
// `setup/layout.tsx` performs that redirect.
export default async function SetupIntegrationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  // NOTE: unlike the base SetupLayout we do NOT bounce back to `/dashboard`
  // when setupCompleted is true.  Access is always permitted as long as the
  // user is authenticated.  The dashboard itself provides a link to this
  // page when appropriate.
  return children;
}
