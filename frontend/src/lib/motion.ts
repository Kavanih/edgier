import { useEffect, useRef, useState } from "react";

/** Adds `.in` once the element scrolls into view. Pair with `.reveal` in CSS. */
export function useReveal<T extends HTMLElement>(threshold = 0.18) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.classList.add("in"); io.disconnect(); } }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return ref;
}

/** Counts from 0 to `to` the first time it is seen. */
export function useCounter(to: number, ms = 1200) {
  const ref = useRef<HTMLElement | null>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / ms);
        setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [to, ms]);
  return { ref, v };
}

/** Types `lines` one character at a time. */
export function useTypewriter(lines: string[], cps = 60, startDelay = 400) {
  const [out, setOut] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setStarted(true); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!started) return;
    let li = 0, ci = 0, cancelled = false;
    const acc: string[] = [];
    const step = () => {
      if (cancelled) return;
      if (li >= lines.length) return;
      const line = lines[li];
      acc[li] = line.slice(0, ci + 1);
      setOut([...acc]);
      ci++;
      if (ci >= line.length) { li++; ci = 0; setTimeout(step, 260); }
      else setTimeout(step, 1000 / cps);
    };
    const t = setTimeout(step, startDelay);
    return () => { cancelled = true; clearTimeout(t); };
  }, [started, lines, cps, startDelay]);
  return { ref, out, done: out.length === lines.length && (out[lines.length - 1]?.length ?? 0) >= (lines[lines.length - 1]?.length ?? 0) };
}
