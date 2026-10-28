import type { ThemeConfig } from "@/lib/tour/types";

const VARS: Record<keyof ThemeConfig, string> = {
  primary: "--brand-primary",
  primaryDark: "--brand-primary-dark",
  accent: "--brand-accent",
  ivory: "--brand-ivory",
  rose: "--brand-rose",
};

/** Injects the project's brand colour overrides as CSS variables. */
export function ThemeStyle({ theme }: { theme: ThemeConfig }) {
  const decls = Object.entries(theme)
    .filter(([k, v]) => k in VARS && typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v))
    .map(([k, v]) => `${VARS[k as keyof ThemeConfig]}:${v};`)
    .join("");
  if (!decls) return null;
  return <style>{`:root{${decls}}`}</style>;
}
