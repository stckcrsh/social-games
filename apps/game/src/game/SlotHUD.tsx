const ICONS: Record<string, string> = {
  hammer:      '🔨',
  rivet_gun:   '🔫',
  remote_mine: '💣',
  shock_baton: '⚡',
};

interface SlotEntry {
  itemId: string | null;
  cooldown: number;
}

interface SlotHUDProps {
  slotA: SlotEntry;
  slotB: SlotEntry;
  activeSlot: 'A' | 'B';
}

export function SlotHUD({ slotA, slotB, activeSlot }: SlotHUDProps) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
      {(['A', 'B'] as const).map(slot => {
        const entry = slot === 'A' ? slotA : slotB;
        const active = activeSlot === slot;
        return (
          <div
            key={slot}
            style={{
              position: 'relative',
              width: '72px',
              padding: '0.4rem 0.5rem 0.5rem',
              background: '#1a1a2e',
              border: active ? '2px solid #00ffff' : '2px solid #333',
              boxShadow: active ? '0 0 8px #00ffff88' : 'none',
              borderRadius: '6px',
              textAlign: 'center',
              userSelect: 'none',
            }}
          >
            {/* Slot label */}
            <div style={{
              position: 'absolute',
              top: '3px',
              left: '6px',
              fontSize: '0.65rem',
              color: active ? '#00ffff' : '#555',
              fontFamily: 'monospace',
              fontWeight: 'bold',
            }}>
              {slot}{active ? '*' : ''}
            </div>

            {/* Icon */}
            <div style={{ fontSize: '1.8rem', lineHeight: 1.1, marginTop: '4px' }}>
              {entry.itemId ? (ICONS[entry.itemId] ?? '?') : '—'}
            </div>

            {/* Item name */}
            <div style={{
              fontSize: '0.7rem',
              color: entry.itemId ? '#aaa' : '#555',
              marginTop: '2px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {entry.itemId ?? 'empty'}
            </div>

            {/* Cooldown badge */}
            {entry.cooldown > 0 && (
              <div style={{
                position: 'absolute',
                bottom: '4px',
                right: '4px',
                background: '#cc330088',
                color: '#ff6666',
                fontSize: '0.6rem',
                fontFamily: 'monospace',
                padding: '1px 4px',
                borderRadius: '4px',
              }}>
                cd:{entry.cooldown}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
