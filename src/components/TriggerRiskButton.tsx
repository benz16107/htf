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

            const data = await res.json().catch(() => ({}));

            if (res.ok && data.success) {
                router.push("/dashboard/plans");
                router.refresh();
            } else {
                const msg = data.error || (res.status === 401 ? "Please sign in again." : "Failed to assess risk.");
                alert(msg);
                setLoading(false);
            }
        } catch (err) {
            console.error(err);
            alert("Network error. Check the console.");
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
