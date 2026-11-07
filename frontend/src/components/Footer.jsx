import './SiteChrome.css'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div>
          <p className="site-footer-logo">Mothusi</p>
          <p className="site-footer-text">Helper in Setswana. An intelligent classroom colleague.</p>
        </div>
        <div>
          <p className="site-footer-text">
            Mothusi supports teachers. It does not diagnose learners, and teachers make the final decisions.
          </p>
          <p className="site-footer-text">© 2026 Mothusi. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}