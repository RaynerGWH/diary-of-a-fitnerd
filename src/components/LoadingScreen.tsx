import { PhoneFrame } from "./PhoneFrame";
import { CactusIcon } from "./Doodle";

// Next.js shows this automatically (via app/loading.tsx) the instant a
// navigation starts, for however long the destination route's data takes to
// load, so switching between home/add/entries always gives some feedback
// instead of looking like nothing happened for a second or two.
export function LoadingScreen() {
  return (
    <PhoneFrame>
      <div className="loading-screen">
        <CactusIcon size={40} className="loading-pulse" />
      </div>
    </PhoneFrame>
  );
}
