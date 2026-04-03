import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { api } from '../api/client.js';
import { BettingList } from './BettingList.js';
import type { BetProposition, BetEntry, BettingState } from '@org/wrastlin-shared';

vi.mock('../api/client.js', () => ({
  api: {
    getMe: vi.fn(),
    getBettingState: vi.fn(),
    getPropositions: vi.fn(),
    getAllEntries: vi.fn(),
  },
}));

vi.mock('./BettingResults.js', () => ({
  BettingResults: ({ state }: { state: BettingState }) => (
    <div data-testid="betting-results">Results for week {state.week}</div>
  ),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const openState: BettingState = { week: 7, phase: 'open', openedAt: '2026-03-28T10:00:00.000Z' };
const closedState: BettingState = { ...openState, phase: 'closed', closedAt: '2026-03-28T20:00:00.000Z' };
const settledState: BettingState = { ...closedState, phase: 'settled', settledAt: '2026-03-29T10:00:00.000Z' };

const proposition: BetProposition = {
  propositionId: 'prop-1',
  week: 7,
  createdBy: 'm-001',
  statement: 'Dazzling Steve will lose to Vern',
  options: [
    { optionId: 'opt-1', label: 'Yes' },
    { optionId: 'opt-2', label: 'No' },
  ],
  createdAt: '2026-03-28T10:00:00.000Z',
};

const entries: BetEntry[] = [
  { entryId: 'e-1', propositionId: 'prop-1', bettorId: 'm-001', optionId: 'opt-1', amount: 50, placedAt: '' },
  { entryId: 'e-2', propositionId: 'prop-1', bettorId: 'm-002', optionId: 'opt-2', amount: 30, placedAt: '' },
];

function renderList() {
  return render(<MemoryRouter><BettingList /></MemoryRouter>);
}

describe('BettingList', () => {
  beforeEach(() => {
    vi.mocked(api.getMe).mockResolvedValue({ manager: { managerId: 'm-001', wrestlerId: 'w-002', money: 1000, trustLevel: 'medium', playerId: 'p-1' }, wrestler: null });
    vi.mocked(api.getPropositions).mockResolvedValue([proposition]);
    vi.mocked(api.getAllEntries).mockResolvedValue(entries);
    mockNavigate.mockReset();
  });

  it('shows loading state initially', () => {
    vi.mocked(api.getBettingState).mockResolvedValue(openState);
    renderList();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows "No active betting window" when state is null', async () => {
    vi.mocked(api.getBettingState).mockResolvedValue(null);
    renderList();
    await waitFor(() => {
      expect(screen.getByText('No active betting window')).toBeInTheDocument();
    });
  });

  it('shows proposition statement as a link', async () => {
    vi.mocked(api.getBettingState).mockResolvedValue(openState);
    renderList();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Dazzling Steve will lose to Vern' })).toBeInTheDocument();
    });
  });

  it('shows total pool per proposition', async () => {
    vi.mocked(api.getBettingState).mockResolvedValue(openState);
    renderList();
    await waitFor(() => {
      expect(screen.getByText(/Pool: \$80/)).toBeInTheDocument();
    });
  });

  it('shows per-option pool amounts', async () => {
    vi.mocked(api.getBettingState).mockResolvedValue(openState);
    renderList();
    await waitFor(() => {
      expect(screen.getByText(/Yes.*\$50/)).toBeInTheDocument();
      expect(screen.getByText(/No.*\$30/)).toBeInTheDocument();
    });
  });

  it('shows "Create Proposition" button when phase is open', async () => {
    vi.mocked(api.getBettingState).mockResolvedValue(openState);
    renderList();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Proposition' })).toBeInTheDocument();
    });
  });

  it('does NOT show "Create Proposition" button when phase is closed', async () => {
    vi.mocked(api.getBettingState).mockResolvedValue(closedState);
    renderList();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Create Proposition' })).not.toBeInTheDocument();
    });
  });

  it('navigates to /bets/new when "Create Proposition" is clicked', async () => {
    vi.mocked(api.getBettingState).mockResolvedValue(openState);
    const user = userEvent.setup();
    renderList();
    await waitFor(() => screen.getByRole('button', { name: 'Create Proposition' }));
    await user.click(screen.getByRole('button', { name: 'Create Proposition' }));
    expect(mockNavigate).toHaveBeenCalledWith('/bets/new');
  });

  it('renders BettingResults when phase is settled', async () => {
    vi.mocked(api.getBettingState).mockResolvedValue(settledState);
    renderList();
    await waitFor(() => {
      expect(screen.getByTestId('betting-results')).toBeInTheDocument();
    });
  });

  it('renders error message when getBettingState rejects', async () => {
    vi.mocked(api.getBettingState).mockRejectedValue(new Error('Server down'));
    renderList();
    await waitFor(() => {
      expect(screen.getByText('Error: Server down')).toBeInTheDocument();
    });
  });
});
