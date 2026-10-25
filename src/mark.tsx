// The Glyph Arena mark: the family's petroglyph figure beside a podium, the winner's
// step lit in the family's light green. Same geometry as assets/family/build.py "arena".
export function ArenaMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Glyph Arena">
      <rect width="100" height="100" rx="22" fill="#008000" />
      <g transform="translate(10 10) scale(.8)" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="26" cy="17" r="8" fill="#fff" stroke="none" />
        <path d="M9 22v4a17 17 0 0 0 34 0v-4M26 43v21M26 64 15 89M26 64l11 25" strokeWidth="7" />
        <path d="M52 87V67h13V52h16v22h13v13Z" strokeWidth="6" strokeOpacity=".78" />
        <circle cx="73" cy="38" r="6.5" fill="#b9f0b0" stroke="none" />
      </g>
    </svg>
  );
}
