"use client";

import Link from "next/link";

export function OverviewActivityHead() {
  return (
    <div className="overview-activity__head">
      <div className="stack-xs">
        <h3 className="overview-activity__title">Latest run</h3>
      </div>
      <Link href="/dashboard/logs" className="btn secondary btn-sm">
        <span className="material-symbols-rounded btn__icon" aria-hidden>
          smart_toy
        </span>
        Autonomous agent
      </Link>
    </div>
  );
}
