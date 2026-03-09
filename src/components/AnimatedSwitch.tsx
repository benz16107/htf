"use client";

import { animate } from "animejs";
import { useLayoutEffect, useMemo, useRef } from "react";

type AnimatedSwitchProps = {
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  width?: number;
  height?: number;
  onColor: string;
  offColor: string;
  className?: string;
};

export function AnimatedSwitch({
  checked,
  disabled = false,
  onClick,
  title,
  width = 56,
  height = 30,
  onColor,
  offColor,
  className,
}: AnimatedSwitchProps) {
  const trackRef = useRef<HTMLButtonElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const trackAnimationRef = useRef<ReturnType<typeof animate> | null>(null);
  const thumbAnimationRef = useRef<ReturnType<typeof animate> | null>(null);
  const thumbSize = useMemo(() => height - 8, [height]);
  const travel = useMemo(() => width - thumbSize - 8, [thumbSize, width]);

  useLayoutEffect(() => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb) return;

    trackAnimationRef.current?.cancel();
    thumbAnimationRef.current?.cancel();

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      track.style.backgroundColor = checked ? onColor : offColor;
      thumb.style.transform = `translateX(${checked ? travel : 0}px)`;
      return;
    }

    track.style.willChange = "background-color";
    thumb.style.willChange = "transform";

    trackAnimationRef.current = animate(track, {
      backgroundColor: checked ? onColor : offColor,
      duration: 260,
      ease: "out(3)",
      onComplete: () => {
        track.style.willChange = "";
      },
    });

    thumbAnimationRef.current = animate(thumb, {
      translateX: checked ? travel : 0,
      duration: 420,
      ease: "out(4)",
      onComplete: () => {
        thumb.style.willChange = "";
      },
    });

    return () => {
      trackAnimationRef.current?.cancel();
      thumbAnimationRef.current?.cancel();
    };
  }, [checked, offColor, onColor, travel]);

  return (
    <button
      ref={trackRef}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={className}
      style={{
        width,
        height,
        borderRadius: height / 2,
        border: `2px solid ${checked ? onColor : "var(--border)"}`,
        background: checked ? onColor : offColor,
        cursor: disabled ? "not-allowed" : "pointer",
        position: "relative",
        flexShrink: 0,
        padding: 0,
        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
      }}
    >
      <span
        ref={thumbRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 2,
          left: 2,
          width: thumbSize,
          height: thumbSize,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "var(--shadow-sm)",
          transform: `translateX(${checked ? travel : 0}px)`,
        }}
      />
    </button>
  );
}
