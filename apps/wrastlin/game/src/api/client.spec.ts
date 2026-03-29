import { api, ApiError } from './client.js';

describe('ApiError propagation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws ApiError with serverMessage from error body on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Insufficient funds' }),
    } as Response);

    try {
      await api.getPropositions();
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect(e).toMatchObject({ serverMessage: 'Insufficient funds', status: 400 });
    }
  });

  it('throws ApiError with generic message when error body has no error field', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    } as Response);

    await expect(api.getPropositions()).rejects.toMatchObject({
      serverMessage: 'request failed: 500',
    });
  });

  it('throws ApiError with generic message when error body fails to parse', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.reject(new Error('not json')),
    } as Response);

    await expect(api.getPropositions()).rejects.toMatchObject({
      serverMessage: 'request failed: 503',
    });
  });

  it('getBettingState returns null when server returns 404', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'No active betting window' }),
    } as Response);

    const result = await api.getBettingState();
    expect(result).toBeNull();
  });
});
