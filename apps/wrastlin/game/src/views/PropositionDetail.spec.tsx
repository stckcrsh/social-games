import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';
import { PropositionDetail } from './PropositionDetail.js';
import type { BetProposition, BetPool, BetEntry } from '@org/betting';
import type { Manager } from '@org/wrastlin-shared';

vi.mock('../api/client.js', () => ({
  api: {
    getProposition: vi.fn(),
    getManager: vi.fn(),
    getMyEntries: vi.fn(),
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

const fixtureProposition: BetProposition & { pool: BetPool } = {
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
  pool: { totalPot: 150, byOption: { 'opt-1': 100, 'opt-2': 50 } },
};

const fixtureManager: Manager = {
  managerId: 'm-001',
  wrestlerId: 'w-002',
  money: 500,
  trustLevel: 'medium',
};

const fixtureEntry: BetEntry = {
  entryId: 'entry-1',
  propositionId: 'prop-1',
  bettorId: 'm-001',
  optionId: 'opt-1',
  amount: 50,
  placedAt: '2026-03-11T11:00:00.000Z',
};

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
    vi.mocked(api.getProposition).mockResolvedValue(fixtureProposition);
    vi.mocked(api.getManager).mockResolvedValue(fixtureManager);
    vi.mocked(api.getMyEntries).mockResolvedValue([]);
    vi.mocked(api.placeBet).mockResolvedValue(fixtureEntry);
  });

  it('shows loading state initially', () => {
    renderDetail();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders question and status after load', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('Who will win match 1?')).toBeInTheDocument();
      expect(screen.getByText(/Status: open/)).toBeInTheDocument();
    });
  });

  it('renders closesAt as en-US locale date', async () => {
    renderDetail();
    const expected = new Date(fixtureProposition.closesAt).toLocaleDateString('en-US');
    await waitFor(() => {
      expect(screen.getByText(new RegExp(expected))).toBeInTheDocument();
    });
  });

  it('renders option labels with pool totals', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('Rex Dominion — $100 in pool')).toBeInTheDocument();
      expect(screen.getByText('Iron Mike — $50 in pool')).toBeInTheDocument();
    });
  });

  it('shows manager balance', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('Balance: $500')).toBeInTheDocument();
    });
  });

  it('shows existing bet when manager has entry for this proposition', async () => {
    vi.mocked(api.getMyEntries).mockResolvedValue([fixtureEntry]);
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/You bet \$50 on Rex Dominion/)).toBeInTheDocument();
    });
  });

  it('does NOT show existing-bet line for entries on a different proposition', async () => {
    const otherEntry: BetEntry = { ...fixtureEntry, propositionId: 'other-prop', entryId: 'entry-2' };
    vi.mocked(api.getMyEntries).mockResolvedValue([otherEntry]);
    renderDetail();
    await waitFor(() => {
      expect(screen.queryByText(/You bet/)).not.toBeInTheDocument();
    });
  });

  it('renders bet form when status is open', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /Rex Dominion/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Place Bet' })).toBeInTheDocument();
    });
  });

  it('does NOT render bet form when status is closed', async () => {
    vi.mocked(api.getProposition).mockResolvedValue({ ...fixtureProposition, status: 'closed' });
    renderDetail();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Place Bet' })).not.toBeInTheDocument();
    });
  });

  it('does NOT render bet form when status is resolved', async () => {
    vi.mocked(api.getProposition).mockResolvedValue({
      ...fixtureProposition,
      status: 'resolved',
      winningOptionIds: ['opt-1'],
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Place Bet' })).not.toBeInTheDocument();
    });
  });

  it('calls placeBet with correct args on submit', async () => {
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => screen.getByRole('radio', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('radio', { name: /Rex Dominion/ }));
    const amountInput = screen.getByRole('spinbutton');
    await user.clear(amountInput);
    await user.type(amountInput, '75');
    await user.click(screen.getByRole('button', { name: 'Place Bet' }));
    await waitFor(() => {
      expect(vi.mocked(api.placeBet)).toHaveBeenCalledWith('prop-1', {
        bettorId: 'm-001',
        optionId: 'opt-1',
        amount: 75,
      });
    });
  });

  it('re-fetches proposition and entries after successful bet', async () => {
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => screen.getByRole('radio', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('radio', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: 'Place Bet' }));
    await waitFor(() => {
      expect(vi.mocked(api.getProposition)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(api.getMyEntries)).toHaveBeenCalledTimes(2);
    });
  });

  it('shows serverMessage on ApiError from placeBet', async () => {
    const { ApiError: Err } = await import('../api/client.js');
    vi.mocked(api.placeBet).mockRejectedValue(new Err('Insufficient funds', 400));
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => screen.getByRole('radio', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('radio', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: 'Place Bet' }));
    await waitFor(() => {
      expect(screen.getByText('Insufficient funds')).toBeInTheDocument();
    });
  });

  it('shows generic error on non-ApiError failure from placeBet', async () => {
    vi.mocked(api.placeBet).mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => screen.getByRole('radio', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('radio', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: 'Place Bet' }));
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
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
