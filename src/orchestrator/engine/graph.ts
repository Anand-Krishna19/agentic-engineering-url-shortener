/**
 * Workflow dependency graph (sdlc/1): node catalogue, validation, readiness.
 *
 * Implements: T023 (graph model). A node is ready when every dependency is SUCCEEDED or SKIPPED, so
 * fan-out, synchronizing joins and suspended branches follow from edges, not from list order.
 * Requirements: FR-105 (dependency-based ordering), FR-106 (parallel branches, synchronization)
 * ADRs:         ADR-019 (dependency graph representation), ADR-004
 * Spec:         orchestration-model.md section 2 (graph, branch instance keys) and section 8 (catalogue)
 */
import type { NodeState } from '../../types/orchestration.js';

/** Node catalogue, orchestration-model.md section 2. */
export const NODE_CATALOGUE = [
  'N01_INGEST', 'N02_NORMALIZE', 'N03_AMBIGUITY_DETECT', 'N04_CLARIFY', 'N05_DECOMPOSE',
  'N06_IMPACT_ANALYSIS', 'N07_DESIGN', 'N08_TEST_AUTHOR', 'N09_IMPLEMENT', 'N10_DOCUMENT',
  'N11_TEST_RUN', 'N12_SECURITY_VALIDATE', 'N13_COMPLIANCE_CHECK', 'N14_THREAT_MODEL',
  'N15_VALIDATION_JOIN', 'N16_RISK_ACCEPT', 'N17_RELEASE_READINESS', 'N18_FINAL_SUMMARY',
  'N19_FINAL_SUBMISSION',
] as const;
export type CatalogueNode = (typeof NODE_CATALOGUE)[number];

export interface NodeSpec {
  /** `N09_IMPLEMENT` or, for a branch instance, `N09_IMPLEMENT:capture`. */
  readonly key: string;
  readonly dependsOn: readonly string[];
  /** Conditional edge: a returned reason skips the node and records why. */
  readonly skipIf?: (ctx: Readonly<Record<string, unknown>>) => string | undefined;
}

export class GraphError extends Error {}

export interface Graph {
  readonly nodes: readonly NodeSpec[];
  get(key: string): NodeSpec | undefined;
}

/** Branch part of an instance key: `N09_IMPLEMENT:capture` gives `capture`. */
export const branchOf = (key: string): string | undefined => (key.includes(':') ? key.split(':')[1] : undefined);

/** Validates keys, edges and acyclicity (Kahn), then freezes the graph. */
export function buildGraph(nodes: readonly NodeSpec[]): Graph {
  const byKey = new Map<string, NodeSpec>();
  for (const n of nodes) {
    const base = n.key.split(':')[0]!;
    if (!(NODE_CATALOGUE as readonly string[]).includes(base)) throw new GraphError(`Unknown node type ${base}`);
    if (byKey.has(n.key)) throw new GraphError(`Duplicate node ${n.key}`);
    byKey.set(n.key, n);
  }
  for (const n of nodes) {
    for (const d of n.dependsOn) {
      if (!byKey.has(d)) throw new GraphError(`${n.key} depends on unknown node ${d}`);
    }
  }
  const indegree = new Map(nodes.map((n) => [n.key, n.dependsOn.length]));
  const queue = nodes.filter((n) => n.dependsOn.length === 0).map((n) => n.key);
  let visited = 0;
  while (queue.length > 0) {
    const k = queue.shift()!;
    visited += 1;
    for (const n of nodes) {
      if (n.dependsOn.includes(k)) {
        const left = indegree.get(n.key)! - 1;
        indegree.set(n.key, left);
        if (left === 0) queue.push(n.key);
      }
    }
  }
  if (visited !== nodes.length) throw new GraphError('Graph contains a cycle');
  return { nodes, get: (key) => byKey.get(key) };
}

const SATISFIED: readonly NodeState[] = ['SUCCEEDED', 'SKIPPED'];

/** Nodes that may start now: PENDING or READY with every dependency SUCCEEDED or SKIPPED. */
export function readyNodes(graph: Graph, states: ReadonlyMap<string, NodeState>): NodeSpec[] {
  return graph.nodes.filter((n) => {
    const s = states.get(n.key);
    return (s === 'PENDING' || s === 'READY') && n.dependsOn.every((d) => SATISFIED.includes(states.get(d) as NodeState));
  });
}
