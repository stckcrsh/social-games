import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as persistence from './persistence.js';
import { createProposition } from './propositionService.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('createProposition', () => {
  it('throws if fewer than 2 options provided', () => {
    expect(() =>
      createProposition(7, 'm-001', 'Steve loses', [{ label: 'Yes' }]),
    ).toThrow('at least 2 options');
  });

  it('assigns generated optionIds to each option', () => {
    vi.spyOn(persistence, 'loadPropositions').mockReturnValue([]);
    vi.spyOn(persistence, 'savePropositions').mockImplementation(() => {});

    const result = createProposition(7, 'm-001', 'Steve loses', [
      { label: 'Yes' },
      { label: 'No' },
    ]);

    expect(result.options).toHaveLength(2);
    expect(result.options[0].optionId).toBeDefined();
    expect(result.options[1].optionId).toBeDefined();
    expect(result.options[0].optionId).not.toBe(result.options[1].optionId);
  });

  it('appends to existing propositions and returns the new one', () => {
    const existing = [{
      propositionId: 'prop-existing', week: 7, createdBy: 'm-000',
      statement: 'Existing', options: [], createdAt: '',
    }];
    vi.spyOn(persistence, 'loadPropositions').mockReturnValue(existing);
    const saved = vi.spyOn(persistence, 'savePropositions').mockImplementation(() => {});

    const result = createProposition(7, 'm-001', 'New bet', [{ label: 'A' }, { label: 'B' }]);

    const savedArgs = saved.mock.calls[0];
    expect(savedArgs[1]).toHaveLength(2);
    expect(result.statement).toBe('New bet');
  });
});
