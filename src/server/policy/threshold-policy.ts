export type ThresholdPolicy = {
  revenueAtRiskLimit: number;
  otifFloor: number;
  probabilityThreshold: number;
};

export type EscalationInput = {
  revenueAtRisk: number;
  projectedOtif: number;
  disruptionProbability: number;
};

export function shouldEscalate(
  policy: ThresholdPolicy,
  input: EscalationInput,
): { escalate: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (input.revenueAtRisk > policy.revenueAtRiskLimit) {
    reasons.push("Revenue-at-risk exceeds company threshold.");
  }

  if (input.projectedOtif < policy.otifFloor) {
    reasons.push("Projected OTIF drops below floor.");
  }

  if (input.disruptionProbability > policy.probabilityThreshold) {
    reasons.push("Disruption probability exceeds threshold.");
  }

  return {
    escalate: reasons.length > 0,
    reasons,
  };
}
