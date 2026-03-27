'use client';

import { useEffect, useRef } from 'react';

/**
 * Sandboxed iframe for third-party plugin UI bundles.
 *
 * MVP contract:
 * - We send a single init message on load: { type: "MUSE_UI_INIT", pluginId, slot }
 * - Plugin UI should use postMessage to communicate back if needed.
 *
 * Hardening (Phase 3):
 * - Verify integrityHash/SRI by fetching bundle and checking hash before rendering
 * - Consider CSP + stricter sandbox flags depending on allowed features
 */
export default function PluginUIHost({
  bundleUrl,
  title,
  pluginId,
  slot,
  height = 320,
}: {
  bundleUrl: string;
  title: string;
  pluginId: string;
  slot: string;
  height?: number;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      try {
        iframe.contentWindow?.postMessage(
          { type: 'MUSE_UI_INIT', pluginId, slot },
          '*',
        );
      } catch {
        // Ignore; postMessage can fail if the browser blocks navigation.
      }
    };
    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [pluginId, slot]);

  return (
    <div className="rounded-xl border border-white/8 bg-black/20 overflow-hidden">
      <div className="p-3 text-xs text-muted-foreground flex items-center justify-between">
        <span className="truncate">{title}</span>
        <span className="font-mono text-[10px]">{slot}</span>
      </div>
      <iframe
        ref={iframeRef}
        src={bundleUrl}
        title={title}
        sandbox="allow-scripts"
        style={{ width: '100%', height }}
      />
    </div>
  );
}

