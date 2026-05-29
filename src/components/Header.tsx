export function Header({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-end justify-between">
      <div>
        <div className="word">
          <u>Fitnerds!</u>
        </div>
        <div className="sub">{subtitle ?? "rayner + ada · stronger together"}</div>
      </div>
      <div className="you">
        <span className="dot-i" style={{ background: "var(--rayner)" }} />
        <span className="dot-i" style={{ background: "var(--ada)" }} />
      </div>
    </div>
  );
}
