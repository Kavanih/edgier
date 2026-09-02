import { useEffect, useState } from "react";
import { Icon } from "./Icons";

export interface Toast { id: number; kind: "ok" | "error" | "busy" | "info"; text: string }

let seq = 0;
const listeners = new Set<(t: Toast) => void>();

/** Fire-and-forget from anywhere; the <Toasts/> host renders them. */
export function toast(kind: Toast["kind"], text: string) {
  const t = { id: ++seq, kind, text };
  listeners.forEach((l) => l(t));
  return t.id;
}

export function Toasts() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (t: Toast) => {
      setItems((xs) => [...xs.filter((x) => x.kind !== "busy" || t.kind !== "busy"), t]);
      if (t.kind !== "busy") setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), t.kind === "error" ? 9000 : 4500);
    };
    listeners.add(on);
    return () => { listeners.delete(on); };
  }, []);
  const dismiss = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id));
  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => dismiss(t.id)}>
          <Icon name={t.kind === "ok" ? "check" : t.kind === "error" ? "warn" : t.kind === "busy" ? "spark" : "info"} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Clears any busy toast (e.g. when an action finishes). */
export function clearBusy() {
  listeners.forEach((l) => l({ id: -1, kind: "info", text: "" }));
}
