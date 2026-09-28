/**
 * A task refusal the Agent API answers with `409 TASK_CONFLICT`. A lost claim
 * is not one: it is a per-task claim result carrying the structured conflict.
 */
export class AgentTaskError extends Error {}
