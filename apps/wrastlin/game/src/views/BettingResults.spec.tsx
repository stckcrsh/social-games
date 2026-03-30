import { render, screen } from '@testing-library/react';
import { BettingResults } from './BettingResults.js';
import type { BetProposition, BetEntry, BettingState } from '@org/wrastlin-shared';

const state: BettingState = {
  week: 7,
  phase: 'settled',
  openedAt: '2026-03-28T10:00:00.000Z',
  settledAt: '2026-03-29T12:00:00.000Z',
};

const resolvedProp: BetProposition = {
  propositionId: 'prop-1',
  week: 7,
  createdBy: 'm-001',
  statement: 'Dazzling Steve will lose to Vern',
  options: [
    { optionId: 'opt-1', label: 'Yes' },
    { optionId: 'opt-2', label: 'No' },
  ],
  createdAt: '2026-03-28T10:00:00.000Z',
  judgement: {
    winningOptionIds: ['opt-1'],
    rationale: 'Steve was submitted in round 2.',
    confidence: 'clear',
  },
  resolvedAt: '2026-03-29T11:00:00.000Z',
};

const ambiguousProp: BetProposition = {
  ...resolvedProp,
  propositionId: 'prop-2',
  statement: 'Will there be a surprise run-in?',
  options: [
    { optionId: 'opt-a', label: 'Yes' },
    { optionId: 'opt-b', label: 'No' },
  ],
  judgement: {
    winningOptionIds: ['opt-a'],
    rationale: 'Technically yes but debatable.',
    confidence: 'ambiguous',
  },
  resolvedAt: undefined,
};

// m-001 bet $50 on opt-1 (winner). Pool: $50 + $30 = $80, all on winner side = $50.
// Payout = (50/50) * 80 = $80. Net = +$30.
const allEntries: BetEntry[] = [
  { entryId: 'e-1', propositionId: 'prop-1', bettorId: 'm-001', optionId: 'opt-1', amount: 50, placedAt: '' },
  { entryId: 'e-2', propositionId: 'prop-1', bettorId: 'm-002', optionId: 'opt-2', amount: 30, placedAt: '' },
];

const allEntriesWithAmbiguous: BetEntry[] = [
  ...allEntries,
  { entryId: 'e-3', propositionId: 'prop-2', bettorId: 'm-001', optionId: 'opt-a', amount: 25, placedAt: '' },
];

describe('BettingResults', () => {
  it('shows week number in heading', () => {
    render(<BettingResults state={state} propositions={[resolvedProp]} allEntries={allEntries} managerId="m-001" />);
    expect(screen.getByText(/Week 7/)).toBeInTheDocument();
  });

  it('shows net profit for a winning bet', () => {
    render(<BettingResults state={state} propositions={[resolvedProp]} allEntries={allEntries} managerId="m-001" />);
    expect(screen.getByText(/\+\$30/)).toBeInTheDocument();
  });

  it('shows net loss when all bets lose', () => {
    render(<BettingResults state={state} propositions={[resolvedProp]} allEntries={allEntries} managerId="m-002" />);
    expect(screen.getByText(/-\$30/)).toBeInTheDocument();
  });

  it('shows win and loss counts', () => {
    render(<BettingResults state={state} propositions={[resolvedProp]} allEntries={allEntries} managerId="m-001" />);
    expect(screen.getByText(/1 win/)).toBeInTheDocument();
    expect(screen.getByText(/0 loss/)).toBeInTheDocument();
  });

  it('shows stake and payout for a winning bet', () => {
    render(<BettingResults state={state} propositions={[resolvedProp]} allEntries={allEntries} managerId="m-001" />);
    expect(screen.getByText(/Bet \$50 on Yes → won \$80/)).toBeInTheDocument();
  });

  it('shows lost amount for a losing bet', () => {
    render(<BettingResults state={state} propositions={[resolvedProp]} allEntries={allEntries} managerId="m-002" />);
    expect(screen.getByText(/Bet \$30 on No → lost \$30/)).toBeInTheDocument();
  });

  it('shows all proposition statements', () => {
    render(<BettingResults state={state} propositions={[resolvedProp]} allEntries={allEntries} managerId="m-001" />);
    expect(screen.getByText('Dazzling Steve will lose to Vern')).toBeInTheDocument();
  });

  it('highlights winning option with "(winner)" label', () => {
    render(<BettingResults state={state} propositions={[resolvedProp]} allEntries={allEntries} managerId="m-001" />);
    expect(screen.getByText(/Yes.*winner/i)).toBeInTheDocument();
  });

  it('shows judge rationale', () => {
    render(<BettingResults state={state} propositions={[resolvedProp]} allEntries={allEntries} managerId="m-001" />);
    expect(screen.getByText('Steve was submitted in round 2.')).toBeInTheDocument();
  });

  it('shows manual review badge for ambiguous unresolved proposition', () => {
    render(<BettingResults state={state} propositions={[resolvedProp, ambiguousProp]} allEntries={allEntriesWithAmbiguous} managerId="m-001" />);
    expect(screen.getByText(/Awaiting manual review/i)).toBeInTheDocument();
  });
});
