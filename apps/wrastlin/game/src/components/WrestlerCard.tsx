import type { Wrestler } from '@org/wrastlin-shared';

interface Props {
  wrestler: Wrestler;
}

export function WrestlerCard({ wrestler }: Props) {
  const { name, gimmick, stats, personality, emotionalState, managerTrust } = wrestler;

  return (
    <div style={{ border: '1px solid #ccc', padding: '1rem', borderRadius: '8px' }}>
      <h2>{name}</h2>
      <p><em>{gimmick}</em></p>

      <h3>Stats</h3>
      <ul>
        <li>Strength: {stats.strength}</li>
        <li>Agility: {stats.agility}</li>
        <li>Endurance: {stats.endurance}</li>
        <li>Charisma: {stats.charisma}</li>
      </ul>

      <h3>Personality</h3>
      <ul>
        <li>Ego: {personality.ego}/10</li>
        <li>Anger: {personality.anger}/10</li>
        <li>Honor: {personality.honor}/10</li>
        <li>Loyalty: {personality.loyalty}/10</li>
        <li>Ambition: {personality.ambition}/10</li>
      </ul>

      <h3>Emotional State</h3>
      <ul>
        <li>Confidence: {emotionalState.confidence}/10</li>
        <li>Frustration: {emotionalState.frustration}/10</li>
        <li>Fatigue: {emotionalState.fatigue}/10</li>
      </ul>

      <p><strong>Manager Trust:</strong> {managerTrust}/10</p>
    </div>
  );
}
