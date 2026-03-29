import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';
import { CreateProposition } from './CreateProposition.js';
import type { BetProposition } from '@org/wrastlin-shared';

const mockNavigate = vi.fn();

vi.mock('../api/client.js', () => ({
  api: { createProposition: vi.fn() },
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

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const fixtureProp: BetProposition = {
  propositionId: 'new-prop-1',
  week: 7,
  createdBy: 'm-001',
  statement: 'Test statement',
  options: [{ optionId: 'opt-1', label: 'A' }, { optionId: 'opt-2', label: 'B' }],
  createdAt: '2026-03-28T10:00:00.000Z',
};

function renderForm() {
  return render(<MemoryRouter><CreateProposition /></MemoryRouter>);
}

describe('CreateProposition', () => {
  beforeEach(() => {
    vi.mocked(api.createProposition).mockResolvedValue(fixtureProp);
    mockNavigate.mockReset();
  });

  it('renders Statement input', () => {
    renderForm();
    expect(screen.getByLabelText('Statement')).toBeInTheDocument();
  });

  it('does NOT render Closes At or Event Key inputs', () => {
    renderForm();
    expect(screen.queryByLabelText('Closes At')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Event Key')).not.toBeInTheDocument();
  });

  it('renders 2 option rows by default', () => {
    renderForm();
    expect(screen.getByLabelText('Option 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Option 2')).toBeInTheDocument();
  });

  it('"Add option" appends a new row', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Add option' }));
    expect(screen.getByLabelText('Option 3')).toBeInTheDocument();
  });

  it('"Remove" removes that option row', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(screen.getByLabelText('Option 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Option 2')).not.toBeInTheDocument();
  });

  it('submit calls createProposition with correct shape', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Statement'), 'Steve will lose');
    await user.type(screen.getByLabelText('Option 1'), 'Yes');
    await user.type(screen.getByLabelText('Option 2'), 'No');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(vi.mocked(api.createProposition)).toHaveBeenCalledWith({
        managerId: 'm-001',
        statement: 'Steve will lose',
        options: [{ label: 'Yes' }, { label: 'No' }],
      });
    });
  });

  it('navigates to /bets/:id on success', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Statement'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/bets/new-prop-1');
    });
  });

  it('shows serverMessage on ApiError', async () => {
    const { ApiError: Err } = await import('../api/client.js');
    vi.mocked(api.createProposition).mockRejectedValue(new Err('Betting window is not open', 409));
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Statement'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(screen.getByText('Betting window is not open')).toBeInTheDocument();
    });
  });

  it('shows generic error on non-ApiError failure', async () => {
    vi.mocked(api.createProposition).mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Statement'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });
});
