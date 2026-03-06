"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Zapier MCP embed (custom element from mcp.zapier.com/embed/v1/mcp.js).
 *
 * What you can customize:
 * - Size: width, height (e.g. "100%", "600px")
 * - Look: className is applied to the iframe (border-radius, box-shadow, etc.)
 * - Pre-fill: signUpEmail, signUpFirstName, signUpLastName (all three enable quick account creation)
 * - Zapier dashboard: Company Name and allowed domains at https://mcp.zapier.com/manage/embed/config
 *
 * What you cannot change: The UI inside the iframe (content, copy, layout) is controlled by Zapier.
 */
type ZapierMcpEmbedProps = {
  embedId: string;
  width?: string;
  height?: string;
  /** CSS class applied to the embed iframe (e.g. for border-radius, shadow). */
  className?: string;
  /** Optional origin for the embed. */
  origin?: string;
  signUpEmail?: string;
  signUpFirstName?: string;
  signUpLastName?: string;
  onMcpServerUrl?: (serverUrl: string) => void;
  onToolsChanged?: () => void;
  onCloseRequested?: () => void;
};

export function ZapierMcpEmbed({
  embedId,
  width = "100%",
  height = "500px",
  className,
  origin,
  signUpEmail,
  signUpFirstName,
  signUpLastName,
  onMcpServerUrl,
  onToolsChanged,
  onCloseRequested,
}: ZapierMcpEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  const handleMcpServerUrl = useCallback(
    (e: Event) => {
      const url = (e as CustomEvent<{ serverUrl: string }>).detail?.serverUrl;
      if (url) onMcpServerUrl?.(url);
    },
    [onMcpServerUrl]
  );
  const handleToolsChanged = useCallback(() => onToolsChanged?.(), [onToolsChanged]);
  const handleCloseRequested = useCallback(() => onCloseRequested?.(), [onCloseRequested]);

  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || !embedId) return;
    const container = containerRef.current;
    const el = document.createElement("zapier-mcp") as HTMLElement & {
      setAttribute(name: string, value: string): void;
    };
    el.setAttribute("embed-id", embedId);
    el.setAttribute("width", width);
    el.setAttribute("height", height);
    if (className) el.setAttribute("class-name", className);
    if (origin) el.setAttribute("origin", origin);
    (el as HTMLElement).style.width = width;
    (el as HTMLElement).style.height = height;
    if (signUpEmail) el.setAttribute("sign-up-email", signUpEmail);
    if (signUpFirstName) el.setAttribute("sign-up-first-name", signUpFirstName);
    if (signUpLastName) el.setAttribute("sign-up-last-name", signUpLastName);
    el.addEventListener("mcp-server-url", handleMcpServerUrl);
    el.addEventListener("tools-changed", handleToolsChanged);
    el.addEventListener("close-requested", handleCloseRequested);
    container.appendChild(el);
    return () => {
      el.removeEventListener("mcp-server-url", handleMcpServerUrl);
      el.removeEventListener("tools-changed", handleToolsChanged);
      el.removeEventListener("close-requested", handleCloseRequested);
      container.removeChild(el);
    };
  }, [scriptLoaded, embedId, width, height, className, origin, signUpEmail, signUpFirstName, signUpLastName, handleMcpServerUrl, handleToolsChanged, handleCloseRequested]);

  if (!embedId) return null;

  return (
    <>
      <Script
        src="https://mcp.zapier.com/embed/v1/mcp.js"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />
      <div
        ref={containerRef}
        className="zapier-mcp-embed-container"
        style={{ width: "100%", minHeight: height, height }}
      />
    </>
  );
}
