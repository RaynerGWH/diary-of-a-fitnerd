import { forwardRef, type ReactNode } from "react";

export const PhoneFrame = forwardRef<
  HTMLDivElement,
  { children: ReactNode; nav?: ReactNode; className?: string }
>(function PhoneFrame({ children, nav, className }, ref) {
  return (
    <div ref={ref} className={`phone ${className ?? ""}`.trim()}>
      <div className="stack">{children}</div>
      {nav}
    </div>
  );
});
