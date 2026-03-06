"use client";

import { useState } from "react";

export function DeleteAccountSection() {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        window.location.href = "/sign-in";
        return;
      }
      alert(data.error || "Failed to delete account");
    } catch {
      alert("Failed to delete account");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="card stack" style={{ borderColor: "var(--danger)", borderWidth: 1 }}>
      <h3 style={{ color: "var(--danger)" }}>Danger zone</h3>
      <p className="text-sm muted" style={{ margin: 0 }}>
        Permanently delete your account and all associated data (company profile, risk cases, mitigation plans, integrations). This cannot be undone.
      </p>
      <div className="row" style={{ gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        {confirming ? (
          <>
            <span className="text-sm">Are you sure? This cannot be undone.</span>
            <button
              type="button"
              className="btn danger btn-sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Yes, delete my account and all data"}
            </button>
            <button
              type="button"
              className="btn secondary btn-sm"
              onClick={() => setConfirming(false)}
              disabled={deleting}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn danger btn-sm"
            onClick={() => setConfirming(true)}
          >
            Delete account and all data
          </button>
        )}
      </div>
    </section>
  );
}
