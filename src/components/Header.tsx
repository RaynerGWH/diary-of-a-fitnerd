export function Header({ subtitle }: { subtitle?: string }) {
  return (
    <div>
      <div className="word">
        <u>Rayner OS</u>
      </div>
      <div className="sub">{subtitle ?? "today's build"}</div>
    </div>
  );
}
