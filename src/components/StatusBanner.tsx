"use client";

import { animate } from "animejs";
import { useLayoutEffect, useRef } from "react";

type StatusBannerProps = {
  variant?: "info" | "success" | "error" | "warning";
  title: string;
  message?: string;
  compact?: boolean;
  className?: string;
};

export function StatusBanner({
  variant = "info",
  title,
  message,
  compact = false,
  className = "",
}: StatusBannerProps) {
  const bannerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const banner = bannerRef.current;
    if (!banner) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const animation = animate(banner, {
      opacity: [0, 1],
      translateY: [-8, 0],
      scale: [0.985, 1],
      duration: 340,
      ease: "out(4)",
    });

    return () => {
      animation.cancel();
    };
  }, [message, title, variant]);

  return (
    <div
      ref={bannerRef}
      className={`status-banner status-banner--${variant}${compact ? " status-banner--compact" : ""}${className ? ` ${className}` : ""}`}
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
    >
      <span className="status-banner__dot" aria-hidden="true" />
      <div className="status-banner__content">
        <p className="status-banner__title">{title}</p>
        {message ? <p className="status-banner__message">{message}</p> : null}
      </div>
    </div>
  );
}
