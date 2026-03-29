import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';
import { PropositionDetail } from './PropositionDetail.js';
import type { BetProposition, BetEntry, BettingState, Manager } from '@org/wrastlin-shared';

vi.mock('../api/client.js', () => ({
  api: {
    getBettingState: vi.fn(),
    getProposition: vi.fn(),
    getManager: vi.fn(),
    getAllEntries: vi.fn(),
    placeBet: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    serverMessage: string;
    status: number;
    constructor(msg: string, status: number) {
      super(msg);
      this.serverMessage = msg;
      this.status = status;
    }
  },
}));

const openState: BettingState = { week: 7, phase: 'open', openedAt: '2026-03-28T10:00:00.000Z' };
const closedState: BettingState = { ...openState, phase: 'closed' };

const fixtureProposition: BetProposition = {
  propositionId: 'prop-1',
  week: 7,
  createdBy: 'm-001',
  statement: 'Dazzling Steve will lose to Vern',
  options: [
    { optionId: 'opt-1', label: 'Rex Dominion' },
    { optionId: 'opt-2', label: 'Iron Mike' },
  ],
  createdAt: '2026-03-28T10:00:00.000Z',
};

const resolvedProposition: BetProposition = {
  ...fixtureProposition,
  judgement: {
    winningOptionIds: ['opt-1'],
    rationale: 'Rex won by submission.',
    confidence: 'clear',
  },
  resolvedAt: '2026-03-29T11:00:00.000Z',
};

const fixtureManager: Manager = {
  managerId: 'm-001',
  wrestlerId: 'w-002',
  money: 500,
  trustLevel: 'medium',
};

const allEntries: BetEntry[] = [
  { entryId: 'e-1', propositionId: 'prop-1', bettorId: 'm-001', optionId: 'opt-1', amount: 100, placedAt: '' },
  { entryId: 'e-2', propositionId: 'prop-1', bettorId: 'm-002', optionId: 'opt-2', amount: 50, placedAt: '' },
];

function renderDetail(propId = 'prop-1') {
  return render(
    <MemoryRouter initialEntries={[`/bets/${propId}`]}>
      <Routes>
        <Route path="/bets/:id" element={<PropositionDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PropositionDetail', () => {
  beforeEach(() => {
    vi.mocked(api.getBettingState).mockResolvedValue(openState);
    vi.mocked(api.getProposition).mockResolvedValue(fixtureProposition);
    vi.mocked(api.getManager).mockResolvedValue(fixtureManager);
    vi.mocked(api.getAllEntries).mockResolvedValue(allEntries);
    vi.mocked(api.placeBet).mockResolvedValue({
      entryId: 'e-new', propositionId: 'prop-1', bettorId: 'm-001',
      optionId: 'opt-1', amount: 25, placedAt: '',
    });
  });

  it('shows loading state initially', () => {
    renderDetail();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders proposition statement after load', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('Dazzling Steve will lose to Vern')).toBeInTheDocument();
    });
  });

  it('renders option labels with pool totals from entries', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/Rex Dominion.*\$100/)).toBeInTheDocument();
      expect(screen.getByText(/Iron Mike.*\$50/)).toBeInTheDocument();
    });
  });

  it('shows manager balance', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/Balance: \$500/)).toBeInTheDocument();
    });
  });

  it('shows my existing bets', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/You bet \$100 on Rex Dominion/)).toBeInTheDocument();
    });
  });

  it('does NOT show amount input before an option is clicked', async () => {
    renderDetail();
    await waitFor(() => screen.getByText('Dazzling Steve will lose to Vern'));
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Place Bet' })).not.toBeInTheDocument();
  });

  it('clicking an option expands its inline bet form', async () => {
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => screen.getByRole('button', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: /Rex Dominion/ }));
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Place Bet' })).toBeInTheDocument();
  });

  it('clicking the same option again collapses the form', async () => {
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => screen.getByRole('button', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: /Rex Dominion/ }));
    expect(screen.queryByRole('button', { name: 'Place Bet' })).not.toBeInTheDocument();
  });

  it('switching to another option shows only one Place Bet button', async () => {
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => screen.getByRole('button', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: /Iron Mike/ }));
    expect(screen.getAllByRole('button', { name: 'Place Bet' })).toHaveLength(1);
  });

  it('calls placeBet with managerId when submitted', async () => {
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => screen.getByRole('button', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: /Rex Dominion/ }));
    const amountInput = screen.getByRole('spinbutton');
    await user.clear(amountInput);
    await user.type(amountInput, '75');
    await user.click(screen.getByRole('button', { name: 'Place Bet' }));
    await waitFor(() => {
      expect(vi.mocked(api.placeBet)).toHaveBeenCalledWith('prop-1', {
        managerId: 'm-001',
        optionId: 'opt-1',
        amount: 75,
      });
    });
  });

  it('re-fetches proposition and entries after successful bet', async () => {
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => screen.getByRole('button', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: 'Place Bet' }));
    await waitFor(() => {
      expect(vi.mocked(api.getProposition)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(api.getAllEntries)).toHaveBeenCalledTimes(2);
    });
  });

  it('shows serverMessage on ApiError from placeBet', async () => {
    const { ApiError: Err } = await import('../api/client.js');
    vi.mocked(api.placeBet).mockRejectedValue(new Err('Insufficient funds', 422));
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => screen.getByRole('button', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: 'Place Bet' }));
    await waitFor(() => {
      expect(screen.getByText('Insufficient funds')).toBeInTheDocument();
    });
  });

  it('does NOT show clickable option buttons when phase is not open', async () => {
    vi.mocked(api.getBettingState).mockResolvedValue(closedState);
    renderDetail();
    await waitFor(() => screen.getByText('Dazzling Steve will lose to Vern'));
    expect(screen.queryByRole('button', { name: /Rex Dominion/ })).not.toBeInTheDocument();
  });

  it('shows judge rationale when proposition is resolved', async () => {
    vi.mocked(api.getProposition).mockResolvedValue(resolvedProposition);
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('Rex won by submission.')).toBeInTheDocument();
    });
  });

  it('highlights winning option when resolved', async () => {
    vi.mocked(api.getProposition).mockResolvedValue(resolvedProposition);
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/Rex Dominion.*winner/i)).toBeInTheDocument();
    });
  });

  it('renders error message when initial fetches fail', async () => {
    vi.mocked(api.getProposition).mockRejectedValue(new Error('Server down'));
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('Error: Server down')).toBeInTheDocument();
    });
  });
});
