"use client";

import { animate, createScope, stagger } from "animejs";
import { useLayoutEffect, useRef } from "react";

type AnimeStaggerProps = {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  itemSelector?: string;
  delayStep?: number;
  duration?: number;
  translateY?: number;
  scale?: number;
  play?: boolean;
  playKey?: string | number | boolean | null;
};

export function AnimeStagger({
  children,
  className,
  style,
  itemSelector = "[data-animate-item]",
  delayStep = 70,
  duration = 520,
  translateY = 18,
  scale = 0.985,
  play = true,
  playKey,
}: AnimeStaggerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<ReturnType<typeof createScope> | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !play) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    scopeRef.current?.revert();
    scopeRef.current = createScope({ root }).add(() => {
      const items = root.querySelectorAll<HTMLElement>(itemSelector);
      if (items.length === 0) return;

      items.forEach((item) => {
        item.style.willChange = "transform, opacity";
      });

      animate(items, {
        opacity: [0, 1],
        translateY: [translateY, 0],
        scale: [scale, 1],
        delay: stagger(delayStep),
        duration,
        ease: "out(4)",
        onComplete: () => {
          items.forEach((item) => {
            item.style.willChange = "";
          });
        },
      });
    });

    return () => scopeRef.current?.revert();
  }, [delayStep, duration, itemSelector, play, playKey, scale, translateY]);

  return (
    <div ref={rootRef} className={className} style={style}>
      {children}
    </div>
  );
}
