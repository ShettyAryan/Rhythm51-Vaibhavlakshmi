import { SettingsForm } from "@/components/admin/SettingsForm";
import { PageHeader } from "@/components/admin/ui";
import { getAdminProject } from "@/lib/api";
import { requireAdminPage } from "@/lib/auth/session";
import { getAdminAsset } from "@/lib/content/queries";
import { DEFAULT_NAV_LABELS } from "@/lib/tour/types";

export default async function SettingsPage() {
  await requireAdminPage();
  const p = await getAdminProject();
  if (!p) return <PageHeader title="Settings" description="Create a project first." />;
  return (
    <>
      <PageHeader title="Landing & Settings" description="Branding, hero, labels and site-wide options. Changes go live when you publish." />
      <SettingsForm
        initial={{
          name: p.name,
          slug: p.slug,
          developerName: p.developer_name,
          heroHeadline: p.hero_headline,
          heroSubtitle: p.hero_subtitle,
          showHeroText: p.show_hero_text,
          heroOverlay: Number(p.hero_overlay),
          aboutText: p.about_text,
          navLabels: { ...DEFAULT_NAV_LABELS, ...p.nav_labels },
          theme: { primary: "", primaryDark: "", accent: "", ivory: "", rose: "", menu: "", ...p.theme },
          contact: { phone: "", email: "", website: "", address: "", ...p.contact },
          autoPublish: !!p.settings?.autoPublish,
          musicVolume: Number(p.settings?.musicVolume ?? 0.5),
          status: p.status,
        }}
        logo={await getAdminAsset(p.id, p.logo_asset_id)}
        hero={await getAdminAsset(p.id, p.hero_asset_id)}
        heroTablet={await getAdminAsset(p.id, p.hero_tablet_asset_id)}
        heroTabletPortrait={await getAdminAsset(p.id, p.hero_tablet_portrait_asset_id)}
        heroMobile={await getAdminAsset(p.id, p.hero_mobile_asset_id)}
        music={await getAdminAsset(p.id, p.music_asset_id)}
      />
    </>
  );
}
