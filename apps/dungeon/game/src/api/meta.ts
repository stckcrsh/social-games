import type { MetaItemDef as ItemDef, ShopOffer, PlayerInventory, TradeOffer } from '@org/shared';

const BASE = '/api/meta';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown,
  ) {
    super(message);
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignore */ }
    throw new ApiError(res.status, `HTTP ${res.status}`, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const authApi = {
  register: (data: { username: string; password: string; displayName?: string }) =>
    apiFetch<{ playerId: string; username: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  login: (data: { username: string; password: string }) =>
    apiFetch<{ token: string; playerId: string; username: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  logout: () =>
    apiFetch<void>('/auth/logout', { method: 'POST' }),

  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    apiFetch<void>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  adminResetPassword: (data: { targetUsername: string; newPassword: string }) =>
    apiFetch<void>('/auth/admin/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export const contentApi = {
  listItemDefs: () => apiFetch<ItemDef[]>('/content/item-defs'),
  getItemDef: (defId: string) => apiFetch<ItemDef>(`/content/item-defs/${defId}`),
};

export const shopApi = {
  listOffers: () => apiFetch<ShopOffer[]>('/shop/offers'),
  purchase: (data: { offerId: string; idempotencyKey: string }) =>
    apiFetch<unknown>('/shop/purchase', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export const tradesApi = {
  propose: (data: { targetPlayerId: string; offerItems: unknown[] }) =>
    apiFetch<TradeOffer>('/trades', { method: 'POST', body: JSON.stringify(data) }),
  counter: (tradeId: string, data: { counterItems: unknown[] }) =>
    apiFetch<TradeOffer>(`/trades/${tradeId}/counter`, { method: 'POST', body: JSON.stringify(data) }),
  approve: (tradeId: string) =>
    apiFetch<TradeOffer>(`/trades/${tradeId}/approve`, { method: 'POST' }),
  cancel: (tradeId: string) =>
    apiFetch<TradeOffer>(`/trades/${tradeId}/cancel`, { method: 'POST' }),
  list: () =>
    apiFetch<{ incoming: TradeOffer[]; outgoing: TradeOffer[]; history: TradeOffer[] }>('/trades'),
  get: (tradeId: string) =>
    apiFetch<TradeOffer>(`/trades/${tradeId}`),
};

export const inventoryApi = {
  getMyInventory: () => apiFetch<PlayerInventory>('/players/me/inventory'),

  grant: (data: { playerId: string; items: unknown[] }) =>
    apiFetch<unknown>('/players/me/inventory/grant', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  burn: (data: { playerId: string; items: unknown[] }) =>
    apiFetch<unknown>('/players/me/inventory/burn', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  transfer: (data: { fromPlayerId: string; toPlayerId: string; items: unknown[] }) =>
    apiFetch<unknown>('/players/me/inventory/transfer', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
