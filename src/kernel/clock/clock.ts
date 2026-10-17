import type { ClockKind } from '../../types/orchestration.js';

// Clock port (ADR-010). Every timestamp and deadline in the system comes from a Clock; this file is the
// only place allowed to read the wall clock (an ESLint rule enforces it). Records carry `clock_kind`.

export interface Clock {
  readonly kind: ClockKind;
  now(): Date;
}

export class WallClock implements Clock {
  readonly kind = 'WALL' as const;

  now(): Date {
    return new Date();
  }
}

/** Deterministic clock for tests and simulated-time runs: it moves only when told to. */
export class SimulatedClock implements Clock {
  readonly kind = 'SIMULATED' as const;
  private current: number;

  constructor(start: string | Date) {
    this.current = SimulatedClock.parse(start);
  }

  now(): Date {
    return new Date(this.current); // a copy: callers cannot move the clock by mutating it
  }

  set(time: string | Date): void {
    this.current = SimulatedClock.parse(time);
  }

  advance(ms: number): void {
    this.current += ms;
  }

  private static parse(time: string | Date): number {
    const t = new Date(time).getTime();
    if (Number.isNaN(t)) throw new RangeError('SimulatedClock needs a valid time');
    return t;
  }
}
