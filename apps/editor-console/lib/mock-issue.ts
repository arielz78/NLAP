import type {
  AlternativeCandidate,
  Candidate,
  IssueBuild,
  ReplacementAssessment,
  SectionBundle,
  SectionId,
} from "@/lib/contracts";

function candidate(
  id: string,
  title: string,
  startsAt: string,
  venue: string,
  city: string,
  description: string,
): Candidate {
  return {
    id,
    seriesId: `series-${id}`,
    occurrenceId: `occurrence-${id}`,
    title,
    startsAt,
    venue,
    city,
    description,
    sourceLabel: "Fixture listing",
    sourceUrl: `https://example.com/events/${id}`,
    classification: "classified",
  };
}

function makeSection(
  id: SectionId,
  label: string,
  eyebrow: string,
  selected: Candidate[],
  alternatives: Candidate[],
  exceptions: Record<string, Record<string, ReplacementAssessment>> = {},
): SectionBundle {
  const allCandidates = [...selected, ...alternatives];
  const replacementAssessments = Object.fromEntries(
    allCandidates.map((selectedCandidate) => [
      selectedCandidate.id,
      Object.fromEntries(
        allCandidates
          .filter((alternative) => alternative.id !== selectedCandidate.id)
          .map((alternative) => [
            alternative.id,
            exceptions[selectedCandidate.id]?.[alternative.id] ?? {
              status: "clean",
              reason: "Fits this slot without requiring an editorial override.",
            },
          ]),
      ),
    ]),
  );

  return {
    id,
    label,
    eyebrow,
    selected,
    alternatives: alternatives.map(
      (item, index): AlternativeCandidate => ({
        candidate: item,
        orderingPosition: index + 1,
      }),
    ),
    replacementAssessments,
  };
}

const familiesSelected = [
  candidate(
    "fam-01",
    "Maple Harvest Family Day",
    "2026-09-12T10:00:00-04:00",
    "Kortright Centre",
    "Kleinburg",
    "A hands-on fall program with forest walks, crafts, and maple treats.",
  ),
  candidate(
    "fam-02",
    "Saturday Story Lab",
    "2026-09-12T11:00:00-04:00",
    "Pierre Berton Resource Library",
    "Vaughan",
    "A lively story hour followed by a low-mess creative activity.",
  ),
  candidate(
    "fam-03",
    "Junior Naturalists: Pond Life",
    "2026-09-13T09:30:00-04:00",
    "Boyd Conservation Park",
    "Woodbridge",
    "Young naturalists investigate pond habitats with a guide.",
  ),
  candidate(
    "fam-04",
    "Community Touch-a-Truck",
    "2026-09-13T12:00:00-04:00",
    "Vellore Village Community Centre",
    "Vaughan",
    "Climb aboard emergency, construction, and city service vehicles.",
  ),
  candidate(
    "fam-05",
    "Family Clay Workshop",
    "2026-09-13T14:00:00-04:00",
    "Vaughan City Playhouse Studio",
    "Vaughan",
    "Families shape and decorate a small keepsake together.",
  ),
];

const familiesAlternatives = [
  candidate(
    "fam-06",
    "Mini Makers Market",
    "2026-09-12T13:00:00-04:00",
    "Assembly Park",
    "Vaughan",
    "Kid-run tables, simple workshops, and an all-ages craft station.",
  ),
  candidate(
    "fam-07",
    "Outdoor Movie: Paddington",
    "2026-09-12T19:30:00-04:00",
    "North Thornhill Community Centre",
    "Thornhill",
    "Bring a blanket for a free dusk screening on the lawn.",
  ),
  candidate(
    "fam-08",
    "Build-a-Birdhouse Morning",
    "2026-09-13T10:30:00-04:00",
    "Mackenzie Glen District Park",
    "Maple",
    "A guided beginner build with materials supplied while quantities last.",
  ),
  candidate(
    "fam-09",
    "Inflatable Fun Fair",
    "2026-09-13T11:00:00-04:00",
    "Chancellor Community Centre",
    "Woodbridge",
    "Indoor inflatables and games; timed admission is required.",
  ),
];

const couplesSelected = [
  candidate(
    "cou-01",
    "Twilight Vineyard Walk",
    "2026-09-11T18:30:00-04:00",
    "Magnotta Winery",
    "Vaughan",
    "A guided evening walk followed by a tasting flight.",
  ),
  candidate(
    "cou-02",
    "Live Jazz in the Courtyard",
    "2026-09-11T20:00:00-04:00",
    "The Village at Vaughan Mills",
    "Vaughan",
    "An intimate outdoor trio set with café seating nearby.",
  ),
  candidate(
    "cou-03",
    "Date Night Pottery",
    "2026-09-12T18:00:00-04:00",
    "Creative Village Studio",
    "Maple",
    "A beginner-friendly wheel session for pairs, including glazing.",
  ),
  candidate(
    "cou-04",
    "Chef's Table: Late Summer",
    "2026-09-12T19:00:00-04:00",
    "Market Lane Kitchen",
    "Woodbridge",
    "A ticketed multi-course menu focused on local late-summer produce.",
  ),
  candidate(
    "cou-05",
    "Moonlight Garden Tour",
    "2026-09-13T20:00:00-04:00",
    "McMichael Canadian Art Collection",
    "Kleinburg",
    "A quiet after-hours walk through the sculpture garden.",
  ),
];

const couplesAlternatives = [
  candidate(
    "cou-06",
    "Indie Film & Director Q&A",
    "2026-09-12T19:30:00-04:00",
    "City Playhouse Theatre",
    "Vaughan",
    "A local short-film program followed by a moderated conversation.",
  ),
  candidate(
    "cou-07",
    "Salsa Under the Stars",
    "2026-09-12T20:00:00-04:00",
    "Assembly Park",
    "Vaughan",
    "A short lesson opens an evening of outdoor social dancing.",
  ),
  candidate(
    "cou-08",
    "Coffee Cupping for Two",
    "2026-09-13T10:00:00-04:00",
    "Railway Street Roasters",
    "Kleinburg",
    "Compare four small-batch coffees in a guided tasting.",
  ),
  candidate(
    "cou-09",
    "Rooftop Comedy Night",
    "2026-09-13T20:30:00-04:00",
    "Jane Street Social Club",
    "Vaughan",
    "A late outdoor stand-up showcase with general admission seating.",
  ),
];

const goldenAgeSelected = [
  candidate(
    "gold-01",
    "Heritage Walk: Old Woodbridge",
    "2026-09-11T10:00:00-04:00",
    "Woodbridge Memorial Tower",
    "Woodbridge",
    "A gentle guided walk through the neighbourhood's early history.",
  ),
  candidate(
    "gold-02",
    "Afternoon Chamber Recital",
    "2026-09-11T14:00:00-04:00",
    "Vaughan City Hall Atrium",
    "Vaughan",
    "A free one-hour program performed by a local string quartet.",
  ),
  candidate(
    "gold-03",
    "Watercolour for Beginners",
    "2026-09-12T10:30:00-04:00",
    "Dufferin Clark Library",
    "Vaughan",
    "A relaxed introductory class with supplies provided.",
  ),
  candidate(
    "gold-04",
    "Fall Garden Clinic",
    "2026-09-12T13:30:00-04:00",
    "Maple Community Garden",
    "Maple",
    "Local gardeners answer questions about bulbs, pruning, and soil care.",
  ),
  candidate(
    "gold-05",
    "Sunday Tea & Local History",
    "2026-09-13T14:00:00-04:00",
    "Kleinburg Heritage House",
    "Kleinburg",
    "An illustrated talk with tea and light refreshments.",
  ),
];

const goldenAgeAlternatives = [
  candidate(
    "gold-06",
    "Classic Cinema Matinee",
    "2026-09-11T13:00:00-04:00",
    "Bathurst Clark Resource Library",
    "Thornhill",
    "A free matinee with captions and an optional post-film discussion.",
  ),
  candidate(
    "gold-07",
    "Birding from the Boardwalk",
    "2026-09-12T08:30:00-04:00",
    "Marita Payne Park",
    "Vaughan",
    "An easy-paced morning outing led by a local birder.",
  ),
  candidate(
    "gold-08",
    "Community Choir Open Rehearsal",
    "2026-09-13T15:00:00-04:00",
    "Rosemount Community Centre",
    "Thornhill",
    "Listen in or join a welcoming rehearsal of familiar standards.",
  ),
  candidate(
    "gold-09",
    "Smartphone Photo Walk",
    "2026-09-13T10:00:00-04:00",
    "Bindertwine Park",
    "Kleinburg",
    "A practical outdoor lesson on composition and phone camera settings.",
  ),
];

export const mockIssueBuild: IssueBuild = {
  id: "10000000-0000-4000-8000-000000000001",
  issueKey: "vaughan-brief-2026-09-17",
  issueDate: "2026-09-17",
  buildVersion: 1,
  contractVersion: "r8.editor-console.v1",
  bundleHash: "fixture-2026-09-17-v1",
  ordering: {
    adapterVersion: "fixture-adapter-v1",
    rankerVersion: "fixture-ranker-v1",
    evidenceVersion: "fixture-evidence-v1",
    generatedAt: "2026-09-08T13:00:00-04:00",
    inputHash: "fixture-input-2026-09-08",
  },
  sections: [
    makeSection(
      "families",
      "Families",
      "Easy wins for the whole crew",
      familiesSelected,
      familiesAlternatives,
      {
        "fam-01": {
          "fam-07": {
            status: "override",
            reason: "This creates a second evening pick in the section.",
          },
        },
        "fam-04": {
          "fam-09": {
            status: "unavailable",
            reason: "The two listings resolve to the same upstream series.",
          },
        },
      },
    ),
    makeSection(
      "couples",
      "Couples",
      "A reason to make a reservation",
      couplesSelected,
      couplesAlternatives,
      {
        "cou-02": {
          "cou-09": {
            status: "override",
            reason: "The section would have three late-night events.",
          },
        },
        "cou-03": {
          "cou-07": {
            status: "unavailable",
            reason: "This conflicts with another selected occurrence window.",
          },
        },
      },
    ),
    makeSection(
      "golden-age",
      "Golden Age",
      "Good company, comfortable pace",
      goldenAgeSelected,
      goldenAgeAlternatives,
      {
        "gold-01": {
          "gold-07": {
            status: "override",
            reason: "The replacement starts earlier than this section normally allows.",
          },
        },
        "gold-05": {
          "gold-08": {
            status: "unavailable",
            reason: "The venue confirmation is incomplete in the source listing.",
          },
        },
      },
    ),
  ],
};
