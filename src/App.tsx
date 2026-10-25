import { useEffect, useState } from "react";
import type { Backend } from "./backend";
import { Welcome } from "./Welcome";
import { Workspace } from "./Workspace";
import "./components/rareui/rareui.css";
import "./App.css";

const KEY = "nib.folder";

export default function App({ backend }: { backend: Backend }) {
  // undefined while checking that the remembered folder is still there.
  const [root, setRoot] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      // No storage: start from the welcome screen.
    }
    if (!saved) return setRoot(null);
    backend.list(saved).then(
      () => setRoot(saved),
      () => setRoot(null),
    );
  }, [backend]);

  const choose = (folder: string) => {
    try {
      localStorage.setItem(KEY, folder);
    } catch {
      // Not fatal: Nib asks again next time.
    }
    setRoot(folder);
  };

  const openFolder = async () => {
    const folder = await backend.pickFolder();
    if (folder) choose(folder);
  };

  if (root === undefined) return null;
  if (root === null) return <Welcome backend={backend} onChoose={choose} />;
  return <Workspace key={root} backend={backend} root={root} onOpenFolder={openFolder} />;
}
