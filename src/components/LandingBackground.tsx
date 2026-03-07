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
      {/* Animated gradient base */}
      <div
        className="landing-bg-gradient"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 120% 80% at 50% -20%, rgba(13, 148, 136, 0.16), transparent 50%), radial-gradient(ellipse 80% 60% at 80% 30%, rgba(13, 148, 136, 0.09), transparent 45%)",
          animation: "landing-bg-shift 18s ease-in-out infinite alternate",
        }}
      />
      {/* Drifting orbs */}
      {[
        { size: 320, duration: 22, delay: 0 },
        { size: 280, duration: 26, delay: -5 },
        { size: 240, duration: 20, delay: -10 },
        { size: 200, duration: 24, delay: -2 },
      ].map((orb, i) => (
        <div
          key={i}
          className="landing-bg-orb"
          style={{
            width: orb.size,
            height: orb.size,
            animation: `landing-orb-drift ${orb.duration}s ease-in-out infinite`,
            animationDelay: `${orb.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
