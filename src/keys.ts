import { useEffect, useRef } from "react";

export const isMac = navigator.platform.startsWith("Mac");
export const mod = isMac ? "⌘" : "Ctrl+";

/** Nib's shortcuts, caught before the editor sees them: run, stop and new file. */
export function useShortcuts(actions: { run: () => void; stop: () => void; newFile: () => void }) {
  const latest = useRef(actions);
  latest.current = actions;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmd = isMac ? e.metaKey : e.ctrlKey;
      const act = e.key === "F5" || (cmd && (e.key === "r" || e.key === "Enter")) ? "run" : cmd && e.key === "." ? "stop" : cmd && e.key === "n" ? "newFile" : null;
      if (!act) return;
      e.preventDefault();
      latest.current[act]();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}
