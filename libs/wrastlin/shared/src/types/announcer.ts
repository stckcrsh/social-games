export interface Announcer {
  announcerId: string;
  name: string;
  role: 'play-by-play' | 'color';
  theme: string;        // one sentence describing voice/personality
  catchphrases: string[];
}
