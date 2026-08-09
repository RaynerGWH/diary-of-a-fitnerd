import { forwardRef, type ReactNode } from "react";

export const PhoneFrame = forwardRef<
  HTMLDivElement,
  { children: ReactNode; className?: string }
>(function PhoneFrame({ children, className }, ref) {
  return (
    <div ref={ref} className={`phone ${className ?? ""}`.trim()}>
      <div className="stack">{children}</div>
    </div>
  );
});
