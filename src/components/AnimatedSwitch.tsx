"use client";

import { useMemo } from "react";

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
  const thumbSize = useMemo(() => Math.max(14, height - 8), [height]);
  const travel = useMemo(() => width - thumbSize - 8, [thumbSize, width]);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={["m3-switch", className].filter(Boolean).join(" ")}
      style={{
        ["--m3-switch-track-on" as string]: onColor,
        ["--m3-switch-track-off" as string]: offColor,
        ["--m3-switch-thumb-size" as string]: `${thumbSize}px`,
        ["--m3-switch-thumb-travel" as string]: `${travel}px`,
        width,
        height,
      }}
    >
      <span
        className="m3-switch__thumb"
        aria-hidden="true"
      />
    </button>
  );
}
