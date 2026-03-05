import { BackboardClient as SDKClient } from "backboard-sdk";

export type MemoryThreadData = {
  agentName: string;
  companyId: string;
  accessScope: "self_only" | "company_all";
};

export class BackboardClient {
  private sdk: SDKClient;

  constructor(private readonly apiKey: string) {
    this.sdk = new SDKClient({ apiKey });
  }

  /**
   * Automatically scopes a dedicated backboard Assistant to a single Company + AgentType,
   * then spawns a conversation Thread underneath it for this memory instance.
   */
  async createThread(input: MemoryThreadData): Promise<{ threadId: string; assistantId: string } & MemoryThreadData> {
    const assistant = await this.sdk.createAssistant({
      name: `${input.agentName} - ${input.companyId}`,
      description: `Dedicated AI Agent Memory for ${input.companyId} (${input.agentName})`,
      system_prompt: "You are an AI Supply Chain Risk Agent. Maintain a persistent understanding of this company's topology and incident history. Store and retrieve facts accurately.",
    });

    const thread = await this.sdk.createThread(assistant.assistantId);

    return {
      threadId: thread.threadId ? thread.threadId : thread.id,
      assistantId: assistant.assistantId,
      ...input,
    };
  }

  async appendReasoning(
    threadId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.sdk.addMessage(threadId, {
      content: JSON.stringify(payload, null, 2),
    });
  }

  async getMemories(assistantId: string) {
    return this.sdk.getMemories(assistantId);
  }

  isConfigured() {
    return Boolean(this.apiKey) && this.apiKey.length > 0;
  }
}
