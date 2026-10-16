import { describe, expect, it } from 'vitest';
import { positionOf, priceLines, recommendation, referenceRange, referenceSheet, serviceName, total } from './pricing';

describe('pricing (same rules as the server)', () => {
  it('adds a job up line by line', () => {
    const lines = priceLines(referenceSheet, [{ kind: 'wall', count: 2, large: 1 }, { kind: 'cassette', count: 1, large: 0 }], false, 1);
    expect(lines.map(line => line.kind)).toEqual(['clean', 'clean', 'large', 'access']);
    expect(total(lines)).toBe(600 * 2 + 1200 + 200 + 300);
    expect(total(priceLines(referenceSheet, [{ kind: 'wall', count: 1, large: 0 }], true, 5))).toBe(1200 + 300);
  });

  it('gives a reference range around the typical price', () => {
    expect(referenceRange([{ kind: 'wall', count: 2, large: 0 }], false, 0)).toEqual({ low: 1020, mid: 1200, high: 1500, technicians: 0, reference: true });
  });

  it('names the job like the server', () => {
    expect(serviceName([{ kind: 'cassette', count: 1, large: 0 }, { kind: 'wall', count: 1, large: 0 }], true)).toBe('ล้างใหญ่ แอร์ติดผนัง + ฝังฝ้า');
  });

  it('recommends a deep clean only when it helps', () => {
    expect(recommendation('', []).deep).toBe(false);
    expect(recommendation('over1y', []).deep).toBe(true);
    expect(recommendation('under6m', ['smell']).deep).toBe(true);
    expect(recommendation('under6m', ['drip', 'warm']).deep).toBe(false);
  });

  it('places a quote against the going rate', () => {
    const range = { low: 1000, mid: 1200, high: 1500, technicians: 5, reference: false };
    expect([positionOf(900, range), positionOf(1200, range), positionOf(1600, range)]).toEqual(['low', 'typical', 'high']);
  });
});
