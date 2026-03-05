export type ThreadAccessInput = {
  requesterAgent: string;
  ownerAgent: string;
  scope: "self_only" | "company_all";
};

export function canReadThread(input: ThreadAccessInput): boolean {
  if (input.scope === "company_all") {
    return true;
  }

  return input.requesterAgent === input.ownerAgent;
}
