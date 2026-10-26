/**
 * Serialisable Smart Setups metadata for the browser.
 *
 * The full blueprint carries matching tokens, exclusions and impact weights —
 * all of which belong to the server. The client only needs enough to render the
 * configurator and name the tiers.
 */

import {
  SETUP_SPACES,
  SETUP_STYLES,
  SETUP_TIERS,
  SETUP_TEMPLATES,
  type SetupSpaceKey,
  type SetupStyleKey,
} from "./blueprints";

export interface SetupOwnedOption {
  key: string;
  label: string;
}

export interface SetupSpaceMeta {
  key: SetupSpaceKey;
  title: string;
  tagline: string;
  description: string;
  icon: string;
  image: string;
  domain: string;
  budgetMin: number;
  budgetMax: number;
  budgetDefault: number;
  slotCount: number;
  essentialCount: number;
  ownedOptions: SetupOwnedOption[];
}

export interface SetupMeta {
  spaces: SetupSpaceMeta[];
  styles: { key: SetupStyleKey; label: string; description: string }[];
  tiers: { key: string; label: string; tagline: string; badge: string }[];
  examples: {
    slug: string;
    title: string;
    space: SetupSpaceKey;
    budget: number;
    style: SetupStyleKey;
    blurb: string;
  }[];
}

export function getSetupMeta(): SetupMeta {
  return {
    spaces: Object.values(SETUP_SPACES).map((space) => {
      const seen = new Set<string>();
      const ownedOptions: SetupOwnedOption[] = [];
      for (const slot of space.slots) {
        if (seen.has(slot.ownedKey)) continue;
        seen.add(slot.ownedKey);
        ownedOptions.push({ key: slot.ownedKey, label: slot.label });
      }
      return {
        key: space.key,
        title: space.title,
        tagline: space.tagline,
        description: space.description,
        icon: space.icon,
        image: space.image,
        domain: space.domain,
        budgetMin: space.budgetMin,
        budgetMax: space.budgetMax,
        budgetDefault: space.budgetDefault,
        slotCount: space.slots.length,
        essentialCount: space.slots.filter((slot) => slot.phase === 1).length,
        ownedOptions,
      };
    }),
    styles: SETUP_STYLES.map((s) => ({
      key: s.key,
      label: s.label,
      description: s.description,
    })),
    tiers: SETUP_TIERS.map((t) => ({
      key: t.key,
      label: t.label,
      tagline: t.tagline,
      badge: t.badge,
    })),
    examples: SETUP_TEMPLATES.map((t) => ({
      slug: t.slug,
      title: t.title,
      space: t.space,
      budget: t.budget,
      style: t.style,
      blurb: t.blurb,
    })),
  };
}
