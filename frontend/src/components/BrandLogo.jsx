import mark from '../assets/logo-mark.webp'
import word from '../assets/logo-word.webp'
import full from '../assets/logo-full.webp'

// The Mothusi logo. "lockup" (robot + wordmark side by side) for top bars, "full" (stacked) for
// sign-in pages and the landing page, "mark" (robot only) where space is tight.
export default function BrandLogo({ variant = 'lockup', className = '' }) {
  if (variant === 'full') return <img className={`brand-full ${className}`} src={full} alt="Mothusi" />
  if (variant === 'mark') return <img className={`brand-mark ${className}`} src={mark} alt="Mothusi" />
  return (
    <span className={`brand-lockup ${className}`}>
      <img className="brand-lockup-mark" src={mark} alt="" aria-hidden="true" />
      <img className="brand-lockup-word" src={word} alt="Mothusi" />
    </span>
  )
}
