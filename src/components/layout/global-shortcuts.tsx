"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * F47 — scorciatoie da tastiera globali. Minimale e prevedibile:
 * - "n" → nuovo trade (il gesto più frequente del journal serale).
 * Mai attiva mentre si scrive in un campo o con modificatori premuti.
 */
export function GlobalShortcuts() {
  const router = useRouter();
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        router.push("/trades/new");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);
  return null;
}
