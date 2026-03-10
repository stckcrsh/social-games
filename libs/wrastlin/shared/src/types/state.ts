export type WeekPhase =
  | 'week_open'
  | 'submissions_closed'
  | 'show_generated';

export interface WeeklyState {
  currentWeek: number;
  phase: WeekPhase;
  updatedAt: string; // ISO timestamp
}
