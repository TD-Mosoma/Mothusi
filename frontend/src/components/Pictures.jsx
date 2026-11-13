// The nine pictures young learners use as a password. Drawn here so they look the same on every device.
// Keep the names in step with PICTURES in backend/storage/auth.py.
const INK = '#124A4F'

const ART = {
  sun: (
    <>
      <g stroke="#E8A21C" strokeWidth="5" strokeLinecap="round">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line key={a} x1="32" y1="6" x2="32" y2="14" transform={`rotate(${a} 32 32)`} />
        ))}
      </g>
      <circle cx="32" cy="32" r="13" fill="#F5B940" stroke={INK} strokeWidth="2.5" />
    </>
  ),
  tree: (
    <>
      <rect x="28" y="38" width="8" height="20" rx="2" fill="#9A5B2E" stroke={INK} strokeWidth="2.5" />
      <circle cx="32" cy="26" r="18" fill="#3FA06B" stroke={INK} strokeWidth="2.5" />
      <circle cx="25" cy="22" r="4" fill="#7CCB97" />
    </>
  ),
  ball: (
    <>
      <circle cx="32" cy="32" r="22" fill="#EE7A36" stroke={INK} strokeWidth="2.5" />
      <path d="M10 32h44M32 10c-9 7-9 37 0 44M32 10c9 7 9 37 0 44" fill="none" stroke={INK} strokeWidth="2.5" />
    </>
  ),
  cat: (
    <>
      <path d="M14 20 18 6l10 10h8l10-10 4 14v14c0 12-9 20-18 20S14 46 14 34z" fill="#B7B9C2" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="25" cy="30" r="3" fill={INK} />
      <circle cx="39" cy="30" r="3" fill={INK} />
      <path d="M29 38h6l-3 3z" fill="#EE7A36" />
      <path d="M20 40h-8M20 44h-7M44 40h8M44 44h7" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  fish: (
    <>
      <path d="M8 32c8-14 30-16 40 0-10 16-32 14-40 0z" fill="#4FA8E0" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M48 32 58 22v20z" fill="#4FA8E0" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="20" cy="29" r="3" fill={INK} />
    </>
  ),
  star: (
    <path d="M32 6l7.6 16.4 17.9 2-13.3 12.2 3.7 17.7L32 45.3 16.1 54.3l3.7-17.7L6.5 24.4l17.9-2z"
      fill="#F5B940" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
  ),
  car: (
    <>
      <path d="M8 40v-8l6-12h28l8 12h6v8z" fill="#E0524A" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M17 22h10v10H13zM31 22h10l6 10H31z" fill="#CFEFFB" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="19" cy="42" r="6" fill="#2D3436" stroke={INK} strokeWidth="2" />
      <circle cx="45" cy="42" r="6" fill="#2D3436" stroke={INK} strokeWidth="2" />
    </>
  ),
  apple: (
    <>
      <path d="M32 20c-6-5-20-3-20 12 0 12 9 22 15 22 2 0 3-1 5-1s3 1 5 1c6 0 15-10 15-22 0-15-14-17-20-12z"
        fill="#D93F3F" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M32 20c0-6 2-10 5-12" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path d="M35 14c4-5 10-5 12-3-3 4-8 5-12 3z" fill="#3FA06B" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
    </>
  ),
  house: (
    <>
      <path d="M12 30 32 12l20 18" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 28h32v26H16z" fill="#F7E3C6" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M12 30 32 12l20 18z" fill="#2A9D9B" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="28" y="38" width="9" height="16" fill="#9A5B2E" stroke={INK} strokeWidth="2" />
      <rect x="19" y="34" width="6" height="6" fill="#CFEFFB" stroke={INK} strokeWidth="2" />
    </>
  ),
}

export const PICTURES = ['sun', 'tree', 'ball', 'cat', 'fish', 'star', 'car', 'apple', 'house']
export const PICTURE_LABELS = {
  sun: 'Sun', tree: 'Tree', ball: 'Ball', cat: 'Cat', fish: 'Fish', star: 'Star', car: 'Car', apple: 'Apple', house: 'House',
}

export function Picture({ name, size = 64 }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false">
      {ART[name]}
    </svg>
  )
}
