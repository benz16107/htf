import { AppHeader } from "@/components/AppHeader";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import AutonomousAgentClient from "./AutonomousAgentClient";

export default async function AutonomousAgentPage() {
  const session = await getSession();
  if (!session?.companyId) redirect("/sign-in");

  return (
    <div className="stack-xl" style={{ maxWidth: 800 }}>
      <AppHeader title="Autonomous agent" />
      <AutonomousAgentClient />
    </div>
  );
}
