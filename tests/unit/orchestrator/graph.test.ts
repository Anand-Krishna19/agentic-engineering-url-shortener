import { describe, expect, it } from 'vitest';
import { GraphError, NODE_CATALOGUE, branchOf, buildGraph, readyNodes } from '../../../src/orchestrator/engine/graph.js';
import type { NodeState } from '../../../src/types/orchestration.js';

// Implements: T023 (graph model). Requirements: FR-105, FR-106 | ADRs: ADR-019 | Spec: orchestration-model.md section 2
const n = (key: string, ...dependsOn: string[]) => ({ key, dependsOn });
const states = (o: Record<string, NodeState>) => new Map(Object.entries(o));

describe('[FR-105][ADR-019] graph validation', () => {
  it('has the 19-node catalogue', () => expect(NODE_CATALOGUE).toHaveLength(19));

  it('rejects an unknown node type, a duplicate, an unknown dependency and a cycle', () => {
    expect(() => buildGraph([n('N99_NOPE')])).toThrow(GraphError);
    expect(() => buildGraph([n('N01_INGEST'), n('N01_INGEST')])).toThrow(/Duplicate/);
    expect(() => buildGraph([n('N02_NORMALIZE', 'N01_INGEST')])).toThrow(/unknown node/);
    expect(() => buildGraph([n('N01_INGEST', 'N02_NORMALIZE'), n('N02_NORMALIZE', 'N01_INGEST')])).toThrow(/cycle/);
  });

  it('reads the branch from an instance key', () => {
    expect(branchOf('N09_IMPLEMENT:capture')).toBe('capture');
    expect(branchOf('N12_SECURITY_VALIDATE')).toBeUndefined();
  });
});

describe('[FR-106] readiness', () => {
  const g = buildGraph([n('N07_DESIGN'), n('N08_TEST_AUTHOR', 'N07_DESIGN'), n('N14_THREAT_MODEL', 'N07_DESIGN'), n('N09_IMPLEMENT', 'N08_TEST_AUTHOR', 'N14_THREAT_MODEL')]);

  it('fans out: both successors are ready once the root succeeds', () => {
    const r = readyNodes(g, states({ N07_DESIGN: 'SUCCEEDED', N08_TEST_AUTHOR: 'PENDING', N14_THREAT_MODEL: 'PENDING', N09_IMPLEMENT: 'PENDING' }));
    expect(r.map((x) => x.key)).toEqual(['N08_TEST_AUTHOR', 'N14_THREAT_MODEL']);
  });

  it('synchronizes: a join waits for every dependency, and SKIPPED counts as satisfied', () => {
    const base = { N07_DESIGN: 'SUCCEEDED', N14_THREAT_MODEL: 'SUCCEEDED', N09_IMPLEMENT: 'PENDING' } as const;
    expect(readyNodes(g, states({ ...base, N08_TEST_AUTHOR: 'RUNNING' })).map((x) => x.key)).toEqual([]);
    expect(readyNodes(g, states({ ...base, N08_TEST_AUTHOR: 'SUSPENDED' }))).toEqual([]);
    expect(readyNodes(g, states({ ...base, N08_TEST_AUTHOR: 'SKIPPED' })).map((x) => x.key)).toEqual(['N09_IMPLEMENT']);
  });
});
