import { useEffect, useState } from "react";

/** Hash routing — no dependency, works from any static host. */
export type Route = "overview" | "cover" | "pool" | "claims" | "activity" | "how";

export const ROUTES: { key: Route; label: string; blurb: string }[] = [
  { key: "overview", label: "overview", blurb: "the pool at a glance" },
  { key: "cover", label: "buy cover", blurb: "insure a contract on ethereum" },
  { key: "pool", label: "underwrite", blurb: "supply the capital that backs cover" },
  { key: "claims", label: "claims", blurb: "settle by proof — anyone can" },
  { key: "activity", label: "activity", blurb: "every state change, from chain events" },
  { key: "how", label: "how it works", blurb: "the mechanism, and why it is trustless" },
];

function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, "") as Route;
  return ROUTES.some((r) => r.key === h) ? h : "overview";
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, set] = useState<Route>(parse);
  useEffect(() => {
    const on = () => set(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [route, (r) => { window.location.hash = `/${r}`; }];
}

export const href = (r: Route) => `#/${r}`;
