import { AppHeader } from "@/components/AppHeader";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TriggeredRiskClient } from "./TriggeredRiskClient";

export default async function TriggeredRiskPage() {
  const session = await getSession();
  if (!session?.companyId) redirect("/sign-in");

  return (
    <div className="stack-xl risk-page-container">
      <AppHeader
        title="Signals & Risk/Impact Analysis"
        subtitle="Add external and internal signals to a risk assessment, run assessment, then send outputs to mitigation or run another."
      />

      <TriggeredRiskClient />
    </div>
  );
}
