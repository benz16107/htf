"use client";

import { useState } from "react";

export function ConfirmSetupButton() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form action="/api/setup/complete" method="post" onSubmit={() => setIsSubmitting(true)}>
      <button className="btn primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Entering dashboard…" : "Confirm & enter dashboard"}
      </button>
    </form>
  );
}
