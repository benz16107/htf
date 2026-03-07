"use client";

import { useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";

export function DeleteAccountSection() {
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteConfirm = async () => {
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
      <ConfirmModal
        open={modalOpen}
        title="Delete account"
        message="Permanently delete your account and all associated data (company profile, risk cases, mitigation plans, integrations). This cannot be undone."
        confirmLabel="Yes, delete my account and all data"
        cancelLabel="Cancel"
        variant="danger"
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setModalOpen(false)}
      />
      <h3 style={{ color: "var(--danger)" }}>Danger zone</h3>
      <p className="text-sm muted" style={{ margin: 0 }}>
        Permanently delete your account and all associated data (company profile, risk cases, mitigation plans, integrations). This cannot be undone.
      </p>
      <button
        type="button"
        className="btn danger btn-sm"
        onClick={() => setModalOpen(true)}
      >
        Delete account and all data
      </button>
    </section>
  );
}
