"use client";

import { useState } from "react";

type MitigationCardProps = {
    riskCase: any;
};

export function MitigationCard({ riskCase: rc }: MitigationCardProps) {
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [draftedPlan, setDraftedPlan] = useState<any | null>(rc.mitigationPlans?.[0] || null);
    const [isExecuting, setIsExecuting] = useState(false);

    const handleExecute = async (scenarioId: string) => {
        try {
            setLoadingId(scenarioId);
            const res = await fetch("/api/agents/mitigation-action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    riskCaseId: rc.id,
                    scenarioId: scenarioId,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setDraftedPlan(data.plan);
            } else {
                alert(data.error);
            }
        } catch (err) {
            console.error(err);
            alert("Failed to draft plan");
        } finally {
            setLoadingId(null);
        }
    };

    const handleApprove = async () => {
        if (!draftedPlan) return;
        try {
            setIsExecuting(true);
            const res = await fetch("/api/agents/mitigation-action/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    planId: draftedPlan.id,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setDraftedPlan({ ...draftedPlan, status: "EXECUTED" });
            } else {
                alert(data.error);
            }
        } catch (err) {
            console.error(err);
            alert("Failed to execute plan");
        } finally {
            setIsExecuting(false);
        }
    };

    const isExecuted = draftedPlan?.status === "EXECUTED";

    return (
        <section className="card stack" style={{ padding: "1.5rem", gap: "1.5rem", opacity: isExecuted ? 0.8 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid var(--border)", paddingBottom: "1rem" }}>
                <div>
                    <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: isExecuted ? "line-through" : "none" }}>
                        <span style={{ color: "var(--danger)" }}>●</span>
                        {rc.triggerType.toUpperCase()}
                    </h3>
                    <p className="muted" style={{ fontSize: "0.9rem", marginTop: "0.25rem" }}>
                        Confidence: <strong style={{ color: "var(--foreground)" }}>{rc.confidenceLevel || "N/A"}</strong> |
                        Financial Risk: <strong style={{ color: "var(--foreground)" }}>
                            ${(rc.financialImpact as any)?.revenueAtRiskUsd?.toLocaleString() || "N/A"}
                        </strong>
                    </p>
                </div>
                <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "0.8rem", padding: "0.2rem 0.6rem", borderRadius: "20px", backgroundColor: isExecuted ? "var(--success)" : draftedPlan ? "var(--accent)" : "var(--surface)", color: (draftedPlan || isExecuted) ? "#fff" : "inherit", border: "1px solid var(--border)" }}>
                        {isExecuted ? "Mitigated" : draftedPlan ? "Approval Pending" : "Needs Action"}
                    </span>
                </div>
            </div>

            {!isExecuted && (
                <div>
                    <h4 style={{ marginBottom: "1rem", fontSize: "1rem" }}>Trade-off Scenarios</h4>
                    <div className="grid three" style={{ gap: "1rem" }}>
                        {rc.scenarios.map((scenario: any) => {
                            const isRecommended = scenario.recommendation === "RECOMMENDED";
                            const isLoading = loadingId === scenario.id;

                            return (
                                <div key={scenario.id} className="pad radius stack" style={{
                                    border: isRecommended ? "2px solid var(--accent)" : "1px solid var(--border)",
                                    backgroundColor: isRecommended ? "var(--surface-soft)" : "transparent",
                                    position: "relative"
                                }}>
                                    {isRecommended && (
                                        <div style={{ position: "absolute", top: "-10px", right: "10px", backgroundColor: "var(--accent)", color: "#fff", fontSize: "0.7rem", fontWeight: "bold", padding: "2px 8px", borderRadius: "10px", textTransform: "uppercase" }}>
                                            AI Pick
                                        </div>
                                    )}
                                    <h4 style={{ margin: 0 }}>{scenario.name}</h4>

                                    <div className="grid two" style={{ gap: "0.5rem", marginTop: "0.5rem" }}>
                                        <div className="pad radius" style={{ backgroundColor: "var(--background)", border: "1px solid var(--border)" }}>
                                            <p className="muted" style={{ fontSize: "0.7rem", textTransform: "uppercase" }}>Cost Delta</p>
                                            <p style={{ fontWeight: 600, color: scenario.costDelta && scenario.costDelta > 1 ? "var(--danger)" : "var(--success)" }}>
                                                {scenario.costDelta ? `${(scenario.costDelta * 100 - 100).toFixed(1)}%` : "N/A"}
                                            </p>
                                        </div>
                                        <div className="pad radius" style={{ backgroundColor: "var(--background)", border: "1px solid var(--border)" }}>
                                            <p className="muted" style={{ fontSize: "0.7rem", textTransform: "uppercase" }}>Service Impact</p>
                                            <p style={{ fontWeight: 600, color: scenario.serviceImpact && scenario.serviceImpact < 0 ? "var(--danger)" : "var(--success)" }}>
                                                {scenario.serviceImpact ? `${(scenario.serviceImpact * 100).toFixed(1)}%` : "N/A"}
                                            </p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleExecute(scenario.id)}
                                        disabled={!!loadingId || !!draftedPlan}
                                        className={`btn ${isRecommended ? "primary" : "secondary"}`}
                                        style={{ marginTop: "1rem", width: "100%", opacity: (loadingId || draftedPlan) ? 0.5 : 1 }}
                                    >
                                        {isLoading ? "Drafting..." : draftedPlan ? "Drafted" : "Draft Execution"}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {draftedPlan && draftedPlan.actions && (
                <div style={{ marginTop: "1rem", borderTop: !isExecuted ? "1px solid var(--border)" : "none", paddingTop: !isExecuted ? "1.5rem" : "0" }}>
                    <h4 style={{ marginBottom: "1rem" }}>{isExecuted ? "Executed Playbook" : "Autonomous Execution Draft"}</h4>
                    <p className="muted" style={{ fontSize: "0.9rem", marginBottom: "1rem" }}>{draftedPlan.summary}</p>

                    <div className="stack" style={{ gap: "1rem" }}>
                        {draftedPlan.actions.map((action: any, idx: number) => (
                            <div key={idx} className="pad radius" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                                    <span style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 600, color: "var(--accent)" }}>
                                        {action.type}
                                    </span>
                                    <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{action.recipientOrEndpoint}</span>
                                </div>
                                <div style={{ fontFamily: "monospace", fontSize: "0.85rem", whiteSpace: "pre-wrap", color: "var(--foreground)" }}>
                                    {action.payloadOrBody}
                                </div>
                            </div>
                        ))}
                    </div>

                    {!isExecuted && (
                        <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
                            <button
                                className="btn primary"
                                style={{ flex: 1 }}
                                onClick={handleApprove}
                                disabled={isExecuting}
                            >
                                {isExecuting ? "Executing..." : "Approve & Fire Webhooks"}
                            </button>
                            <button className="btn secondary" disabled={isExecuting}>Reject & Edit</button>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
