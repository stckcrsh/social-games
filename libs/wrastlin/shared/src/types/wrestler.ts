export interface Relationship {
  wrestlerId: string;
  hatred: number;   // 1-10
  respect: number;  // 1-10
  trust: number;    // 1-10
}

export type MemoryType = 'humiliation' | 'betrayal' | 'victory' | 'injury' | 'promo';

export interface Memory {
  memoryId: string;
  type: MemoryType;
  source: string;   // wrestlerId or 'manager'
  target: string;
  week: number;
  intensity: number; // 1-10
}

export interface WrestlerStats {
  strength: number;   // 1-100
  agility: number;
  endurance: number;
  charisma: number;
}

export interface WrestlerPersonality {
  ego: number;        // 1-10
  anger: number;
  honor: number;
  loyalty: number;
  ambition: number;
}

export interface WrestlerEmotions {
  confidence: number; // 1-10
  frustration: number;
  fatigue: number;
}

export interface Wrestler {
  wrestlerId: string;
  name: string;
  gimmick: string;
  stats: WrestlerStats;
  personality: WrestlerPersonality;
  emotionalState: WrestlerEmotions;
  relationships: Relationship[];
  memories: Memory[];
  managerTrust: number; // 1-10
}
