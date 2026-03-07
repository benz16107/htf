export type SelectedSignal = {
  id: string;
  type: "internal" | "external" | "manual";
  summary: string;
  /** For building the assessment request */
  internalPayload?: { signal: string; source: string; toolName: string };
  externalPayload?: { title: string; snippet: string; source?: string };
  manualPayload?: { scenario: string };
};

export type AssessmentOutput = {
  id: string;
  triggerType: string;
  /** When this risk was assessed (ISO timestamp) */
  assessedAt?: string;
  /** Distinct title for the issue (e.g. from risk assessment); used as display title and for risk case when sending to mitigation */
  issueTitle?: string;
  entityMap: Record<string, string>;
  timeWindow: { startDate?: string; expectedDurationDays?: number };
  assumptions: string[];
  assessment: {
    reasoning?: { probability?: string; impact?: string; financialImpact?: string };
    probability?: { pointEstimate?: number; bandLow?: number; bandHigh?: number; confidence?: string; topDrivers?: string[] };
    impact?: { severity?: string; timelineWeeks?: number; affectedAreas?: string[] };
    financialImpact?: { revenueAtRiskUsd?: number; hardCostIncreaseUsd?: number; marginErosionPercent?: number };
    keyStakeholders?: string[];
    potentialLosses?: string[];
    scenarios?: Array<{ name: string; recommendation: string }>;
  };
};

/** Assessment output that was sent to mitigation; includes when it was sent and optional source */
export type ArchivedOutput = AssessmentOutput & {
  sentAt: string;
  /** "autonomous" when created by the autonomous agent; "manual" or omitted when sent by user */
  source?: "manual" | "autonomous";
};
