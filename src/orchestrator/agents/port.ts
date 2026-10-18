/**
 * Agent invocation port. The engine knows only this interface; scripted, live and mixed agents sit behind it.
 *
 * Implements: T023 (scripted agents behind the agent port).
 * Requirements: FR-109 (agent actions bounded by the engine)
 * ADRs:         ADR-005 (agent invocation port)
 */
export type AgentOutcome =
  | { readonly outcome: 'SUCCEEDED' }
  /** Held by a material ambiguity or a human rejection; resumes only through a recorded decision. */
  | { readonly outcome: 'SUSPENDED'; readonly reason: string };

export interface AgentTask {
  readonly runId: string;
  readonly nodeKey: string;
  readonly branch?: string;
}

export interface AgentPort {
  execute(task: AgentTask, ctx: Readonly<Record<string, unknown>>): Promise<AgentOutcome>;
}
