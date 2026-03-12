"use client";

export function LandingBackground() {
  return (
    <div
      aria-hidden
      className="landing-bg"
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      <div
        className="landing-bg-gradient"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 100% 60% at 50% -15%, rgba(15, 118, 110, 0.1), transparent 55%), radial-gradient(ellipse 70% 50% at 88% 18%, rgba(15, 118, 110, 0.06), transparent 50%)",
          animation: "landing-bg-shift 26s ease-in-out infinite alternate",
        }}
      />
      <div className="landing-bg-interactive-light" />
    </div>
  );
}
