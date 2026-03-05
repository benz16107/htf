import { redirect } from "next/navigation";
import { getSession, hasCompletedSetup } from "@/lib/auth";

export default async function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  const setupComplete = await hasCompletedSetup();

  // Returning users should still be able to revisit any step of the setup
  // flow (e.g. to add connectors).  We no longer redirect to dashboard here;
  // the dashboard itself provides a link when appropriate.
  // if (setupComplete) {
  //   redirect("/dashboard");
  // }

  return children;
}
