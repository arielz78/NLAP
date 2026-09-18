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
    sourceLabel: "View event",
    sourceUrl: `https://example.com/events/${id}`,
    classification: "classified",
  };
}

function makeSection(
  id: SectionId,
  label: string,
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
    "Fall Into Nature: Maple Harvest Family Day at Kortright — Demonstrations, Forest Walks, Crafts & More",
    "2026-09-12T10:00:00-04:00",
    "Kortright Centre",
    "Kleinburg",
    "Join us for a full morning of seasonal activities for families, including a guided forest walk, a maple demonstration, children’s crafts and a small tasting station. Admission is required for adults and children; activities run rain or shine and outdoor footwear is strongly recommended.",
  ),
  candidate(
    "fam-02",
    "Saturday Storytime & STEAM Activity — Drop-In Program for Children Ages 4–8",
    "2026-09-12T11:00:00-04:00",
    "Pierre Berton Resource Library",
    "Vaughan",
    "Children and their caregivers are invited to listen to two picture books and stay for a hands-on STEAM activity connected to the stories. This is a drop-in program while supplies last; caregivers must remain in the program room and younger siblings are welcome to attend.",
  ),
  candidate(
    "fam-03",
    "Junior Naturalists — What’s Living in the Pond? Family Nature Program",
    "2026-09-13T09:30:00-04:00",
    "Boyd Conservation Park",
    "Woodbridge",
    "Explore the pond edge with an interpreter and learn how insects, amphibians and plants share the same habitat. Participants will use nets and observation trays before returning everything safely to the water. Children must be accompanied by an adult, and the route includes uneven ground.",
  ),
  candidate(
    "fam-04",
    "Vellore Village Community Touch-a-Truck & Emergency Services Open House",
    "2026-09-13T12:00:00-04:00",
    "Vellore Village Community Centre",
    "Vaughan",
    "Families can see emergency, construction and municipal service vehicles up close, speak with operators and visit community information tables. A reduced-noise hour is scheduled at the beginning of the event. Vehicle availability may change if equipment is required for active service.",
  ),
  candidate(
    "fam-05",
    "Family Hand-Building with Clay: Create and Decorate a Keepsake Together",
    "2026-09-13T14:00:00-04:00",
    "Vaughan City Playhouse Studio",
    "Vaughan",
    "Work together on a small hand-built clay project in this instructor-led family workshop. Registration covers one adult and one child, clay, glazing and kiln firing; finished pieces will be available for pickup at a later date. Please wear clothes that can get messy.",
  ),
];

const familiesAlternatives = [
  candidate(
    "fam-06",
    "Mini Makers Market 2026 — Kid Vendors, Hands-On Workshops & Family Craft Table",
    "2026-09-12T13:00:00-04:00",
    "Assembly Park",
    "Vaughan",
    "Browse tables run by young makers selling artwork, jewellery, baked goods and small crafts, then visit the shared activity table to make something of your own. Admission is free, but individual workshops and vendor items may have separate fees. Children must remain with a caregiver.",
  ),
  candidate(
    "fam-07",
    "Movies Under the Stars Presents: Paddington — Free Outdoor Family Screening",
    "2026-09-12T19:30:00-04:00",
    "North Thornhill Community Centre",
    "Thornhill",
    "Bring lawn chairs and blankets for a free outdoor screening beginning at dusk. The event area opens earlier for family activities and concession sales. The screening is weather-dependent, and updates or cancellation notices will be posted by the organizer on the day of the event.",
  ),
  candidate(
    "fam-08",
    "Build a Backyard Birdhouse — Parent/Child Workshop with Materials Included",
    "2026-09-13T10:30:00-04:00",
    "Mackenzie Glen District Park",
    "Maple",
    "A facilitator will guide each parent-and-child team through assembling a simple wooden birdhouse and preparing it for outdoor use. Basic materials and shared tools are included, but quantities are limited and advance registration is recommended. Safety glasses will be provided.",
  ),
  candidate(
    "fam-09",
    "Sunday Indoor Inflatable Fun Fair — Timed Entry, Games and Toddler Zone",
    "2026-09-13T11:00:00-04:00",
    "Chancellor Community Centre",
    "Woodbridge",
    "The gymnasium will be set up with inflatable obstacles, slides, carnival-style games and a separate area for younger children. Tickets are sold by timed admission block and socks are required. Capacity is limited, and adults must supervise children throughout the session.",
  ),
];

const couplesSelected = [
  candidate(
    "cou-01",
    "Twilight Vineyard Walk & Guided Tasting — Late-Summer Evening Experience",
    "2026-09-11T18:30:00-04:00",
    "Magnotta Winery",
    "Vaughan",
    "Begin with a guided walk through the vineyard as staff explain the growing season and harvest process, followed by a seated tasting flight indoors. This is a ticketed 19+ event and government-issued identification is required. Outdoor portions may be adjusted for weather.",
  ),
  candidate(
    "cou-02",
    "Live Jazz in the Courtyard: Friday Night Trio Performance with Café Seating",
    "2026-09-11T20:00:00-04:00",
    "The Village at Vaughan Mills",
    "Vaughan",
    "A local jazz trio performs two outdoor sets in the central courtyard, with limited first-come seating and additional standing room. Food and drinks are available from nearby businesses and are not included. In the event of poor weather, the performance may move indoors or be cancelled.",
  ),
  candidate(
    "cou-03",
    "Date Night on the Pottery Wheel — Two-Person Beginner Session, Glazing Included",
    "2026-09-12T18:00:00-04:00",
    "Creative Village Studio",
    "Maple",
    "This two-person beginner class introduces centring, shaping and trimming on the pottery wheel with step-by-step instruction. Each participant can keep one finished piece, with glazing and firing included in the ticket price. Finished work must be collected approximately three weeks later.",
  ),
  candidate(
    "cou-04",
    "Chef’s Table Dinner: A Multi-Course Late-Summer Menu Featuring Ontario Produce",
    "2026-09-12T19:00:00-04:00",
    "Market Lane Kitchen",
    "Woodbridge",
    "The kitchen will serve a fixed multi-course menu built around late-summer produce from Ontario growers, with each course introduced by the chef. Tickets include dinner but not beverages or gratuity. Dietary substitutions are limited and must be requested before booking.",
  ),
  candidate(
    "cou-05",
    "Moonlight Sculpture Garden Tour at the McMichael — After-Hours Guided Walk",
    "2026-09-13T20:00:00-04:00",
    "McMichael Canadian Art Collection",
    "Kleinburg",
    "Visit the outdoor sculpture garden after regular museum hours on a guided walk focused on selected works and the surrounding landscape. The tour follows gravel and gently sloped paths and runs in light rain. Museum admission and indoor gallery access are not included unless stated on the ticket.",
  ),
];

const couplesAlternatives = [
  candidate(
    "cou-06",
    "Local Independent Short Film Showcase Followed by an In-Person Director Q&A",
    "2026-09-12T19:30:00-04:00",
    "City Playhouse Theatre",
    "Vaughan",
    "The evening includes a curated program of locally produced short films followed by a moderated conversation with participating filmmakers. Some films contain mature themes and the program is recommended for adults. General-admission seating opens thirty minutes before the screening.",
  ),
  candidate(
    "cou-07",
    "Salsa Under the Stars — Beginner Lesson and Outdoor Social Dancing at Assembly Park",
    "2026-09-12T20:00:00-04:00",
    "Assembly Park",
    "Vaughan",
    "The night begins with a beginner-friendly salsa lesson before the floor opens for social dancing with a live DJ. No partner or previous experience is required. Comfortable shoes are recommended, and the outdoor program may be postponed if the dance surface is wet.",
  ),
  candidate(
    "cou-08",
    "Sunday Coffee Cupping Workshop for Two — Compare Four Small-Batch Roasts",
    "2026-09-13T10:00:00-04:00",
    "Railway Street Roasters",
    "Kleinburg",
    "Learn the basic cupping process while comparing aroma, acidity, body and finish across four small-batch coffees. The session includes shared tasting equipment and a short roasting demonstration. Tickets are sold per pair and the workshop lasts approximately ninety minutes.",
  ),
  candidate(
    "cou-09",
    "Rooftop Comedy Night: Touring Headliner, Local Openers and General Admission Seating",
    "2026-09-13T20:30:00-04:00",
    "Jane Street Social Club",
    "Vaughan",
    "An outdoor stand-up showcase featuring a touring headliner and several local opening acts. Doors open forty-five minutes before showtime and seating is first come, first served. The performance is intended for mature audiences and may move indoors if weather conditions require it.",
  ),
];

const goldenAgeSelected = [
  candidate(
    "gold-01",
    "Old Woodbridge Heritage Walking Tour — Main Street, Memorial Tower and Humber River Stories",
    "2026-09-11T10:00:00-04:00",
    "Woodbridge Memorial Tower",
    "Woodbridge",
    "Join a local historian for a guided walk through Old Woodbridge, with stops at the Memorial Tower, former commercial buildings and sites connected to the Humber River. The route is approximately two kilometres with several standing stops. Comfortable footwear and advance registration are recommended.",
  ),
  candidate(
    "gold-02",
    "Friday Afternoon Chamber Music Recital — Works for String Quartet in the City Hall Atrium",
    "2026-09-11T14:00:00-04:00",
    "Vaughan City Hall Atrium",
    "Vaughan",
    "A local string quartet performs a one-hour program of classical and contemporary selections in the City Hall atrium. Admission is free and no registration is required, but seating is limited and available on a first-come basis. Audience members should arrive at least fifteen minutes early.",
  ),
  candidate(
    "gold-03",
    "Introduction to Watercolour Painting for Adults — Materials Provided, No Experience Required",
    "2026-09-12T10:30:00-04:00",
    "Dufferin Clark Library",
    "Vaughan",
    "This introductory workshop covers basic washes, colour mixing and simple brush techniques before participants complete a small landscape study. Paper, paint and brushes are supplied for use during the class. Space is limited, and registration is required through the library’s program calendar.",
  ),
  candidate(
    "gold-04",
    "Fall Garden Questions Answered: Bulbs, Pruning, Soil Care and Preparing for Winter",
    "2026-09-12T13:30:00-04:00",
    "Maple Community Garden",
    "Maple",
    "Bring questions about planting bulbs, pruning shrubs, improving soil and preparing garden beds for colder weather. Volunteer gardeners will offer general guidance and demonstrate a few seasonal tasks. Participants may bring photographs, but plant-disease diagnosis and soil testing are not available onsite.",
  ),
  candidate(
    "gold-05",
    "Sunday Afternoon Tea and Illustrated Talk: Stories from Kleinburg’s Early Main Street",
    "2026-09-13T14:00:00-04:00",
    "Kleinburg Heritage House",
    "Kleinburg",
    "An illustrated presentation explores businesses, residents and everyday life along Kleinburg’s early Main Street using photographs from the local collection. Tea and light refreshments will be served after the talk. Advance tickets are required because seating in the heritage house is limited.",
  ),
];

const goldenAgeAlternatives = [
  candidate(
    "gold-06",
    "Classic Cinema Friday Matinee with Captions and Optional Post-Film Discussion",
    "2026-09-11T13:00:00-04:00",
    "Bathurst Clark Resource Library",
    "Thornhill",
    "Watch a classic feature film in the library program room with captions enabled, followed by an optional informal discussion led by staff. Admission is free and drop-in, subject to room capacity. The film title and runtime are listed on the organizer’s event page.",
  ),
  candidate(
    "gold-07",
    "Birding from the Boardwalk — Easy-Paced Morning Walk for New and Returning Birders",
    "2026-09-12T08:30:00-04:00",
    "Marita Payne Park",
    "Vaughan",
    "A volunteer guide leads an easy-paced morning outing along the boardwalk and nearby paved paths, with frequent stops to identify resident and migrating birds. Bring binoculars if available and dress for changing weather. The walk is approximately ninety minutes and may be cancelled during heavy rain.",
  ),
  candidate(
    "gold-08",
    "Community Choir Open Rehearsal — Listen In or Sing Familiar Standards with the Group",
    "2026-09-13T15:00:00-04:00",
    "Rosemount Community Centre",
    "Thornhill",
    "Visitors are welcome to observe a regular community choir rehearsal or join the group for several familiar standards. Printed lyrics will be available, and no audition or previous choir experience is required for this open session. Please arrive before the rehearsal begins so seating can be arranged.",
  ),
  candidate(
    "gold-09",
    "Smartphone Photography Walk: Composition, Exposure and Camera Settings in Bindertwine Park",
    "2026-09-13T10:00:00-04:00",
    "Bindertwine Park",
    "Kleinburg",
    "Practice composition, exposure controls and common smartphone camera settings during a guided walk through the park. Participants should bring a charged phone with storage available and be prepared to walk on packed gravel paths. The session is instructional rather than device-specific technical support.",
  ),
];

export const mockIssueBuild: IssueBuild = {
  id: "10000000-0000-4000-8000-000000000002",
  issueKey: "vaughan-brief-2026-09-17",
  issueDate: "2026-09-17",
  buildVersion: 2,
  contractVersion: "r8.editor-console.v1",
  bundleHash: "fixture-2026-09-17-v2-raw-copy",
  ordering: {
    adapterVersion: "fixture-adapter-v1",
    rankerVersion: "fixture-ranker-v1",
    evidenceVersion: "fixture-evidence-v1",
    generatedAt: "2026-09-17T09:00:00-04:00",
    inputHash: "fixture-input-2026-09-17-raw-copy",
  },
  sections: [
    makeSection(
      "families",
      "Families",
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
