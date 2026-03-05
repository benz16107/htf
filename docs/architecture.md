# HTF 2.0 Architecture (Initial)

## Application

- Next.js full-stack app serves landing, auth, setup, dashboard, profile, and API routes.
- Route protection enforces authenticated access for setup/dashboard/profile APIs and pages.
- Setup state persists to PostgreSQL through Prisma (`CompanyProfileBase`, `IntegrationConnection`, `CompanyProfileHighLevel`, and `Company.setupCompleted`).

## Multi-tenant Data Model

The Prisma schema defines:

- Company account mapping: `Company`, `User`, `UserCompanyRole` (internal link table; app behavior enforces one company account)
- Setup profiles: `CompanyProfileBase`, `CompanyProfileHighLevel`
- Integrations and memory: `IntegrationConnection`, `MemoryThread`
- Explainability and risk: `AgentSession`, `ReasoningTrace`, `RiskCase`, `Scenario`, `MitigationPlan`
- Governance and learning: `OverridePolicy`, `PlaybookEntry`

## Agent Runtime (Scaffold)

- `setup-agent.ts`: baseline profile synthesis contract and trace output shape.
- `signal-agent.ts`: risk-case assessment contract with probability, impact, and scenarios.
- `backboard-client.ts`: memory thread operations for future backboard.io integration.
- `threshold-policy.ts`: company-specific escalation decision helper.

## Next Implementation Slice

1. Add queue/background workers for asynchronous risk analysis sessions.
2. Stream session traces to dashboard logs in near real-time.
3. Implement Zapier/MCP integration tokens + connector sync jobs.
4. Add production hardening for Clerk organization/account lifecycle.
