"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type TriggerRiskButtonProps = {
    label?: string;
    triggerType: string;
    entityMap: any;
    timeWindow: any;
    assumptions?: string[];
    className?: string;
    style?: React.CSSProperties;
};

export function TriggerRiskButton({
    label = "Assess Risk",
    triggerType,
    entityMap,
    timeWindow,
    assumptions = [],
    className = "btn primary",
    style
}: TriggerRiskButtonProps) {
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleTrigger = async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/agents/signal-risk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    triggerType,
                    entityMap,
                    timeWindow,
                    assumptions
                })
            });

            const data = await res.json();

            if (data.success) {
                // Redirect to plans page, hard refresh to load new db entries
                router.push("/dashboard/plans");
                router.refresh();
            } else {
                alert(data.error || "Failed to assess risk.");
                setLoading(false);
            }
        } catch (err) {
            console.error(err);
            alert("Network error.");
            setLoading(false);
        }
    };

    return (
        <button
            className={className}
            style={style}
            onClick={handleTrigger}
            disabled={loading}
        >
            {loading ? "AI Assessing..." : label}
        </button>
    );
}
