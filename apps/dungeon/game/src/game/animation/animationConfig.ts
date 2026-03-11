export const ANIMATION_CONFIG = {
  phases: {
    action:      { duration: 150, leadTime:  80 },
    impact:      { duration: 180, leadTime: 100 },
    consequence: { duration: 180, leadTime: 180 },
    cleanup:     { duration:  80, leadTime:  80 },
  },
} as const;
