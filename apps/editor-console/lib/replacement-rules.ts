import type {
  Candidate,
  DraftSnapshot,
  IssueBuild,
  ReplacementAssessment,
  SectionId,
  SelfFilledSlot,
} from "@/lib/contracts";
import { isSelfFilled } from "@/lib/contracts";

/**
 * Two venue names are the same place when their keys are equal. A blank name has
 * no key and never matches. The allocator carries its own copy of this rule
 * (scripts/buildIssues.js); both must agree with scripts/venue_match_cases.json.
 */
export function venueKey(name: string | null | undefined): string {
  return typeof name === "string"
    ? name.trim().toLowerCase().replace(/\s+/g, " ")
    : "";
}

/**
 * Assess one replacement against the lineup as it stands now, not as it was built.
 * No replacement is ever refused: the worst verdict is "override", a warning the
 * editor can overrule. A slot the editor is filling himself is not part of that
 * lineup: its pick stays in `selections` underneath but will not be published.
 */
export function assessReplacement(
  build: IssueBuild,
  selections: DraftSnapshot["selections"],
  sectionId: SectionId,
  slotIndex: number,
  incoming: Candidate,
  selfFilledSlots?: SelfFilledSlot[],
): ReplacementAssessment {
  const warnings: string[] = [];
  // A draft saved before a field existed can lack it; a blank never matches.
  const seriesKey = (value: string | null | undefined) =>
    typeof value === "string" ? value.trim() : "";
  const incomingVenue = venueKey(incoming.venue);
  const incomingSeries = seriesKey(incoming.seriesId);

  (selections[sectionId] ?? []).forEach((staying, index) => {
    if (index === slotIndex || !staying) return;
    if (isSelfFilled(selfFilledSlots, sectionId, index)) return;
    if (incomingVenue && venueKey(staying.venue) === incomingVenue) {
      warnings.push(`Same venue as pick ${index + 1}: ${staying.venue.trim()}.`);
    }
    if (incomingSeries && seriesKey(staying.seriesId) === incomingSeries) {
      warnings.push(`Same series as pick ${index + 1}: ${staying.title}.`);
    }
  });

  for (const section of build.sections) {
    if (section.id === sectionId) continue;
    const picked = (selections[section.id] ?? []).some(
      (pick, index) =>
        pick?.id === incoming.id &&
        !isSelfFilled(selfFilledSlots, section.id, index),
    );
    if (picked) {
      warnings.push(`Already picked in ${section.label}.`);
    }
  }

  return warnings.length
    ? { status: "override", reason: warnings.join(" ") }
    : { status: "clean", reason: "Fits this slot." };
}
