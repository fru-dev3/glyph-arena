// The Glyph Arena mark: the family's stick figure on office green, its head a medal
// with a "1". Same geometry as glyph-arena.svg; at 32 px and below it draws
// glyph-arena-small.svg (bolder "1", thicker lines) so it stays legible.
export function ArenaMark({ size = 28 }: { size?: number }) {
  const small = size <= 32;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Glyph Arena">
      <rect width="100" height="100" rx="22" fill="#008000" />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {small ? (
          <>
            <path d="M40 4L45 15M60 4L55 15" stroke="#fff" strokeWidth="6" />
            <circle cx="50" cy="32" r="18" fill="#fff" />
            <path d="M44 25L51 21V44" stroke="#008000" strokeWidth="7.5" />
            <path d="M22 32v3a28 28 0 0 0 56 0v-3M50 63v8M50 71L38 86M50 71L62 86" stroke="#fff" strokeWidth="9" />
          </>
        ) : (
          <>
            <path d="M42 17L47 29M58 17L53 29" stroke="#fff" strokeWidth="4" />
            <circle cx="50" cy="38" r="10" fill="#fff" />
            <path d="M47 35.2L50.8 32.5V43.5" stroke="#008000" strokeWidth="3" />
            <path d="M26 31v4a24 24 0 0 0 48 0v-4M50 59v10M50 69L39 84M50 69L61 84" stroke="#fff" strokeWidth="6" />
          </>
        )}
      </g>
    </svg>
  );
}
