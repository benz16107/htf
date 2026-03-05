import { AppHeader } from "@/components/AppHeader";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getCompanySetupSnapshot } from "@/server/company-setup";

export default async function ProfilePage() {
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  const setupSnapshot = session.companyId
    ? await getCompanySetupSnapshot(session.companyId)
    : {
        baselayer: null,
        integrations: { connectors: [] },
        highLevel: null,
      };

  return (
    <main className="container stack">
      <AppHeader
        title="Company Profile"
        subtitle="Review and update base/high-level setup information"
      />

      <section className="card stack">
        <h3>Identity</h3>
        <p className="muted">Company account: {session?.email}</p>
        <p className="muted">Company ID: {session?.companyId}</p>
        <p className="muted">Account type: Company owner</p>
      </section>

      <section className="grid two">
        <article className="card stack">
          <h3>Baselayer profile</h3>
          {setupSnapshot.baselayer ? (
            Object.entries(setupSnapshot.baselayer).map(([key, value]) => (
              <p className="muted" key={key}>
                {key}: {value || "—"}
              </p>
            ))
          ) : (
            <p className="muted">No baselayer profile captured yet.</p>
          )}
        </article>

        <article className="card stack">
          <h3>High-level profile</h3>
          {setupSnapshot.highLevel ? (
            Object.entries(setupSnapshot.highLevel).map(([key, value]) => (
              <p className="muted" key={key}>
                {key}: {value || "—"}
              </p>
            ))
          ) : (
            <p className="muted">No high-level profile captured yet.</p>
          )}
        </article>
      </section>
    </main>
  );
}
