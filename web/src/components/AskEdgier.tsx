import { useState } from "react";
import { ask } from "../lib/ai";
import { Icon } from "./Icons";

const SUGGESTIONS = [
  "Why is a proof better than a DAO vote?",
  "What can't Edgier insure?",
  "How did the Ronin claim get paid?",
  "What happens if the exploit transaction reverted?",
];

/** Floating assistant. Single-turn Q&A over the protocol facts; never touches the chain. */
export function AskEdgier({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [log, setLog] = useState<{ q: string; a: string; model?: string }[]>([]);
  const [busy, setBusy] = useState(false);

  async function send(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true); setQ("");
    try {
      const r = await ask(question);
      setLog((l) => [...l, { q: question, a: r.answer, model: r.model }]);
    } catch (e) {
      setLog((l) => [...l, { q: question, a: `⚠ ${(e as Error).message}` }]);
    } finally { setBusy(false); }
  }

  return (
    <>
      <button className={`ask-fab ${open ? "open" : ""}`} onClick={() => setOpen(!open)} title="Ask Edgier">
        <Icon name={open ? "x" : "brain"} size={18} /> {!open && <span>Ask Edgier</span>}
      </button>
      {open && (
        <div className="ask-panel">
          <div className="ask-head">
            <span className="ai-badge">AI</span><b>Ask Edgier</b>
            <span className="muted small" style={{ marginLeft: "auto" }}>{enabled ? "advisory" : "offline"}</span>
          </div>
          <div className="ask-log">
            {log.length === 0 && (
              <div className="ask-suggest">
                <span className="muted small">Try one:</span>
                {SUGGESTIONS.map((s) => <button key={s} className="chip chip-btn" onClick={() => send(s)}>{s}</button>)}
              </div>
            )}
            {log.map((m, i) => (
              <div key={i} className="ask-turn">
                <div className="ask-q">{m.q}</div>
                <div className="ask-a">{m.a}{m.model && <span className="ai-model"> · {m.model.replace(/:free$/, "")}</span>}</div>
              </div>
            ))}
            {busy && <div className="ask-a muted">thinking…</div>}
          </div>
          <form className="ask-form" onSubmit={(e) => { e.preventDefault(); send(q); }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={enabled ? "Ask about cover, proofs, pricing…" : "assistant offline"} disabled={!enabled || busy} />
            <button className="btn btn-primary btn-sm" disabled={!enabled || busy || !q.trim()}><Icon name="arrow" size={14} /></button>
          </form>
        </div>
      )}
    </>
  );
}
