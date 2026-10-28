"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminAsset } from "@/lib/content/queries";
import type { ContactInfo, NavLabels, ThemeConfig } from "@/lib/tour/types";
import { api } from "./client";
import { AssetPicker } from "./MediaLibrary";
import { Button, Field, Input, Panel, Textarea, Toggle, useToast } from "./ui";

interface SettingsValues {
  name: string;
  slug: string;
  developerName: string;
  heroHeadline: string;
  heroSubtitle: string;
  showHeroText: boolean;
  heroOverlay: number;
  aboutText: string;
  navLabels: NavLabels;
  theme: Required<{ [K in keyof ThemeConfig]: string }>;
  contact: Required<{ [K in keyof ContactInfo]: string }>;
  autoPublish: boolean;
  status: "draft" | "published";
}

const THEME_FIELDS: { key: keyof SettingsValues["theme"]; label: string; fallback: string }[] = [
  { key: "primary", label: "Primary (burgundy)", fallback: "#56163b" },
  { key: "primaryDark", label: "Primary dark (wine)", fallback: "#351020" },
  { key: "accent", label: "Accent (gold)", fallback: "#c7a56a" },
  { key: "ivory", label: "Background (ivory)", fallback: "#faf7f0" },
  { key: "rose", label: "Rose", fallback: "#c86b79" },
];

export function SettingsForm({ initial, logo: initialLogo, hero: initialHero }: { initial: SettingsValues; logo: AdminAsset | null; hero: AdminAsset | null }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState(initial);
  const [logo, setLogo] = useState(initialLogo);
  const [hero, setHero] = useState(initialHero);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof SettingsValues>(k: K, val: SettingsValues[K]) => setV((s) => ({ ...s, [k]: val }));

  const save = async () => {
    setSaving(true);
    try {
      await api("PATCH", "/api/admin/project", { ...v, logoAssetId: logo?.id ?? null, heroAssetId: hero?.id ?? null });
      toast.success(v.autoPublish ? "Saved and published" : "Saved. Publish to update the public site.");
      router.refresh();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="grid gap-6 xl:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Panel title="Project" className="xl:col-span-1">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project name">
            <Input value={v.name} onChange={(e) => set("name", e.target.value)} data-testid="settings-name" />
          </Field>
          <Field label="Builder / developer">
            <Input value={v.developerName} onChange={(e) => set("developerName", e.target.value)} />
          </Field>
          <Field label="URL slug" hint="Identifies the project (used with PUBLIC_PROJECT_SLUG).">
            <Input value={v.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} pattern="[a-z0-9][a-z0-9-]*" />
          </Field>
          <div className="sm:col-span-2">
            <AssetPicker label="Logo" value={logo} onChange={setLogo} categories={["image"]} hint="Transparent PNG or WebP works best on the hero image." />
          </div>
        </div>
      </Panel>

      <Panel title="Landing hero">
        <div className="space-y-4">
          <AssetPicker
            label="Hero image"
            value={hero}
            onChange={setHero}
            categories={["image"]}
            hint="Shown full-screen. Use a landscape image at least 2400px wide."
            testId="hero-picker"
          />
          <Toggle checked={v.showHeroText} onChange={(b) => set("showHeroText", b)} label="Show headline over the image" description="Turn off for an image-only hero." />
          <Field label="Headline">
            <Input value={v.heroHeadline} onChange={(e) => set("heroHeadline", e.target.value)} data-testid="settings-headline" />
          </Field>
          <Field label="Subtitle">
            <Input value={v.heroSubtitle} onChange={(e) => set("heroSubtitle", e.target.value)} />
          </Field>
          <Field label={`Darkening overlay · ${Math.round(v.heroOverlay * 100)}%`} hint="Improves text legibility on bright images.">
            <input type="range" min={0} max={0.9} step={0.05} value={v.heroOverlay} onChange={(e) => set("heroOverlay", Number(e.target.value))} className="w-full accent-plum" />
          </Field>
        </div>
      </Panel>

      <Panel title="Navigation labels">
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(v.navLabels) as (keyof NavLabels)[]).map((k) => (
            <Field key={k} label={{ rooms: "Rooms button", amenities: "Amenities button", floorPlan: "Floor plan button", brochure: "Brochure button" }[k]}>
              <Input value={v.navLabels[k]} maxLength={40} onChange={(e) => set("navLabels", { ...v.navLabels, [k]: e.target.value })} />
            </Field>
          ))}
        </div>
      </Panel>

      <Panel title="Theme colours" description="Leave blank to use the default brochure palette.">
        <div className="grid gap-4 sm:grid-cols-2">
          {THEME_FIELDS.map(({ key, label, fallback }) => (
            <Field key={key} label={label}>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={v.theme[key] || fallback}
                  onChange={(e) => set("theme", { ...v.theme, [key]: e.target.value })}
                  className="h-10 w-12 cursor-pointer border border-charcoal/20 bg-white"
                  aria-label={`${label} colour`}
                />
                <Input value={v.theme[key]} placeholder={fallback} onChange={(e) => set("theme", { ...v.theme, [key]: e.target.value })} />
              </div>
            </Field>
          ))}
        </div>
      </Panel>

      <Panel title="About & contact" description="Shown in an “About” panel on the landing page when filled in.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="About text" className="sm:col-span-2">
            <Textarea value={v.aboutText} onChange={(e) => set("aboutText", e.target.value)} rows={4} />
          </Field>
          <Field label="Phone">
            <Input value={v.contact.phone} onChange={(e) => set("contact", { ...v.contact, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={v.contact.email} onChange={(e) => set("contact", { ...v.contact, email: e.target.value })} />
          </Field>
          <Field label="Website">
            <Input value={v.contact.website} placeholder="https://" onChange={(e) => set("contact", { ...v.contact, website: e.target.value })} />
          </Field>
          <Field label="Address">
            <Input value={v.contact.address} onChange={(e) => set("contact", { ...v.contact, address: e.target.value })} />
          </Field>
        </div>
      </Panel>

      <Panel title="Publishing">
        <div className="space-y-4">
          <Toggle
            checked={v.status === "published"}
            onChange={(b) => set("status", b ? "published" : "draft")}
            label="Public site online"
            description="When off, visitors see a “coming soon” page. Takes effect immediately on save."
            testId="site-online"
          />
          <Toggle
            checked={v.autoPublish}
            onChange={(b) => set("autoPublish", b)}
            label="Publish changes immediately"
            description="Skips the review step: every saved change goes live straight away."
          />
        </div>
      </Panel>

      <div className="sticky bottom-0 -mx-4 flex justify-end border-t border-charcoal/10 bg-[#f6f2ea]/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10 xl:col-span-2">
        <Button type="submit" variant="primary" loading={saving} data-testid="settings-save">
          Save settings
        </Button>
      </div>
    </form>
  );
}
