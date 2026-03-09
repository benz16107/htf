"use client";

import { useEffect, useMemo, useState } from "react";
import { StatusBanner } from "@/components/StatusBanner";

type ConnectionStatus = {
  provider: "gmail";
  connected: boolean;
  emailAddress: string | null;
  oauthReady: boolean;
  sendReady: boolean;
  pushReady: boolean;
  watchActive: boolean;
  watchExpiration: string | null;
  pushTopicName: string | null;
  pushEndpointUrl: string | null;
  lastWatchError: string | null;
};

export function DirectEmailConnectionCard() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [watching, setWatching] = useState(false);
  const [banner, setBanner] = useState<{
    variant: "success" | "error";
    title: string;
    message?: string;
  } | null>(null);

  const redirectTo = useMemo(() => {
    if (typeof window === "undefined") return "/dashboard/integrations";
    return `${window.location.pathname}${window.location.search ? window.location.search.replace(/^\?/, "?") : ""}`;
  }, []);

  async function loadStatus() {
    setLoading(true);
    try {
      const res = await fetch("/api/email/google/connection");
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus(data as ConnectionStatus);
      } else {
        setBanner({ variant: "error", title: "Could not load Gmail connection", message: data.error || "Try refreshing the page." });
      }
    } catch {
      setBanner({ variant: "error", title: "Could not load Gmail connection", message: "Try refreshing the page." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("emailConnected");
    const error = params.get("emailError");
    const push = params.get("emailPush");
    const pushError = params.get("emailPushError");
    if (connected === "gmail") {
      setBanner({
        variant: "success",
        title: "Gmail connected",
        message: push === "enabled"
          ? "Native Gmail sync is connected and push notifications are enabled."
          : "Native Gmail sync is now available for internal email signals.",
      });
      loadStatus();
      params.delete("emailConnected");
      params.delete("emailError");
      params.delete("emailPush");
      params.delete("emailPushError");
      const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState({}, "", next);
    } else if (pushError) {
      setBanner({
        variant: "error",
        title: "Gmail push setup failed",
        message: decodeURIComponent(pushError),
      });
      params.delete("emailConnected");
      params.delete("emailError");
      params.delete("emailPush");
      params.delete("emailPushError");
      const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState({}, "", next);
    } else if (error) {
      setBanner({
        variant: "error",
        title: "Gmail connection failed",
        message: decodeURIComponent(error),
      });
      params.delete("emailConnected");
      params.delete("emailError");
      params.delete("emailPush");
      params.delete("emailPushError");
      const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState({}, "", next);
    }
  }, []);

  const connectHref = `/api/email/google/authorize?redirectTo=${encodeURIComponent(redirectTo)}`;

  return (
    <section className="card stack">
      {banner ? <StatusBanner variant={banner.variant} title={banner.title} message={banner.message} /> : null}
      <h3 style={{ margin: 0 }}>Direct email sync</h3>
      <p className="muted text-sm" style={{ margin: 0 }}>
        Connect Gmail directly for native inbox retrieval. Zapier remains available for your non-email tools.
      </p>

      {loading ? (
        <p className="muted text-sm" style={{ margin: 0 }}>Checking Gmail connection…</p>
      ) : (
        <div className="card-flat stack-sm" style={{ padding: "0.85rem 1rem" }}>
          <p className="text-sm" style={{ margin: 0 }}>
            <strong>Status:</strong>{" "}
            {status?.connected ? `Connected${status.emailAddress ? ` as ${status.emailAddress}` : ""}` : "Not connected"}
          </p>
          <p className="muted text-xs" style={{ margin: 0 }}>
            Direct Gmail now handles inbox retrieval and can also send mitigation emails when send permission is granted. Zapier email tools are skipped to avoid duplicate inbox sources.
          </p>
          <p className="text-xs" style={{ margin: 0 }}>
            <strong>Send email:</strong> {status?.sendReady ? "Ready" : "Reconnect Gmail to grant send access"}
          </p>
          <p className="text-xs" style={{ margin: 0 }}>
            <strong>Live push:</strong>{" "}
            {status?.pushReady
              ? status.watchActive
                ? `Active${status.watchExpiration ? ` until ${new Date(status.watchExpiration).toLocaleString()}` : ""}`
                : "Configured but watch is not active yet"
              : "Not configured"}
          </p>
          {status?.lastWatchError && (
            <p className="muted text-xs" style={{ margin: 0 }}>
              Last watch issue: <code>{status.lastWatchError}</code>
            </p>
          )}
          {!status?.oauthReady && (
            <p className="muted text-xs" style={{ margin: 0 }}>
              Missing Google OAuth env vars. Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>, and optionally <code>GOOGLE_REDIRECT_URI</code>.
            </p>
          )}
          {status?.connected && !status?.sendReady && (
            <p className="muted text-xs" style={{ margin: 0 }}>
              This Gmail connection was likely created before send access was added. Click <strong>Reconnect Gmail</strong> and approve the updated permissions to enable outbound email.
            </p>
          )}
          {status?.oauthReady && !status?.pushReady && (
            <p className="muted text-xs" style={{ margin: 0 }}>
              To enable true live sync, also set <code>GOOGLE_PUBSUB_TOPIC_NAME</code> and <code>GOOGLE_PUBSUB_VERIFICATION_TOKEN</code>.
            </p>
          )}
          <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <a
              href={connectHref}
              className={`btn btn-sm ${status?.connected ? "secondary" : "primary"}`}
              aria-disabled={!status?.oauthReady}
              onClick={(e) => {
                if (!status?.oauthReady) e.preventDefault();
              }}
            >
              {status?.connected ? "Reconnect Gmail" : "Connect Gmail"}
            </a>
            {status?.connected && (
              <button
                type="button"
                className="btn secondary btn-sm"
                disabled={watching || !status.pushReady}
                onClick={async () => {
                  setWatching(true);
                  try {
                    const res = await fetch("/api/email/google/watch", { method: "POST" });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.error || "Failed to enable Gmail push");
                    setBanner({
                      variant: "success",
                      title: "Gmail push enabled",
                      message: data.expiration ? `Watch active until ${new Date(data.expiration).toLocaleString()}.` : "Gmail push is active.",
                    });
                    await loadStatus();
                  } catch (error) {
                    setBanner({
                      variant: "error",
                      title: "Could not enable Gmail push",
                      message: error instanceof Error ? error.message : "Failed to enable Gmail push",
                    });
                  } finally {
                    setWatching(false);
                  }
                }}
              >
                {watching ? "Starting push…" : status.watchActive ? "Refresh Gmail push" : "Enable Gmail push"}
              </button>
            )}
            {status?.connected && (
              <button
                type="button"
                className="btn secondary btn-sm"
                disabled={disconnecting}
                onClick={async () => {
                  setDisconnecting(true);
                  try {
                    const res = await fetch("/api/email/google/connection", { method: "DELETE" });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.error || "Disconnect failed");
                    setBanner({
                      variant: "success",
                      title: "Gmail disconnected",
                      message: "Email retrieval will fall back to other configured sources.",
                    });
                    await loadStatus();
                  } catch (error) {
                    setBanner({
                      variant: "error",
                      title: "Could not disconnect Gmail",
                      message: error instanceof Error ? error.message : "Disconnect failed",
                    });
                  } finally {
                    setDisconnecting(false);
                  }
                }}
              >
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
