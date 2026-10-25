// Ported from Rare UI's Folder component (https://rareui.com/components/foldercomponent).
// Copyright (c) 2026 Swami Malode. Used under the MIT + Commons Clause + Attribution licence in ./LICENSE.
// Rewritten for Nib with CSS transitions instead of Motion springs (no bounce), in Nib's greys,
// and the cards' lines drawn as indented code. Hover fans the cards; `open` lifts them out.
// Styles are in rareui.css.

const FLAP =
  "M0 25C0 11.1929 11.1929 0 25 0H136.084C143.044 0 149.689 2.90139 154.42 8.00608L178.08 33.5343C182.811 38.639 189.456 41.5404 196.416 41.5404H296C309.807 41.5404 321 52.7333 321 66.5404V216C321 229.807 309.807 241 296 241H25C11.1929 241 0 229.807 0 216V25Z";

// Line lengths and indents of a short program, so each card reads as a file of code.
const CODE: [number, number][][] = [
  [[0, 92], [0, 60], [14, 108], [28, 76], [28, 52], [14, 96], [0, 0], [0, 70], [14, 112], [14, 64]],
  [[0, 72], [14, 100], [14, 56], [0, 0], [0, 88], [14, 120], [28, 64], [28, 90], [0, 48], [0, 80]],
  [[0, 110], [0, 0], [0, 66], [14, 94], [28, 58], [28, 104], [14, 70], [0, 0], [0, 86], [14, 50]],
];

function Card({ lines }: { lines: [number, number][] }) {
  return (
    <svg width="164" height="214" viewBox="0 0 164 214" aria-hidden="true">
      <rect x="0.5" y="0.5" width="162" height="212" rx="19.5" className="ui-folder-card" />
      <rect x="16" y="26" width="70" height="10" rx="5" className="ui-folder-title" />
      {lines.map(([indent, width], i) =>
        width ? <rect key={i} x={16 + indent} y={54 + i * 14} width={width} height="6" rx="3" className="ui-folder-line" /> : null,
      )}
    </svg>
  );
}

export function Folder({ open = false, size = 1, label, onClick }: { open?: boolean; size?: number; label: string; onClick?: () => void }) {
  return (
    <button type="button" className="ui-folder" data-open={open} style={{ width: 321 * size, height: 270 * size }} onClick={onClick} aria-label={label}>
      <span className="ui-folder-stage" style={{ transform: `translate(-50%, -50%) scale(${size})` }}>
        <span className="ui-folder-back" />
        {CODE.map((lines, i) => (
          <span key={i} className={`ui-folder-sheet ui-folder-sheet-${i + 1}`}>
            <Card lines={lines} />
          </span>
        ))}
        <span className="ui-folder-flap">
          <span className="ui-folder-frost" style={{ clipPath: `path('${FLAP}')` }} />
          <svg width="321" height="241" viewBox="0 0 321 241" aria-hidden="true">
            <path d={FLAP} className="ui-folder-flap-fill" />
          </svg>
        </span>
      </span>
    </button>
  );
}
