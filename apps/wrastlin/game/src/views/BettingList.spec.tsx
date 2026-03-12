import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { api } from '../api/client.js';
import { BettingList } from './BettingList.js';
import type { BetProposition } from '@org/betting';

vi.mock('../api/client.js', () => ({
  api: { getPropositions: vi.fn() },
}));

const openProp: BetProposition = {
  propositionId: 'prop-1',
  createdBy: 'm-001',
  question: 'Who will win match 1?',
  options: [
    { optionId: 'opt-1', label: 'Rex Dominion' },
    { optionId: 'opt-2', label: 'Iron Mike' },
  ],
  status: 'open',
  closesAt: '2026-03-15T20:00:00.000Z',
  eventKey: '1',
  createdAt: '2026-03-11T10:00:00.000Z',
};

const resolvedProp: BetProposition = {
  ...openProp,
  propositionId: 'prop-2',
  question: 'Will Rex win by KO?',
  status: 'resolved',
  closesAt: '2026-03-08T20:00:00.000Z',
  winningOptionIds: ['opt-1'],
};

function renderList() {
  return render(
    <MemoryRouter>
      <BettingList />
    </MemoryRouter>
  );
}

describe('BettingList', () => {
  beforeEach(() => {
    vi.mocked(api.getPropositions).mockResolvedValue([openProp, resolvedProp]);
  });

  it('shows loading state initially', () => {
    renderList();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders proposition questions as links after load', async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Who will win match 1?' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Will Rex win by KO?' })).toBeInTheDocument();
    });
  });

  it('each question link points to /bets/:id', async () => {
    renderList();
    await waitFor(() => {
      const link = screen.getByRole('link', { name: 'Who will win match 1?' });
      expect(link).toHaveAttribute('href', '/bets/prop-1');
    });
  });

  it('shows status badge for each proposition', async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByText(/open/)).toBeInTheDocument();
      expect(screen.getByText(/resolved/)).toBeInTheDocument();
    });
  });

  it('shows closesAt formatted as en-US locale date', async () => {
    renderList();
    const expected = new Date(openProp.closesAt).toLocaleDateString('en-US');
    await waitFor(() => {
      expect(screen.getByText(expected)).toBeInTheDocument();
    });
  });

  it('shows "Create Proposition" button', async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Proposition' })).toBeInTheDocument();
    });
  });

  it('renders error message when getPropositions rejects', async () => {
    vi.mocked(api.getPropositions).mockRejectedValue(new Error('Network error'));
    renderList();
    await waitFor(() => {
      expect(screen.getByText('Error: Network error')).toBeInTheDocument();
    });
  });
});
