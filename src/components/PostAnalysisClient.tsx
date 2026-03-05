"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PostAnalysisClient({ plan }: { plan: any }) {
    const [outcomeText, setOutcomeText] = useState("");
    const [isReflecting, setIsReflecting] = useState(false);
    const router = useRouter();

    const handleReflect = async () => {
        if (!outcomeText.trim()) return;

        setIsReflecting(true);
        try {
            const res = await fetch("/api/agents/reflection", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mitigationPlanId: plan.id,
                    actualOutcomeText: outcomeText,
                })
            });

            const data = await res.json();
            if (data.success) {
                // Refresh the page so the server component fetches the new Playbook entry and removes this plan
                router.refresh();
            } else {
                alert(data.error);
            }
        } catch (err) {
            console.error(err);
            alert("Failed to run reflection");
        } finally {
            setIsReflecting(false);
        }
    };

    const chosenScenario = plan.riskCase?.scenarios?.find((s: any) => s.id === plan.scenarioId) || plan.riskCase?.scenarios?.[0];

    return (
        <div className="card pad radius stack" style={{ border: "1px solid var(--border)", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <h4 style={{ margin: 0 }}>Incident: {plan.riskCase?.triggerType}</h4>
                <span style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", borderRadius: "10px", backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
                    Executed Plan
                </span>
            </div>

            <div className="muted" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
                <strong>Targeted Scenario:</strong> {chosenScenario?.name || "Unknown"} <br />
                <strong>Expected Cost Delta:</strong> {chosenScenario?.costDelta ? `${(chosenScenario.costDelta * 100 - 100).toFixed(1)}%` : "N/A"}
            </div>

            <div className="stack" style={{ gap: "0.5rem" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Real-World Outcome</label>
                <textarea
                    placeholder="E.g., The alternative carrier charged us an extra $500 but arrived exactly on time. No SLA was breached."
                    value={outcomeText}
                    onChange={(e) => setOutcomeText(e.target.value)}
                    rows={3}
                    style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)", fontFamily: "inherit", fontSize: "0.9rem", resize: "vertical" }}
                />
            </div>

            <button
                onClick={handleReflect}
                disabled={isReflecting || !outcomeText.trim()}
                className="btn primary"
                style={{ marginTop: "1rem", alignSelf: "flex-end" }}
            >
                {isReflecting ? "AI Generating Learnings..." : "Run AI Reflection"}
            </button>
        </div>
    );
}
