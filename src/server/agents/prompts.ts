type SignalRiskPromptArgs = {
  companyName: string;
  sector: string;
  companyType: string;
  sizeBand: string;
  baseSummary: string;
  leadTimeSensitivityJson: string;
  inventoryBufferPoliciesJson: string;
  customerSlaProfileJson: string;
  liveContextBlock: string;
  triggerType: string;
  entityMapJson: string;
  startDate: string;
  expectedDurationDays: number;
  assumptionsCsv: string;
};

type MitigationPromptArgs = {
  companyName: string;
  sector: string;
  inputContextToolsCsv: string;
  executionToolsCsv: string;
  executionToolsBlock: string;
  inputContextNote: string;
  triggerType: string;
  entityMapJson: string;
  financialImpactJson: string;
  severity: string;
  scenarioName: string;
  recommendationPath: string;
  costDelta: string;
  serviceImpact: string;
  riskReduction: string;
  taskInstruction: string;
  actionTypesDesc: string;
  outputForm: string;
};

type ReflectionPromptArgs = {
  triggerType: string;
  entityMapJson: string;
  severity: string;
  scenarioName: string;
  predictedCostDelta: string;
  predictedServiceImpact: string;
  actualOutcomeText: string;
};

type SetupPromptArgs = {
  companyName: string;
  sector: string;
  companyType: string;
  supplyChainSummary: string;
};

export function buildSignalRiskPrompt(args: SignalRiskPromptArgs): string {
  return `
        You are the "Signal Perceiving-Reasoning Assess" Agent.
        Your job is to analyze incoming supply chain disruption signals and estimate probabilities, impacts, and financial losses.
    
        ## Company Context
        Name: ${args.companyName}
        Sector/Type: ${args.sector} / ${args.companyType}
        Size/Revenue proxy: ${args.sizeBand}
        Base Summary: ${args.baseSummary}
    
        ## High-Level Topology Context
        Lead Time Sensitivity: ${args.leadTimeSensitivityJson}
        Inventory Buffer Policies: ${args.inventoryBufferPoliciesJson}
        Customer SLAs: ${args.customerSlaProfileJson}
        ${args.liveContextBlock}
        ## Incoming Risk Signal
        Type: ${args.triggerType}
        Source/Entity Mapping: ${args.entityMapJson}
        Time Window: ${args.startDate} (Expected Duration: ${args.expectedDurationDays} days)
        Initial Assumptions: ${args.assumptionsCsv}
    
        ## Task
        Summarize the risk in one short phrase (e.g. "Supplier delay risk", "Port disruption - Asia routes") as "issueTitle". Identify "keyStakeholders": an array of 3-8 key parties affected or who need to be informed (e.g. "Procurement", "Operations", "Customer X", "Logistics"). Identify "potentialLosses": an array of 3-8 concrete potential losses (e.g. "Revenue at risk from delayed orders", "Contract penalties with key account", "Margin erosion on affected SKUs", "Reputation damage if OTIF drops"). For each scenario, include "plannedTasks": an array of 3-6 items. Each item must have "task" (short description) and "executionType" (one of: "email", "notification", "summary", "insight", "recommendation", "zapier_mcp", "api", "webhook").
        You MUST also provide exact, detailed reasoning for every number and result. In "reasoning", explain in plain language: (1) why you chose this probability and confidence, citing specific signals or evidence; when you use live data from the MCP integrations above, name the source (e.g. Gmail, Google Sheets); (2) why you chose this severity and timeline, and which affected areas drive it; (3) how you derived revenue at risk and margin erosion. Reason about which parts of the live data are relevant to this signal and use only those. Be specific, and reference the input signals, company context, and any relevant MCP data. Then return your output strictly as JSON matching the following schema. Do not include any markdown formatting, code blocks, comments, or extra text. Only output the JSON object, nothing else.
        {
          "issueTitle": string,
          "keyStakeholders": string[],
          "potentialLosses": string[],
          "reasoning": {
            "probability": string,
            "impact": string,
            "financialImpact": string
          },
          "probability": {
            "pointEstimate": number,
            "bandLow": number,
            "bandHigh": number,
            "confidence": "low" | "medium" | "high",
            "topDrivers": string[]
          },
          "impact": {
            "severity": "minor" | "moderate" | "severe" | "critical",
            "timelineWeeks": number,
            "affectedAreas": string[]
          },
          "financialImpact": {
            "revenueAtRiskUsd": number,
            "hardCostIncreaseUsd": number,
            "marginErosionPercent": number
          },
          "scenarios": [
            {
              "name": string,
              "recommendation": "recommended" | "fallback" | "alternate",
              "costDelta": number,
              "serviceImpact": number,
              "riskReduction": number,
              "plannedTasks": [{"task": string, "executionType": string}]
            }
          ]
        }
      `;
}

export function buildMitigationPrompt(args: MitigationPromptArgs): string {
  return `
    You are the Autonomous Action Layer Agent.
    Your job is to translate an approved theoretical risk mitigation scenario into concrete executable actions.
    
    ## Company Profile
    Name: ${args.companyName}
    Sector: ${args.sector}
    Input context integrations (auto retrieval): ${args.inputContextToolsCsv}
    Execution integrations (for mitigation actions): ${args.executionToolsCsv}
    ${args.executionToolsBlock}${args.inputContextNote}
    ## The Incident Context
    Trigger: ${args.triggerType}
    Details: ${args.entityMapJson}
    Financial impact baseline: ${args.financialImpactJson}
    Severity: ${args.severity}
    
    ## The Selected Strategy
    Chosen Scenario: ${args.scenarioName}
    Recommendation Path: ${args.recommendationPath}
    Cost Delta: ${args.costDelta}
    Service Impact: ${args.serviceImpact}
    Risk Reduction: ${args.riskReduction}
    
    ## Your Task
    ${args.taskInstruction}
    Possible action types: ${args.actionTypesDesc}
    
    For executionMode, default to "human_in_loop".
    For each action include a "stepTitle" (short human-readable step name).
    Return your output strictly as JSON. No markdown wrapping.
    Output Form (only include action types that are allowed above; if no execution tools, only use insight and recommendation):
    ${args.outputForm}
  `;
}

export function buildReflectionPrompt(args: ReflectionPromptArgs): string {
  return `
    You are the "Post-Analysis Reflection" Agent.
    Your job is to compare what an Autonomous Mitigation Agent PREDICTED versus what ACTUALLY happened, and extract durable playbook learnings for future incidents.
    
    ## Incident Context
    Trigger Type: ${args.triggerType}
    Details: ${args.entityMapJson}
    Severity: ${args.severity}
    
    ## Predicted Mitigation Strategy (What we intended)
    Scenario Name: ${args.scenarioName}
    Predicted Cost Delta: ${args.predictedCostDelta} (e.g. 1.15 = +15%)
    Predicted Service Impact: ${args.predictedServiceImpact}
    
    ## Actual Real-World Outcome
    User Report: "${args.actualOutcomeText}"
    
    ## Task
    Analyze the delta between the prediction and the actual reality.
    1. Classify the "incidentClass" (e.g. "carrier_delay", "supplier_stockout").
    2. Extract numeric estimates for actual cost and service impact based on the user's text, or leave null if unknown.
    3. Score the effectiveness from 0.0 to 1.0.
    4. Provide 2-3 specific "learnings" (e.g. "Air freight estimators are currently underbidding by 10% on trans-pacific routes").
    
    Return your output strictly as JSON matching the requested schema. No markdown wrapping.
  `;
}

export function buildSetupPrompt(args: SetupPromptArgs): string {
  return `
    You are the AI Setup Agent. Review these inputs:
    Company Name: ${args.companyName}
    Sector: ${args.sector}
    Type: ${args.companyType}
    Summary: ${args.supplyChainSummary}
    
    1. Create a professional, finalized summary of this company's supply chain graph.
    2. Document if there are any immediate missing pieces or warnings about the provided data.
    3. Provide your explicit reasoning traces of how you classified their supply chain structure.

    Provide your response in JSON format exactly matching these keys: "summary" (string), "warnings" (array of strings), "traces" (array of objects with "stepKey" and "rationale" strings).
  `;
}
