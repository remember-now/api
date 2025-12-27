export interface CreateAgentJobData {
  userId: number;
}

export interface DeleteAgentJobData {
  userId: number;
  agentId: string;
}

export type AgentJobData = CreateAgentJobData | DeleteAgentJobData;
