import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as bettingPersistence from './persistence.js';
import * as gamePersistence from '../data/persistence.js';
import { placeEntry } from './entryService.js';
import type { BetProposition, Manager } from '@org/wrastlin-shared';

const proposition: BetProposition = {
  propositionId: 'prop-1',
  week: 7,
  createdBy: 'm-001',
  statement: 'Steve loses',
  options: [
    { optionId: 'opt-a', label: 'Steve wins' },
    { optionId: 'opt-b', label: 'Steve loses' },
  ],
  createdAt: '2026-03-28T10:00:00.000Z',
};

const manager: Manager = {
  managerId: 'm-002',
  wrestlerId: 'w-001',
  money: 500,
  trustLevel: 'medium',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('placeEntry', () => {
  it('deducts amount from manager balance and saves entry', () => {
    vi.spyOn(bettingPersistence, 'loadPropositions').mockReturnValue([proposition]);
    vi.spyOn(bettingPersistence, 'loadEntries').mockReturnValue([]);
    vi.spyOn(bettingPersistence, 'saveEntries').mockImplementation(() => {});
    vi.spyOn(gamePersistence, 'readJsonOrDefault').mockReturnValue([manager]);
    const saveManagers = vi.spyOn(gamePersistence, 'writeDynamicJson').mockImplementation(() => {});

    placeEntry(7, 'prop-1', 'm-002', 'opt-a', 100);

    expect(saveManagers).toHaveBeenCalledWith(
      'managers.json',
      expect.arrayContaining([
        expect.objectContaining({ managerId: 'm-002', money: 400 }),
      ]),
    );
  });

  it('throws if manager has insufficient funds', () => {
    vi.spyOn(bettingPersistence, 'loadPropositions').mockReturnValue([proposition]);
    vi.spyOn(gamePersistence, 'readJsonOrDefault').mockReturnValue([{ ...manager, money: 50 }]);

    expect(() => placeEntry(7, 'prop-1', 'm-002', 'opt-a', 100)).toThrow('Insufficient funds');
  });

  it('throws if proposition does not exist', () => {
    vi.spyOn(bettingPersistence, 'loadPropositions').mockReturnValue([]);
    vi.spyOn(gamePersistence, 'readJsonOrDefault').mockReturnValue([manager]);

    expect(() => placeEntry(7, 'prop-999', 'm-002', 'opt-a', 100)).toThrow('Proposition not found');
  });

  it('throws if option does not exist on proposition', () => {
    vi.spyOn(bettingPersistence, 'loadPropositions').mockReturnValue([proposition]);
    vi.spyOn(gamePersistence, 'readJsonOrDefault').mockReturnValue([manager]);

    expect(() => placeEntry(7, 'prop-1', 'm-002', 'opt-z', 100)).toThrow('Option not found');
  });
});
