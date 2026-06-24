export default function GlobalFooter() {
  return (
    <footer className="gh-footer">
      <div className="gh-footer-container">
        <div>
          &copy; {new Date().getFullYear()} SmartTriageHub, Inc.
        </div>
        <div className="gh-footer-links">
          <a href="https://arukurmi.vercel.app" target="_blank" rel="noopener noreferrer" className="gh-footer-link">Contact the Developer</a>
        </div>
      </div>
    </footer>
  );
}
