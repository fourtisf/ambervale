/**
 * Typed client for the AMBERVALE API.
 *
 * The server is authoritative, so every call here returns fresh state rather
 * than a bare acknowledgement — the client's job is to render what it is told,
 * never to compute a balance for itself.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4021';

const DEVICE_KEY = 'ambervale.deviceId';

/**
 * A stable per-browser id. Survives cookie clearing, which is what lets a
 * player get their farm back without ever creating an account.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = window.localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export interface ApiErrorShape {
  error: string;
  message: string;
  [key: string]: unknown;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly payload: ApiErrorShape;

  constructor(status: number, payload: ApiErrorShape) {
    super(payload.message ?? 'Request failed');
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = payload.error ?? 'UNKNOWN';
    this.payload = payload;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    // The session lives in an httpOnly cookie; it must ride along cross-origin.
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      'x-device-id': getDeviceId(),
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : {};

  if (!res.ok) throw new ApiRequestError(res.status, body as ApiErrorShape);
  return body as T;
}

export const apiGet = <T>(path: string): Promise<T> => request<T>(path, { method: 'GET' });

export const apiPost = <T>(path: string, body?: unknown): Promise<T> =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

export const apiPatch = <T>(path: string, body?: unknown): Promise<T> =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });

// ---------------------------------------------------------------------------
// Farm state
// ---------------------------------------------------------------------------

export interface FarmPlot {
  index: number;
  zone: string;
  cropKey: string | null;
  plantedAt: number | null;
  fast: boolean;
  readyAt: number | null;
}

export interface FarmNode {
  index: number;
  kind: string;
  hp: number;
  respawnAt: number | null;
}

export interface FarmAnimal {
  index: number;
  kind: string;
  nextYieldAt: number;
  ready: boolean;
}

export interface FarmGroundItem {
  id: string;
  itemKey: string;
  x: number;
  y: number;
}

export interface FarmDeliverySlot {
  slot: number;
  state: string;
  itemKey: string | null;
  qty: number | null;
  amber: number | null;
  npc: number;
  refillAt: number | null;
  unlocked: boolean;
}

export interface FarmUser {
  id: string;
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNext: number;
  coins: number;
  rep: number;
  amberBalance: number;
  tutorialStep: number;
  questIndex: number;
  firstPlantDone: boolean;
  counters: Record<string, number>;
}

export interface FarmState {
  serverNow: number;
  user: FarmUser;
  expansion: { north: boolean };
  plots: FarmPlot[];
  nodes: FarmNode[];
  animals: FarmAnimal[];
  groundItems: FarmGroundItem[];
  inventory: Record<string, number>;
  seeds: Record<string, number>;
  deliverySlots: FarmDeliverySlot[];
}

export const authGuest = (): Promise<{ created: boolean; farm: FarmState }> =>
  apiPost('/auth/guest', { deviceId: getDeviceId() });

export const fetchFarm = (): Promise<FarmState> => apiGet('/farm');
