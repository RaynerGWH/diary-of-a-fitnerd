import type { ReactNode } from "react";

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="phone">
      <div className="stack">{children}</div>
    </div>
  );
}
