import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';
import { CreateProposition } from './CreateProposition.js';
import type { BetProposition } from '@org/betting';

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
  createdBy: 'm-001',
  question: 'Test question',
  options: [{ optionId: 'opt-1', label: 'A' }, { optionId: 'opt-2', label: 'B' }],
  status: 'open',
  closesAt: '2026-03-20T12:00:00.000Z',
  eventKey: '1',
  createdAt: '2026-03-11T10:00:00.000Z',
};

function renderForm() {
  return render(
    <MemoryRouter>
      <CreateProposition />
    </MemoryRouter>
  );
}

describe('CreateProposition', () => {
  beforeEach(() => {
    vi.mocked(api.createProposition).mockResolvedValue(fixtureProp);
    mockNavigate.mockReset();
  });

  it('renders form with 2 option rows by default', () => {
    renderForm();
    expect(screen.getByLabelText('Option 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Option 2')).toBeInTheDocument();
  });

  it('"Add option" button appends a new row', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Add option' }));
    expect(screen.getByLabelText('Option 3')).toBeInTheDocument();
  });

  it('"Remove" button removes that option row and re-indexes remaining', async () => {
    const user = userEvent.setup();
    renderForm();
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    await user.click(removeButtons[0]); // remove first option
    // After removal: only one option remains, re-indexed as "Option 1"
    expect(screen.getByLabelText('Option 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Option 2')).not.toBeInTheDocument();
  });

  it('removing middle option re-indexes remaining options as opt-1, opt-2', async () => {
    const user = userEvent.setup();
    renderForm();
    // Add a third option first
    await user.click(screen.getByRole('button', { name: 'Add option' }));
    // Fill them
    await user.type(screen.getByLabelText('Option 1'), 'Alpha');
    await user.type(screen.getByLabelText('Option 2'), 'Beta');
    await user.type(screen.getByLabelText('Option 3'), 'Gamma');
    // Remove middle
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    await user.click(removeButtons[1]);
    // Fill required fields and submit
    await user.type(screen.getByLabelText('Question'), 'A question');
    await user.type(screen.getByLabelText('Event Key'), '1');
    await user.type(screen.getByLabelText('Closes At'), '2026-03-20T12:00');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(vi.mocked(api.createProposition)).toHaveBeenCalledWith(
        expect.objectContaining({
          options: [
            { optionId: 'opt-1', label: 'Alpha' },
            { optionId: 'opt-2', label: 'Gamma' },
          ],
        })
      );
    });
  });

  it('submit calls createProposition with correct shape', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Question'), 'Who wins?');
    await user.type(screen.getByLabelText('Event Key'), '2');
    await user.type(screen.getByLabelText('Closes At'), '2026-03-20T12:00');
    await user.type(screen.getByLabelText('Option 1'), 'Rex');
    await user.type(screen.getByLabelText('Option 2'), 'Mike');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(vi.mocked(api.createProposition)).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: 'm-001',
          question: 'Who wins?',
          eventKey: '2',
          closesAt: '2026-03-20T17:00:00.000Z',
          options: [
            { optionId: 'opt-1', label: 'Rex' },
            { optionId: 'opt-2', label: 'Mike' },
          ],
        })
      );
    });
  });

  it('navigates to /bets/:id using response.propositionId on success', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Question'), 'Test');
    await user.type(screen.getByLabelText('Event Key'), '1');
    await user.type(screen.getByLabelText('Closes At'), '2026-03-20T12:00');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/bets/new-prop-1');
    });
  });

  it('shows serverMessage on ApiError response', async () => {
    const { ApiError: Err } = await import('../api/client.js');
    vi.mocked(api.createProposition).mockRejectedValue(
      new Err('Propositions can only be created during week_open phase', 400)
    );
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Question'), 'Test');
    await user.type(screen.getByLabelText('Event Key'), '1');
    await user.type(screen.getByLabelText('Closes At'), '2026-03-20T12:00');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(
        screen.getByText('Propositions can only be created during week_open phase')
      ).toBeInTheDocument();
    });
  });

  it('shows generic error on non-ApiError failure', async () => {
    vi.mocked(api.createProposition).mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Question'), 'Test');
    await user.type(screen.getByLabelText('Event Key'), '1');
    await user.type(screen.getByLabelText('Closes At'), '2026-03-20T12:00');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });
});
