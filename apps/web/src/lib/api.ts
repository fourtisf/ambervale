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

  // A proxy in front of the API answers 502s with HTML. Parsing that blind
  // surfaced as "Unexpected token '<'", which tells a player nothing; the
  // failure is that the farm is unreachable, so say that instead.
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiRequestError(res.status, {
      error: res.ok ? 'BAD_RESPONSE' : 'SERVER_UNREACHABLE',
      message: 'The farm is not answering right now. Try again in a moment.',
    });
  }

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
  repRequired: number;
  /** What the NPC says about this order. */
  line: string;
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
  renown: number;
  title: string | null;
  handle: string;
  tutorialStep: number;
  questIndex: number;
  firstPlantDone: boolean;
  counters: Record<string, number>;
}

export interface FarmUpgradeCost {
  coins?: number;
  amber?: number;
  items?: Record<string, number>;
}

export interface FarmShopEntry {
  key: string;
  name: string;
  blurb: string;
  tier: number;
  maxTier: number;
  unlockLv: number;
  effect: string | null;
  next: { effect: string; cost: FarmUpgradeCost } | null;
}

export interface FarmEffects {
  axeBonus: number;
  pickBonus: number;
  /** Below 1 means crops grow faster. */
  growth: number;
  /** Above 1 means the market pays more. */
  sell: number;
  hens: number;
  canFish: boolean;
  canCraft: boolean;
}

export interface FarmDailyGoal {
  id: string;
  text: string;
  target: number;
  current: number;
  reward: { coins?: number; amber?: number };
  done: boolean;
}

export interface FarmDaily {
  day: number;
  resetAt: number;
  goals: FarmDailyGoal[];
  streak: number;
  allDone: boolean;
}

export interface FarmAway {
  awayMs: number;
  eggsLaid: number;
  milkReady: boolean;
  nodesRegrown: number;
  cropsReady: number;
  ordersRefreshed: number;
}

export interface FarmQuest {
  index: number;
  id: string;
  text: string;
  current: number;
  target: number;
}

export interface FarmState {
  serverNow: number;
  user: FarmUser;
  expansion: Record<string, boolean>;
  plots: FarmPlot[];
  nodes: FarmNode[];
  animals: FarmAnimal[];
  groundItems: FarmGroundItem[];
  inventory: Record<string, number>;
  seeds: Record<string, number>;
  deliverySlots: FarmDeliverySlot[];
  quest: FarmQuest | null;
  upgrades: Record<string, number>;
  shop: FarmShopEntry[];
  effects: FarmEffects;
  daily: FarmDaily;
  away: FarmAway | null;
  /**
   * Client-only: when this snapshot arrived locally. Timers extrapolate from
   * `serverNow` using this, so a browser clock that is wrong (or wound
   * forward) never makes a crop look ready early.
   */
  __receivedAt?: number;
}

export interface InviteState {
  required: boolean;
  ok: boolean;
  attemptsLeft: number | null;
}

export const fetchInvite = (): Promise<InviteState> => apiGet('/auth/invite');

export const authGuest = (): Promise<{ created: boolean; farm: FarmState }> =>
  apiPost('/auth/guest', { deviceId: getDeviceId() });

export const fetchFarm = (): Promise<FarmState> => apiGet('/farm');

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

export interface BoardRow {
  handle: string;
  title: string | null;
  level: number;
  renown: number;
  deliveries: number;
  streak: number;
  you?: boolean;
}

export interface Leaderboard {
  renown: BoardRow[];
  level: BoardRow[];
  streak: BoardRow[];
  activeToday: number;
  totalFarms: number;
  you: { handle: string; renown: number; level: number; renownRank: number | null };
}

export const fetchLeaderboard = (): Promise<Leaderboard> => apiGet('/leaderboard');

// ---------------------------------------------------------------------------
// Wallet sign-in
// ---------------------------------------------------------------------------

export type WalletOutcome = 'linked' | 'already' | 'recovered';

export interface WalletPreview {
  outcome: WalletOutcome;
  /** Present when signing would move the player to a different farm. */
  target?: { level: number; coins: number; renown: number };
  current?: { level: number; coins: number; renown: number };
}

export interface WalletSignIn {
  outcome: WalletOutcome;
  address: string;
  chainId: number;
  farm: FarmState;
}
