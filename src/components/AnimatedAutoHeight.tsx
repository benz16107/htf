"use client";

import { animate } from "animejs";
import { useLayoutEffect, useRef } from "react";

type AnimatedAutoHeightProps = {
  open: boolean;
  children: React.ReactNode;
  className?: string;
};

export function AnimatedAutoHeight({ open, children, className }: AnimatedAutoHeightProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);
  const initialRef = useRef(true);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    animationRef.current?.cancel();
    outer.style.overflow = "hidden";

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      outer.style.height = open ? "auto" : "0px";
      outer.style.opacity = open ? "1" : "0";
      initialRef.current = false;
      return;
    }

    if (initialRef.current) {
      outer.style.height = open ? "auto" : "0px";
      outer.style.opacity = open ? "1" : "0";
      initialRef.current = false;
      return;
    }

    const fromHeight = outer.getBoundingClientRect().height;
    const toHeight = open ? inner.getBoundingClientRect().height : 0;

    outer.style.height = `${fromHeight}px`;
    outer.style.willChange = "height, opacity";

    animationRef.current = animate(outer, {
      height: [fromHeight, toHeight],
      opacity: open ? [0.45, 1] : [1, 0],
      duration: open ? 360 : 240,
      ease: open ? "out(4)" : "inOut(2)",
      onComplete: () => {
        outer.style.height = open ? "auto" : "0px";
        outer.style.opacity = open ? "1" : "0";
        outer.style.willChange = "";
      },
    });

    return () => {
      animationRef.current?.cancel();
    };
  }, [open]);

  return (
    <div ref={outerRef} className={className} aria-hidden={!open}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
