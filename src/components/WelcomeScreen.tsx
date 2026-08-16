"use client";

import { Fragment, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { animate, stagger } from "animejs";
import { CactusIcon } from "./Doodle";
import { PhoneFrame } from "./PhoneFrame";

const GREETING = "Welcome back, Rayner.";
const WORDS = GREETING.split(" ");

export function WelcomeScreen({ next }: { next: string }) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLHeadingElement>(null);
  const enterRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!textRef.current || !enterRef.current) return;

    const chars = textRef.current.querySelectorAll<HTMLSpanElement>(".ws-char");
    animate(chars, {
      opacity: [0, 1],
      translateY: [8, 0],
      duration: 380,
      delay: stagger(32),
      ease: "outQuad",
      onComplete: () => {
        textRef.current?.classList.add("done-typing");
        animate(enterRef.current!, {
          opacity: [0, 1],
          translateY: [10, 0],
          duration: 450,
          ease: "outQuad",
        });
      },
    });
  }, []);

  function handleEnter() {
    document.cookie = "welcomed=1; path=/";
    if (!cardRef.current) {
      router.push(next);
      return;
    }
    animate(cardRef.current, {
      opacity: [1, 0],
      duration: 250,
      ease: "inQuad",
      onComplete: () => router.push(next),
    });
  }

  return (
    <PhoneFrame ref={cardRef} className="phone-welcome">
      <CactusIcon size={40} />
      {/* Grouped by word, not one flat run of characters. Each character needs
          its own box to be staggered, and a run of loose character boxes gives
          the browser a break opportunity between every pair of them, so a long
          name wraps down the middle of itself. Keeping a word's characters
          inside a nowrap span confines breaks to the real spaces between
          words, which are ordinary text nodes here and so still render. */}
      <h1 className="ws-greeting" ref={textRef}>
        {WORDS.map((word, wordIndex) => (
          <Fragment key={wordIndex}>
            <span className="ws-word">
              {[...word].map((char, charIndex) => (
                <span className="ws-char" key={charIndex}>
                  {char}
                </span>
              ))}
            </span>
            {wordIndex < WORDS.length - 1 ? " " : null}
          </Fragment>
        ))}
        <span className="ws-cursor" aria-hidden="true" />
      </h1>
      <button ref={enterRef} type="button" className="ws-enter" onClick={handleEnter}>
        Enter
      </button>
    </PhoneFrame>
  );
}
