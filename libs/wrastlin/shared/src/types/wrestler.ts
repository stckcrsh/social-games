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
  managerTrust: number; // 1-10
  finisher: string;
}
