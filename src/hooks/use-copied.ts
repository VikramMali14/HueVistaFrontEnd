"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Copy-to-clipboard with a transient "copied" state, shared by every
 * copy-the-code button in the app. `copy(key, text)` writes `text` and marks
 * `key` as copied for `resetMs`; a later copy of a different key takes over.
 */
export function useCopied(resetMs = 1200) {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    (key: string, text?: string) => {
      navigator.clipboard
        ?.writeText(text ?? key)
        .then(() => {
          setCopied(key);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied((c) => (c === key ? null : c)), resetMs);
        })
        .catch(() => {});
    },
    [resetMs],
  );

  return { copied, copy };
}
