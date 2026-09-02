import { useEffect, useState } from "react";

/**
 * Hash routing — no dependency, works from any static host.
 *   #/            landing (marketing)
 *   #/app/<page>  the product
 */
export type Page = "dashboard" | "cover" | "underwrite" | "claims" | "activity" | "docs";

export const PAGES: { key: Page; label: string; icon: "dashboard" | "shield" | "vault" | "claims" | "activity" | "book"; blurb: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard", blurb: "Pool health, pricing curve, recent settlements" },
  { key: "cover", label: "Buy cover", icon: "shield", blurb: "Insure an EVM contract" },
  { key: "underwrite", label: "Underwrite", icon: "vault", blurb: "Supply the capital that backs cover" },
  { key: "claims", label: "Claims", icon: "claims", blurb: "Settle by proof — anyone can" },
  { key: "activity", label: "Activity", icon: "activity", blurb: "Every state change, straight from chain events" },
  { key: "docs", label: "How it works", icon: "book", blurb: "The mechanism, and why it is trustless" },
];

export type Route = { kind: "landing" } | { kind: "app"; page: Page };

function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, "");
  const m = /^app(?:\/([a-z]+))?/.exec(h);
  if (!m) return { kind: "landing" };
  const page = (m[1] ?? "dashboard") as Page;
  return { kind: "app", page: PAGES.some((p) => p.key === page) ? page : "dashboard" };
}

export function useRoute(): Route {
  const [route, set] = useState<Route>(parse);
  useEffect(() => {
    const on = () => { set(parse()); window.scrollTo({ top: 0 }); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export const app = (p: Page = "dashboard") => `#/app/${p}`;
export const landing = () => `#/`;
