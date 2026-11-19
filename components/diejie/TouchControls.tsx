// On-screen pad for touch devices (hidden on devices with a mouse, see the styles).
import type { MazeWall } from '../../lib/diejie/maze';

type Props = {
  onDir: (dir: MazeWall) => void;
  onLantern: () => void;
  pulsesLeft: number;
  canPulse: boolean;
};

const KEYS: Array<{ dir: MazeWall; label: string; glyph: string; area: string }> = [
  { dir: 'N', label: '向上', glyph: '▲', area: 'up' },
  { dir: 'W', label: '向左', glyph: '◀', area: 'left' },
  { dir: 'E', label: '向右', glyph: '▶', area: 'right' },
  { dir: 'S', label: '向下', glyph: '▼', area: 'down' },
];

export default function TouchControls({ onDir, onLantern, pulsesLeft, canPulse }: Props) {
  // pointerdown rather than click: no delay, and a quick second tap is not swallowed
  return (
    <div className="dj-pad" aria-label="方向键">
      <div className="dj-dpad">
        {KEYS.map(({ dir, label, glyph, area }) => (
          <button
            key={dir}
            type="button"
            aria-label={label}
            style={{ gridArea: area }}
            onPointerDown={(e) => {
              e.preventDefault();
              onDir(dir);
            }}
          >
            {glyph}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="dj-lantern"
        disabled={!canPulse}
        aria-label={`回光，还剩 ${pulsesLeft} 次`}
        onPointerDown={(e) => {
          e.preventDefault();
          onLantern();
        }}
      >
        回光
        <span>{pulsesLeft}</span>
      </button>
    </div>
  );
}
