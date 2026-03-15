import type { AnnouncerScreenplayAgentFn, AnnouncerScreenplay } from '../types.js';

export const stubAnnouncerScreenplayAgent: AnnouncerScreenplayAgentFn = async (input): Promise<AnnouncerScreenplay> => {
  const playByPlay = input.announcers.find(a => a.role === 'play-by-play');
  const color = input.announcers.find(a => a.role === 'color');
  const ppName = playByPlay?.name ?? 'Announcer';
  const colorName = color?.name ?? 'Color';
  const lines = input.matchBeats.beats
    .map(b => {
      if (b.type === 'pause') return `[PAUSE: ${b.durationMs}]`;
      return `[${ppName.toUpperCase()}]: ${b.description}`;
    })
    .join('\n');
  const actorList = [playByPlay, color]
    .filter(Boolean)
    .map(a => `${a!.name} (${a!.role})`)
    .join(', ');
  return {
    segmentId: input.matchBeats.segmentId,
    actors: [
      { name: ppName, role: 'play-by-play' },
      ...(color ? [{ name: colorName, role: 'color' }] : []),
    ],
    screenplay: `${lines}\n\nACTORS: ${actorList}`,
  };
};
