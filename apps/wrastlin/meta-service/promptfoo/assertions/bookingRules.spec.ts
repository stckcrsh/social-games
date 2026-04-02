import { describe, it, expect } from 'vitest';
import bookingRules from './bookingRules.mjs';

// Minimal valid show outline
const validShow = {
  showId: '550e8400-e29b-41d4-a716-446655440000',
  week: 1,
  segments: [
    {
      segmentId: 'seg-001',
      order: 1,
      type: 'promo',
      participants: ['w-001'],
      goal: 'hype self',
    },
    {
      segmentId: 'seg-002',
      order: 2,
      type: 'match',
      matchType: 'singles',
      participants: [['w-003'], ['w-004']],
      interference: [],
      headliner: false,
    },
    {
      segmentId: 'seg-003',
      order: 3,
      type: 'match',
      matchType: 'singles',
      participants: [['w-001'], ['w-002']],
      interference: [],
      headliner: true,
    },
  ],
};

function output(show: object): string {
  return JSON.stringify(show);
}

describe('bookingRules assertion', () => {
  it('passes a valid show outline', () => {
    const result = bookingRules(output(validShow), { vars: {} });
    expect(result.pass).toBe(true);
  });

  it('strips markdown fences before parsing', () => {
    const fenced = '```json\n' + output(validShow) + '\n```';
    const result = bookingRules(fenced, { vars: {} });
    expect(result.pass).toBe(true);
  });

  it('fails when output is not valid JSON', () => {
    const result = bookingRules('not json at all', { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/not valid JSON/i);
  });

  it('fails when showId is missing', () => {
    const show = { ...validShow, showId: undefined };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/showId/i);
  });

  it('fails when week is not a number', () => {
    const show = { ...validShow, week: '1' };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/week/i);
  });

  it('fails when segment count is below 3', () => {
    const show = { ...validShow, segments: validShow.segments.slice(0, 2) };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/3.5 segments/i);
  });

  it('fails when segment count exceeds 5', () => {
    const extraSegment = { ...validShow.segments[1], segmentId: 'seg-extra', order: 4, participants: [['w-005'], ['w-006']] };
    const extraSegment2 = { ...validShow.segments[1], segmentId: 'seg-extra2', order: 5, participants: [['w-007'], ['w-008']] };
    const extraSegment3 = { ...validShow.segments[1], segmentId: 'seg-extra3', order: 6, participants: [['w-009'], ['w-010']] };
    const show = { ...validShow, segments: [...validShow.segments, extraSegment, extraSegment2, extraSegment3] };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/3.5 segments/i);
  });

  it('fails when there are no promos', () => {
    const show = {
      ...validShow,
      segments: [
        { segmentId: 'seg-001', order: 1, type: 'match', matchType: 'singles', participants: [['w-003'], ['w-004']], interference: [], headliner: false },
        { segmentId: 'seg-002', order: 2, type: 'match', matchType: 'singles', participants: [['w-005'], ['w-006']], interference: [], headliner: false },
        { segmentId: 'seg-003', order: 3, type: 'match', matchType: 'singles', participants: [['w-001'], ['w-002']], interference: [], headliner: true },
      ],
    };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/promo/i);
  });

  it('fails when there is only one match', () => {
    const show = {
      ...validShow,
      segments: [
        { segmentId: 'seg-001', order: 1, type: 'promo', participants: ['w-001'], goal: 'hype' },
        { segmentId: 'seg-002', order: 2, type: 'promo', participants: ['w-002'], goal: 'hype' },
        { segmentId: 'seg-003', order: 3, type: 'match', matchType: 'singles', participants: [['w-001'], ['w-002']], interference: [], headliner: true },
      ],
    };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/2 match/i);
  });

  it('fails when there is no headliner', () => {
    const show = {
      ...validShow,
      segments: validShow.segments.map(s =>
        s.type === 'match' ? { ...s, headliner: false } : s,
      ),
    };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/headliner/i);
  });

  it('fails when there are two headliners', () => {
    const show = {
      ...validShow,
      segments: validShow.segments.map(s =>
        s.type === 'match' ? { ...s, headliner: true } : s,
      ),
    };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/headliner/i);
  });

  it('fails when headliner is not the last segment', () => {
    const show = {
      ...validShow,
      segments: [
        { segmentId: 'seg-001', order: 1, type: 'match', matchType: 'singles', participants: [['w-001'], ['w-002']], interference: [], headliner: true },
        { segmentId: 'seg-002', order: 2, type: 'promo', participants: ['w-003'], goal: 'hype' },
        { segmentId: 'seg-003', order: 3, type: 'match', matchType: 'singles', participants: [['w-004'], ['w-005']], interference: [], headliner: false },
      ],
    };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/last segment/i);
  });

  it('fails when match participants is a flat array instead of array-of-arrays', () => {
    const show = {
      ...validShow,
      segments: validShow.segments.map(s =>
        s.segmentId === 'seg-003'
          ? { ...s, participants: ['w-001', 'w-002'] }  // flat — wrong format
          : s,
      ),
    };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/array-of-arrays/i);
  });

  it('fails when a wrestler appears in two matches', () => {
    const show = {
      ...validShow,
      segments: [
        validShow.segments[0], // promo
        { segmentId: 'seg-002', order: 2, type: 'match', matchType: 'singles', participants: [['w-001'], ['w-003']], interference: [], headliner: false },
        { segmentId: 'seg-003', order: 3, type: 'match', matchType: 'singles', participants: [['w-001'], ['w-002']], interference: [], headliner: true }, // w-001 again
      ],
    };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/multiple matches/i);
  });
});
