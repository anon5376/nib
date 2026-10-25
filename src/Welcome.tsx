import { useState } from "react";
import type { Backend } from "./backend";
import { Folder } from "./components/rareui/folder";

/** The first screen: where Nib keeps the programs. */
export function Welcome({ backend, onChoose }: { backend: Backend; onChoose: (folder: string) => void }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setOpening(true);
    try {
      const [folder] = await Promise.all([backend.defaultFolder(), new Promise((r) => setTimeout(r, 520))]);
      onChoose(folder as string);
    } catch (e) {
      setOpening(false);
      setError(String(e));
    }
  };

  const choose = async () => {
    const folder = await backend.pickFolder();
    if (folder) onChoose(folder);
  };

  return (
    <div className="welcome" data-tauri-drag-region>
      <div className="welcome-body">
        <Folder open={opening} size={0.8} label="Start in Documents, Nib" onClick={start} />
        <h1>Pick a home for your programs</h1>
        <p>Nib keeps every file you write in one folder and saves as you type. You can switch folders any time.</p>
        <div className="welcome-actions">
          <button className="primary" onClick={start} disabled={opening}>
            Start in Documents › Nib
          </button>
          <button className="secondary" onClick={choose} disabled={opening}>
            Choose a folder…
          </button>
        </div>
        {error && <p className="welcome-error">{error}</p>}
      </div>
    </div>
  );
}
