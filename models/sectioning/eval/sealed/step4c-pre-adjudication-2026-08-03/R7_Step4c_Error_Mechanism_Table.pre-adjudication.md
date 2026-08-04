# R7 Step 4c — Error-Mechanism Table

**Status:** evidence worksheet, not a decision. The operating point and release status
remain in `R7_Scope.md`; any resulting architecture decision belongs in the Decision Log.

**Selection:** gate slice at `P(include) = 0.4530` — 3 demoted keepers + 32 surviving rejects = 35 rows.
Those rows represent **29 independent CV groups**; repeated rows are identified on their evidence cards so one mechanism ruling can cover identical events.

## Classification rule

For each row, choose exactly one primary mechanism:

- `label_error` — the current target is wrong or inconsistent.
- `missing_input` — decisive information exists but was absent from model-visible text.
- `representation_failure` — the information was present but the model missed it.
- `boundary_ambiguity` — reasonable editors could disagree from the available evidence.
- `policy_mismatch` — permanent include/reject is not the decision this row actually needs.

`TODO(ariel):` classify the mechanism, cite the evidence, and name the smallest fix.
Do not infer a model change from title alone; open the source only after reading what
the model actually saw, and record what the source added.

## Compact index

| # | Error | Row | Score | Margin | Label | Source | Input | Title |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | demoted_keeper | 218 | 0.2910 | -0.1619 | For Golden Age Readers | markham.bibliocommons.com | desc 300 chars | 10 Health Financial Management Habits |
| 2 | demoted_keeper | 258 | 0.3272 | -0.1258 | For Golden Age Readers | www.eventbrite.ca | desc 136 chars | Making Your Money Last in Retirement |
| 3 | demoted_keeper | 8 | 0.4294 | -0.0236 | For Families | allevents.in | TITLE ONLY | Young Founder Co. Week 4 — Lemonade Stand Live |
| 4 | surviving_junk | 61 | 0.8438 | +0.3909 | None | allevents.in | desc 123 chars | Bollywood  Boom Friday Night (Tickets Redeemable Inside) |
| 5 | surviving_junk | 377 | 0.8438 | +0.3909 | None | allevents.in | desc 123 chars | Bollywood  Boom Friday Night (Tickets Redeemable Inside) |
| 6 | surviving_junk | 297 | 0.8032 | +0.3502 | None | markham.bibliocommons.com | desc 300 chars | How to Monogram a Towel with Brother Digital Embroidery Machine |
| 7 | surviving_junk | 310 | 0.7508 | +0.2979 | None | www.vaughanpl.info | desc 131 chars | Baby Adventures Storytime |
| 8 | surviving_junk | 288 | 0.7344 | +0.2814 | None | www.eventbrite.ca | desc 139 chars | Let's Cook Vadai |
| 9 | surviving_junk | 359 | 0.7005 | +0.2475 | None | www.eventbrite.ca | desc 105 chars | Afghan Nights at Luna Lounge \| Canada Day Long Weekend |
| 10 | surviving_junk | 99 | 0.6571 | +0.2041 | None | allevents.in | TITLE ONLY | Russian Nights: Summer Vibes at Luna Lounge \| Russian, Latin & Club Anthems |
| 11 | surviving_junk | 233 | 0.6278 | +0.1748 | None | www.eventbrite.ca | desc 300 chars | Join us at the Toronto Fancon! TGC&Sports Collectibles,Cosplay,Kpop,fashion |
| 12 | surviving_junk | 164 | 0.6225 | +0.1695 | None | www.eventbrite.ca | TITLE ONLY | Holy Week with ESG: Easter Sunday |
| 13 | surviving_junk | 327 | 0.6074 | +0.1544 | None | allevents.in | desc 108 chars | Helen Snare Memorial Tournament |
| 14 | surviving_junk | 47 | 0.6074 | +0.1544 | None | allevents.in | desc 108 chars | Helen Snare Memorial Tournament |
| 15 | surviving_junk | 196 | 0.6031 | +0.1501 | None | www.vaughanpl.info | desc 225 chars | Baby Social |
| 16 | surviving_junk | 204 | 0.6024 | +0.1495 | None | www.eventbrite.com | desc 132 chars | Pulsars GYM FEST 2026 |
| 17 | surviving_junk | 269 | 0.5996 | +0.1466 | None | allevents.in | desc 300 chars | Teen Chess Tournament |
| 18 | surviving_junk | 252 | 0.5812 | +0.1282 | None | www.eventbrite.ca | desc 135 chars | Create for Your Business: Makerspace Session with GPL |
| 19 | surviving_junk | 115 | 0.5812 | +0.1282 | None | www.eventbrite.ca | desc 135 chars | Create for Your Business: Makerspace Session with GPL |
| 20 | surviving_junk | 369 | 0.5623 | +0.1094 | None | allevents.in | desc 87 chars | Songs for Turtle Island: National Indigenous Peoples Day |
| 21 | surviving_junk | 231 | 0.5579 | +0.1050 | None | www.eventbrite.ca | desc 92 chars | Beyond the Lease |
| 22 | surviving_junk | 70 | 0.5413 | +0.0883 | None | www.eventbrite.ca | desc 120 chars | 6STREET STARZ 1V1 FACEOFF |
| 23 | surviving_junk | 202 | 0.5407 | +0.0877 | None | allevents.in | desc 61 chars | RETRO |
| 24 | surviving_junk | 81 | 0.5167 | +0.0637 | None | www.eventbrite.ca | desc 116 chars | Hebrew Library |
| 25 | surviving_junk | 341 | 0.5162 | +0.0632 | None | allevents.in | TITLE ONLY | Theatre Workshop Sign-up Form |
| 26 | surviving_junk | 97 | 0.5162 | +0.0632 | None | allevents.in | TITLE ONLY | Theatre Workshop Sign-up Form |
| 27 | surviving_junk | 159 | 0.5133 | +0.0603 | None | www.eventbrite.ca | desc 133 chars | Oshkabewis Program – Summer Teachings for Indigenous Community Members |
| 28 | surviving_junk | 36 | 0.5043 | +0.0514 | None | allevents.in | desc 139 chars | Zumba Instructor Training with Ricardo Marmitte in Vaughan , ON, CA |
| 29 | surviving_junk | 127 | 0.4806 | +0.0277 | None | allevents.in | desc 300 chars | Child Car Seat Clinic (Vaughan) |
| 30 | surviving_junk | 388 | 0.4806 | +0.0277 | None | allevents.in | desc 300 chars | Child Car Seat Clinic (Vaughan) |
| 31 | surviving_junk | 366 | 0.4756 | +0.0227 | None | www.eventbrite.ca | desc 116 chars | Oshkabewis Program – Spring Gathering |
| 32 | surviving_junk | 167 | 0.4658 | +0.0129 | None | www.eventbrite.ca | desc 18 chars | MUZZLED |
| 33 | surviving_junk | 259 | 0.4611 | +0.0082 | None | allevents.in | TITLE ONLY | The Gathered Few Presents: The Sacred Places |
| 34 | surviving_junk | 354 | 0.4564 | +0.0034 | None | allevents.in | TITLE ONLY | YouTube AI Production Studio (Aug 10-14:AM) |
| 35 | surviving_junk | 62 | 0.4564 | +0.0034 | None | allevents.in | TITLE ONLY | YouTube AI Production Studio (Aug 10-14:AM) |

---

## Evidence cards

### 1. r218 — 10 Health Financial Management Habits

- **Observed error:** `demoted_keeper`; score `0.2910` (margin `-0.1619`)
- **Current label:** For Golden Age Readers
- **Label provenance:** Step 4b audited: KEEP
- **Same error/CV group rows:** none
- **Current None reason(s):** none
- **Current reasoning:** none
- **Input coverage:** 300 cleaned description chars; source categories present
- **Source:** [markham.bibliocommons.com](https://markham.bibliocommons.com/events/6a061df60c0f2c4503fa2461)

**Model-visible description:**

Audience: Adult, Older Adult Take Charge of Your Financial Fitness! This 60‑minute session helps participants become more confident and effective money managers by exploring the essentials of financial literacy. Attendees will assess their own financial fitness, learn the Ten Healthy Habits of Finan

**Observed live-source delta:**

HTTP 200. The live library description continues beyond the cached 300-character cutoff with budgeting, goal-setting, financial-literacy and CPA Canada details. The model-visible text already included 'Audience: Adult, Older Adult' and the financial-literacy premise.

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 2. r258 — Making Your Money Last in Retirement

- **Observed error:** `demoted_keeper`; score `0.3272` (margin `-0.1258`)
- **Current label:** For Golden Age Readers
- **Label provenance:** Step 4b audited: KEEP
- **Same error/CV group rows:** none
- **Current None reason(s):** none
- **Current reasoning:** none
- **Input coverage:** 136 cleaned description chars; source categories absent
- **Source:** [www.eventbrite.ca](https://www.eventbrite.ca/e/making-your-money-last-in-retirement-tickets-1982088306481)

**Model-visible description:**

Join us for an engaging seminar designed to help you confidently transition into retirement, and make the most of your financial future.

**Observed live-source delta:**

HTTP 200. The public Eventbrite metadata adds organizer, date and location but no clearer audience signal than the cached text; the model already saw 'transition into retirement' and 'financial future'.

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 3. r8 — Young Founder Co. Week 4 — Lemonade Stand Live

- **Observed error:** `demoted_keeper`; score `0.4294` (margin `-0.0236`)
- **Current label:** For Families
- **Label provenance:** Step 4b audited: KEEP
- **Same error/CV group rows:** none
- **Current None reason(s):** none
- **Current reasoning:** none
- **Input coverage:** 0 cleaned description chars; source categories present
- **Source:** [allevents.in](https://allevents.in/vaughan/young-founder-co-week-4-—-lemonade-stand-live/200030289794550)

**Model-visible description:**

_(no description — the model saw the title only)_

**Observed live-source delta:**

HTTP 200, event ID verified by fetchAllEventsDescriptions.js. The cached input was title-only; the live body yields 2,085 characters describing an ages 8–12 summer program, a real market stand, family/community guests and a charity donation.

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 4. r61 — Bollywood  Boom Friday Night (Tickets Redeemable Inside)

- **Observed error:** `surviving_junk`; score `0.8438` (margin `+0.3909`)
- **Current label:** None
- **Label provenance:** Current deck / batch 2 - Saturday (150)
- **Same error/CV group rows:** r377
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** none
- **Input coverage:** 123 cleaned description chars; source categories present
- **Source:** [allevents.in](https://allevents.in/vaughan/bollywood-boom-friday-night-tickets-redeemable-inside/100001990941121489)

**Model-visible description:**

Get ready to dance the night away at Bolly Boom Friday Night - where the tickets are your pass to a Bollywood-filled party!

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 5. r377 — Bollywood  Boom Friday Night (Tickets Redeemable Inside)

- **Observed error:** `surviving_junk`; score `0.8438` (margin `+0.3909`)
- **Current label:** None
- **Label provenance:** Current deck / batch 3 - Sunday (200)
- **Same error/CV group rows:** r61
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** for indian only, bollywood, too niche
- **Input coverage:** 123 cleaned description chars; source categories present
- **Source:** [allevents.in](https://allevents.in/vaughan/bollywood-boom-friday-night-tickets-redeemable-inside/100001990941121489)

**Model-visible description:**

Get ready to dance the night away at Bolly Boom Friday Night - where the tickets are your pass to a Bollywood-filled party!

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 6. r297 — How to Monogram a Towel with Brother Digital Embroidery Machine

- **Observed error:** `surviving_junk`; score `0.8032` (margin `+0.3502`)
- **Current label:** None
- **Label provenance:** Step 1c: editor-round1 / section n/a
- **Same error/CV group rows:** none
- **Current None reason(s):** outcompeted, wrong fit / not our audience
- **Current reasoning:** none
- **Input coverage:** 300 cleaned description chars; source categories present
- **Source:** [markham.bibliocommons.com](https://markham.bibliocommons.com/events/6a063441703c33630027a46f)

**Model-visible description:**

Audience: Adult, Youth Learn the basics of how to set up the embroidery machine and monogram a small face towel. Participants are asked to prepare 2-3 design ideas prior to the class. Further instruction and image criteria will be provided closer to the session date. Please check your spam folders p

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 7. r310 — Baby Adventures Storytime

- **Observed error:** `surviving_junk`; score `0.7508` (margin `+0.2979`)
- **Current label:** None
- **Label provenance:** Current deck / batch 3 - Sunday (200)
- **Same error/CV group rows:** none
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** for babies, too niche
- **Input coverage:** 131 cleaned description chars; source categories absent
- **Source:** [www.vaughanpl.info](https://www.vaughanpl.info/programs/view/2865)

**Model-visible description:**

Join us for lively songs, bounces, rhymes, and plenty of baby time fun. This program is designed for babies from birth to crawling.

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 8. r288 — Let's Cook Vadai

- **Observed error:** `surviving_junk`; score `0.7344` (margin `+0.2814`)
- **Current label:** None
- **Label provenance:** Current deck / batch 3 - Sunday (200)
- **Same error/CV group rows:** none
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** cooking for south asian (honestly could be placed under outcompeted)
- **Input coverage:** 139 cleaned description chars; source categories absent
- **Source:** [www.eventbrite.ca](https://www.eventbrite.ca/e/lets-cook-vadai-tickets-1985833822420)

**Model-visible description:**

Celebrate South Asian Heritage Month by learning how to cook vadai! In partnership with Vaughan Tamils’ Heritage and Cultural Organization.

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 9. r359 — Afghan Nights at Luna Lounge | Canada Day Long Weekend

- **Observed error:** `surviving_junk`; score `0.7005` (margin `+0.2475`)
- **Current label:** None
- **Label provenance:** Current deck / batch 3 - Sunday (200)
- **Same error/CV group rows:** none
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** this is very specfic type of music, just for middle eastern
- **Input coverage:** 105 cleaned description chars; source categories present
- **Source:** [www.eventbrite.ca](https://www.eventbrite.ca/e/afghan-nights-at-luna-lounge-canada-day-long-weekend-tickets-1991410033016)

**Model-visible description:**

Celebrate Canada Day Long Weekend with Afghan, Persian, and Bollywood music by DJ Kourosh at Luna Lounge.

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 10. r99 — Russian Nights: Summer Vibes at Luna Lounge | Russian, Latin & Club Anthems

- **Observed error:** `surviving_junk`; score `0.6571` (margin `+0.2041`)
- **Current label:** None
- **Label provenance:** Current deck / batch 2 - Saturday (150)
- **Same error/CV group rows:** none
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** cultural thing, only for russians
- **Input coverage:** 0 cleaned description chars; source categories present
- **Source:** [allevents.in](https://allevents.in/richmond-hill/russian-nights-summer-vibes-at-luna-lounge-|-russian-latin-and-club-anthems/100001992802706540)

**Model-visible description:**

_(no description — the model saw the title only)_

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 11. r233 — Join us at the Toronto Fancon! TGC&Sports Collectibles,Cosplay,Kpop,fashion

- **Observed error:** `surviving_junk`; score `0.6278` (margin `+0.1748`)
- **Current label:** None
- **Label provenance:** Current deck / batch 3 - Sunday (200)
- **Same error/CV group rows:** none
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** not audience fit even though k-pop is popular with non-koreans

- **Input coverage:** 300 cleaned description chars; source categories absent
- **Source:** [www.eventbrite.ca](https://www.eventbrite.ca/e/join-us-at-the-toronto-fancon-tgcsports-collectiblescosplaykpopfashion-tickets-1989862241530?aff=ebdssbdestsearch)

**Model-visible description:**

Buy, Sell, Trade & Celebrate! Make amazing deals, watch energetic Kpop performances, cosplay events & fashion shows &much more! Toronto Spring FanCon 2026 Sports Colelctibles,TCG/pokemon,Toys, Anime, Cosplay, K-Pop, fashion & Pop Culture Convention in Toronto Toronto Spring FanCon 2026 is taking ove

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 12. r164 — Holy Week with ESG: Easter Sunday

- **Observed error:** `surviving_junk`; score `0.6225` (margin `+0.1695`)
- **Current label:** None
- **Label provenance:** Current deck / batch 2 - Saturday (150)
- **Same error/CV group rows:** none
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** none
- **Input coverage:** 0 cleaned description chars; source categories absent
- **Source:** [www.eventbrite.ca](https://www.eventbrite.ca/e/holy-week-with-esg-easter-sunday-tickets-1981795056362?aff=ebdssbdestsearch)

**Model-visible description:**

_(no description — the model saw the title only)_

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 13. r327 — Helen Snare Memorial Tournament

- **Observed error:** `surviving_junk`; score `0.6074` (margin `+0.1544`)
- **Current label:** None
- **Label provenance:** Current deck / batch 3 - Sunday (200)
- **Same error/CV group rows:** r47
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** weird tournament?
- **Input coverage:** 108 cleaned description chars; source categories present
- **Source:** [allevents.in](https://allevents.in/richmond-hill/helen-snare-memorial-tournament/200030239967859)

**Model-visible description:**

AllEvents Categories: Sports AllEvents Organizer: Richmond Hill Lawn Bowling Club AllEvents Score: 31.059999

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 14. r47 — Helen Snare Memorial Tournament

- **Observed error:** `surviving_junk`; score `0.6074` (margin `+0.1544`)
- **Current label:** None
- **Label provenance:** Current deck / batch 1 - Pilot (50)
- **Same error/CV group rows:** r327
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** too niche, snare tournament is ??
- **Input coverage:** 108 cleaned description chars; source categories present
- **Source:** [allevents.in](https://allevents.in/richmond-hill/helen-snare-memorial-tournament/200030239967859)

**Model-visible description:**

AllEvents Categories: Sports AllEvents Organizer: Richmond Hill Lawn Bowling Club AllEvents Score: 31.059999

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 15. r196 — Baby Social

- **Observed error:** `surviving_junk`; score `0.6031` (margin `+0.1501`)
- **Current label:** None
- **Label provenance:** Current deck / batch 2 - Saturday (150)
- **Same error/CV group rows:** none
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** for babies, too niche
- **Input coverage:** 225 cleaned description chars; source categories absent
- **Source:** [www.vaughanpl.info](https://www.vaughanpl.info/programs/view/2573)

**Model-visible description:**

Drop in and meet other parents and babies in your community! We will feature a new topic every session along with activities, singing, free play, and occasional guest speakers. For ages 0-12 months with a parent or caregiver.

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 16. r204 — Pulsars GYM FEST 2026

- **Observed error:** `surviving_junk`; score `0.6024` (margin `+0.1495`)
- **Current label:** None
- **Label provenance:** Step 1c: ariel / section n/a
- **Same error/CV group rows:** none
- **Current None reason(s):** outcompeted, wrong fit / not our audience
- **Current reasoning:** none
- **Input coverage:** 132 cleaned description chars; source categories absent
- **Source:** [www.eventbrite.com](https://www.eventbrite.com/e/pulsars-gym-fest-2026-tickets-1987851277683)

**Model-visible description:**

Welcome to Pulsars GYM FEST 2026! An event that brings our entire Pulsars community and friends to come watch our year end showcase.

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 17. r269 — Teen Chess Tournament

- **Observed error:** `surviving_junk`; score `0.5996` (margin `+0.1466`)
- **Current label:** None
- **Label provenance:** Current deck / batch 3 - Sunday (200)
- **Same error/CV group rows:** none
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** didn't get lots of clicks, kinda niche (only asian poeple go to these)
- **Input coverage:** 300 cleaned description chars; source categories present
- **Source:** [allevents.in](https://allevents.in/vaughan/teen-chess-tournament/100001990505650985)

**Model-visible description:**

Test your strategy in our library chess tournament! Compete against fellow players over several rounds, climb the rankings, and play for a prize. Whether you're experienced or just love the game, all are welcome. For grades 9-12. Connect and compete with other chess enthusiasts! Matches will be time

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 18. r252 — Create for Your Business: Makerspace Session with GPL

- **Observed error:** `surviving_junk`; score `0.5812` (margin `+0.1282`)
- **Current label:** None
- **Label provenance:** Current deck / batch 3 - Sunday (200)
- **Same error/CV group rows:** r115
- **Current None reason(s):** B2B / professional dev
- **Current reasoning:** none
- **Input coverage:** 135 cleaned description chars; source categories absent
- **Source:** [www.eventbrite.ca](https://www.eventbrite.ca/e/create-for-your-business-makerspace-session-with-gpl-tickets-1988453978377)

**Model-visible description:**

Explore the Georgina Public Library Makerspace and discover tools to help you create products, prototypes, and merch for your business.

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 19. r115 — Create for Your Business: Makerspace Session with GPL

- **Observed error:** `surviving_junk`; score `0.5812` (margin `+0.1282`)
- **Current label:** None
- **Label provenance:** Current deck / batch 2 - Saturday (150)
- **Same error/CV group rows:** r252
- **Current None reason(s):** B2B / professional dev
- **Current reasoning:** none
- **Input coverage:** 135 cleaned description chars; source categories absent
- **Source:** [www.eventbrite.ca](https://www.eventbrite.ca/e/create-for-your-business-makerspace-session-with-gpl-tickets-1988453978377)

**Model-visible description:**

Explore the Georgina Public Library Makerspace and discover tools to help you create products, prototypes, and merch for your business.

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 20. r369 — Songs for Turtle Island: National Indigenous Peoples Day

- **Observed error:** `surviving_junk`; score `0.5623` (margin `+0.1094`)
- **Current label:** None
- **Label provenance:** Current deck / batch 3 - Sunday (200)
- **Same error/CV group rows:** none
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** for indigenous people, too niche
- **Input coverage:** 87 cleaned description chars; source categories present
- **Source:** [allevents.in](https://allevents.in/richmond-hill/songs-for-turtle-island-national-indigenous-peoples-day/200030260273826)

**Model-visible description:**

AllEvents Categories: Workshops AllEvents Organizer: Odeiwin AllEvents Score: 40.680000

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 21. r231 — Beyond the Lease

- **Observed error:** `surviving_junk`; score `0.5579` (margin `+0.1050`)
- **Current label:** None
- **Label provenance:** Step 1c: ariel / section n/a
- **Same error/CV group rows:** none
- **Current None reason(s):** outcompeted, B2B / professional dev
- **Current reasoning:** none
- **Input coverage:** 92 cleaned description chars; source categories absent
- **Source:** [www.eventbrite.ca](https://www.eventbrite.ca/e/beyond-the-lease-tickets-1988030444576)

**Model-visible description:**

Dive into Beyond the Lease, where renting meets fun, food, and fresh ideas all face-to-face!

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 22. r70 — 6STREET STARZ 1V1 FACEOFF

- **Observed error:** `surviving_junk`; score `0.5413` (margin `+0.0883`)
- **Current label:** None
- **Label provenance:** Current deck / batch 2 - Saturday (150)
- **Same error/CV group rows:** none
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** none
- **Input coverage:** 120 cleaned description chars; source categories absent
- **Source:** [www.eventbrite.ca](https://www.eventbrite.ca/e/6street-starz-1v1-faceoff-tickets-1987788967311)

**Model-visible description:**

Get ready to battle it out live at 6STREET STARZ 1V1 FACEOFF—where the best go head-to-head! All ticket sales are final.

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 23. r202 — RETRO

- **Observed error:** `surviving_junk`; score `0.5407` (margin `+0.0877`)
- **Current label:** None
- **Label provenance:** Current deck / batch 3 - Sunday (200)
- **Same error/CV group rows:** none
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** weird event, seems like it's someone's birhtday even though it's a festival
- **Input coverage:** 61 cleaned description chars; source categories absent
- **Source:** [allevents.in](https://allevents.in/vaughan/retro/200030125490344)

**Model-visible description:**

AllEvents Organizer: TicketGateway AllEvents Score: 45.220001

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 24. r81 — Hebrew Library

- **Observed error:** `surviving_junk`; score `0.5167` (margin `+0.0637`)
- **Current label:** None
- **Label provenance:** Current deck / batch 2 - Saturday (150)
- **Same error/CV group rows:** none
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** only for jews, too niche
- **Input coverage:** 116 cleaned description chars; source categories absent
- **Source:** [www.eventbrite.ca](https://www.eventbrite.ca/e/hebrew-library-tickets-1988494286941)

**Model-visible description:**

The Israeli Book Market invites you to a friendly Hebrew book exchange in collaboration with PJ Library and the JCC.

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 25. r341 — Theatre Workshop Sign-up Form

- **Observed error:** `surviving_junk`; score `0.5162` (margin `+0.0632`)
- **Current label:** None
- **Label provenance:** Current deck / batch 3 - Sunday (200)
- **Same error/CV group rows:** r97
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** too niche, theatre workshop, people don't like it
- **Input coverage:** 0 cleaned description chars; source categories present
- **Source:** [allevents.in](https://allevents.in/markham/theatre-workshop-sign-up-form/100001992066924797)

**Model-visible description:**

_(no description — the model saw the title only)_

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 26. r97 — Theatre Workshop Sign-up Form

- **Observed error:** `surviving_junk`; score `0.5162` (margin `+0.0632`)
- **Current label:** None
- **Label provenance:** Current deck / batch 2 - Saturday (150)
- **Same error/CV group rows:** r341
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** none
- **Input coverage:** 0 cleaned description chars; source categories present
- **Source:** [allevents.in](https://allevents.in/markham/theatre-workshop-sign-up-form/100001992066924797)

**Model-visible description:**

_(no description — the model saw the title only)_

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 27. r159 — Oshkabewis Program – Summer Teachings for Indigenous Community Members

- **Observed error:** `surviving_junk`; score `0.5133` (margin `+0.0603`)
- **Current label:** None
- **Label provenance:** Current deck / batch 2 - Saturday (150)
- **Same error/CV group rows:** none
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** only for one culture
- **Input coverage:** 133 cleaned description chars; source categories absent
- **Source:** [www.eventbrite.ca](https://www.eventbrite.ca/e/oshkabewis-program-summer-teachings-for-indigenous-community-members-tickets-1990823626057)

**Model-visible description:**

An opportunity for Indigenous Community members to connect through Fire teachings, land-based learning, and community responsibility.

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 28. r36 — Zumba Instructor Training with Ricardo Marmitte in Vaughan , ON, CA

- **Observed error:** `surviving_junk`; score `0.5043` (margin `+0.0514`)
- **Current label:** None
- **Label provenance:** Current deck / batch 1 - Pilot (50)
- **Same error/CV group rows:** none
- **Current None reason(s):** B2B / professional dev, wrong fit / not our audience
- **Current reasoning:** From my experience this type of events is not popular.
- **Input coverage:** 139 cleaned description chars; source categories present
- **Source:** [allevents.in](https://allevents.in/vaughan/zumba-instructor-training-with-ricardo-marmitte-in-vaughan-on-ca/200029987362750)

**Model-visible description:**

AllEvents Categories: dance, entertainment, zumba, health-wellness, workshops AllEvents Organizer: Zumba Fitness AllEvents Score: 44.540001

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 29. r127 — Child Car Seat Clinic (Vaughan)

- **Observed error:** `surviving_junk`; score `0.4806` (margin `+0.0277`)
- **Current label:** None
- **Label provenance:** Current deck / batch 2 - Saturday (150)
- **Same error/CV group rows:** r388
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** for kids, too niche
- **Input coverage:** 300 cleaned description chars; source categories present
- **Source:** [allevents.in](https://allevents.in/vaughan/child-car-seat-clinic-vaughan/100001992207308689)

**Model-visible description:**

View full event detailsYork Regional Police wants to keep everyone on our roads safe - including passengers too young to buckle themselves up.York Regional Police has trained Child Passenger Safety Technicians who provide child restraint/car seat inspection clinics free of charge (reservation deposi

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 30. r388 — Child Car Seat Clinic (Vaughan)

- **Observed error:** `surviving_junk`; score `0.4806` (margin `+0.0277`)
- **Current label:** None
- **Label provenance:** Current deck / batch 3 - Sunday (200)
- **Same error/CV group rows:** r127
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** only for kids
- **Input coverage:** 300 cleaned description chars; source categories present
- **Source:** [allevents.in](https://allevents.in/vaughan/child-car-seat-clinic-vaughan/100001992207308689)

**Model-visible description:**

View full event detailsYork Regional Police wants to keep everyone on our roads safe - including passengers too young to buckle themselves up.York Regional Police has trained Child Passenger Safety Technicians who provide child restraint/car seat inspection clinics free of charge (reservation deposi

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 31. r366 — Oshkabewis Program – Spring Gathering

- **Observed error:** `surviving_junk`; score `0.4756` (margin `+0.0227`)
- **Current label:** None
- **Label provenance:** Current deck / batch 3 - Sunday (200)
- **Same error/CV group rows:** none
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** for indigenous people, too niche
- **Input coverage:** 116 cleaned description chars; source categories absent
- **Source:** [www.eventbrite.ca](https://www.eventbrite.ca/e/oshkabewis-program-spring-gathering-tickets-1989924180792)

**Model-visible description:**

An Indigenous land-based learning journey focused on Fire teachings, ceremony support, and community responsibility.

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 32. r167 — MUZZLED

- **Observed error:** `surviving_junk`; score `0.4658` (margin `+0.0129`)
- **Current label:** None
- **Label provenance:** Current deck / batch 2 - Saturday (150)
- **Same error/CV group rows:** none
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** for furries, NO!
- **Input coverage:** 18 cleaned description chars; source categories absent
- **Source:** [www.eventbrite.ca](https://www.eventbrite.ca/e/muzzled-tickets-1980870139912)

**Model-visible description:**

Let’s GET MUZZLED!

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 33. r259 — The Gathered Few Presents: The Sacred Places

- **Observed error:** `surviving_junk`; score `0.4611` (margin `+0.0082`)
- **Current label:** None
- **Label provenance:** Current deck / batch 3 - Sunday (200)
- **Same error/CV group rows:** none
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** for christian women, too niche
- **Input coverage:** 0 cleaned description chars; source categories present
- **Source:** [allevents.in](https://allevents.in/vaughan/the-gathered-few-presents-the-sacred-places/100001991294049105)

**Model-visible description:**

_(no description — the model saw the title only)_

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 34. r354 — YouTube AI Production Studio (Aug 10-14:AM)

- **Observed error:** `surviving_junk`; score `0.4564` (margin `+0.0034`)
- **Current label:** None
- **Label provenance:** Step 1c: editor-round1 / section n/a
- **Same error/CV group rows:** r62
- **Current None reason(s):** outcompeted, wrong fit / not our audience
- **Current reasoning:** none
- **Input coverage:** 0 cleaned description chars; source categories present
- **Source:** [allevents.in](https://allevents.in/vaughan/youtube-ai-production-studio-aug-10-14-am/200030125523057)

**Model-visible description:**

_(no description — the model saw the title only)_

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---

### 35. r62 — YouTube AI Production Studio (Aug 10-14:AM)

- **Observed error:** `surviving_junk`; score `0.4564` (margin `+0.0034`)
- **Current label:** None
- **Label provenance:** Step 4b audited: NEVER
- **Same error/CV group rows:** r354
- **Current None reason(s):** wrong fit / not our audience
- **Current reasoning:** NEVER. too niche
- **Input coverage:** 0 cleaned description chars; source categories present
- **Source:** [allevents.in](https://allevents.in/vaughan/youtube-ai-production-studio-aug-10-14-am/200030125523057)

**Model-visible description:**

_(no description — the model saw the title only)_

**Observed live-source delta:**

_(not checked yet)_

**TODO(ariel) primary mechanism:**

**Evidence—including what the live source adds, if opened:**

**Smallest fix, or `none`:**

---
