"use client";

import { animate } from "animejs";
import { useEffect, useRef, useState } from "react";

type AnimatedCounterProps = {
  value: number;
  className?: string;
};

export function AnimatedCounter({ value, className }: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const currentValueRef = useRef(0);
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    animationRef.current?.cancel();

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      currentValueRef.current = value;
      setDisplayValue(Math.round(value));
      return;
    }

    const state = { value: currentValueRef.current };
    animationRef.current = animate(state, {
      value,
      duration: 900,
      ease: "out(4)",
      round: 1,
      onUpdate: () => {
        setDisplayValue(Math.round(state.value));
      },
      onComplete: () => {
        currentValueRef.current = value;
        setDisplayValue(Math.round(value));
      },
    });

    return () => {
      animationRef.current?.cancel();
    };
  }, [value]);

  return (
    <span className={className} suppressHydrationWarning>
      {displayValue}
    </span>
  );
}
