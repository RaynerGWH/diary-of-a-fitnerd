import { CactusIcon } from "./Doodle";

// Picked fresh on every render (this is a Server Component, so that just
// means "every time the home screen loads") instead of a static wordmark,
// so it reads like someone's actually on the other end.
const GREETINGS = [
  "Hey Rayner!",
  "Yo, rg.",
  "Look who's back.",
  "Alright rg, let's see it.",
  "Rayner. Good to see you.",
  "Ready when you are, Rayner.",
  "Let's get into it.",
  "Back again, nice.",
  "Hey hey, rg.",
];

export function HomeGreeting() {
  const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  return (
    <div className="home-greeting-row">
      <CactusIcon size={28} />
      <div className="home-greeting">{greeting}</div>
    </div>
  );
}
