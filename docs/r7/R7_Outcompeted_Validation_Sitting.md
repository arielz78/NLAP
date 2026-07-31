# R7 — `outcompeted` Validation Sitting

**Purpose:** decide whether `outcompeted` is a clean eligibility label — i.e. whether a row marked `outcompeted` means *"this met the editorial bar and entered the ranking pool, but stronger events took the slots"* (→ gate-positive, `y=1`) or whether the label is also absorbing permanent rejections (→ keep withheld, or relabel).

**Why it matters:** 69 rows carry `outcompeted` alone. Under `Decision_Log` §77 they are **withheld from the gate**. If the label is actually clean eligibility, they belong in the gate's positive class and the fit set grows by 69. That single question moves the removable rate, the eligibility rate, and Fork C.

**Type: Release-working.** Delete or fold into `R7_None_Split_Labelling_Plan.md` once the result is recorded in the Scope Status Snapshot.

---

## What this sitting can and cannot prove

- ✅ It **can** prove that bulk-converting all 69 to gate-positive is unsafe.
- ❌ It **cannot** estimate what fraction of the 69 are contaminated. The 20 rows were chosen as *hard cases*, deliberately — this is a discriminative sample, not a representative one.
- ⚠️ This is **separate** from the proposed 20–50-row audit of the original 211 section-positive rows. That one asks whether the *positive class* is contaminated. This one asks what a *label* means.

---

## Protocol — two phases, in order

**Phase 1 must be blind.** Do not open Airtable for it: the deck row displays `NoneReason = outcompeted` and his own prior `NoneReasoning`, which is exactly the anchor this design exists to avoid. Use the sheet below and nothing else.

### Phase 1 — blind reassessment

Show the event and its description only. No label, no grouping, no prior reasoning. Ask:

> **"Assume this happened locally during a quiet week. What would you do with it, and why?"**

Record exactly one outcome per row:

- **eligible** — would enter the ranking pool
- **permanent-reject** — would never run it
- **unclear** — genuinely indeterminate

### Phase 2 — label semantics

Only after every Phase 1 answer is written down, reveal the prior label and ask:

> **"You previously marked this `outcompeted`. What did `outcompeted` mean for this event?"**

This separates *is the event gate-eligible?* from *how was the label being used?* — two different questions that the original sitting collapsed.

### Recording format

```text
r53 — eligible — explanation
```

---

## Decision rule (set before the data, so it can't be rationalised after)

| Phase 1 result | Consequence |
|---|---|
| Hard cases consistently **eligible** | `outcompeted` alone → gate-**positive** (`y=1`) |
| Several return **permanent-reject** | The label is impure — reassess all 69, or keep them withheld |
| **Mixed / unclear** | Relabel or exclude. **Do not invent a soft label** (`0.75`, "weak positive") — that hides the ambiguity in a number |

---

## Three rows to watch

Not shown to the editor — for your read afterwards.

- **r423** is the single most informative row. His original words were *"this is a party, so outcompeted"* — using the label to mean **wrong type**, which is a permanent property of the event, not a property of the week.
- **r136 / r384** and **r52 / r303** are two hidden duplicate pairs — same event, entered the deck twice, both marked `outcompeted` independently. Different Phase 1 answers on a pair is a direct read on how noisy this judgment is. ⚠️ Their descriptions are byte-identical and they sit close together in the sheet, so he may notice; treat a spotted pair as a void check, not a passed one.
- **Do not let r423 decide it alone.** The pattern across the whole sheet is the finding.

---

# PHASE 1 — BLIND SHEET

*Order is shuffled with a fixed seed. Do not re-sort — sorting by row number restores the grouping-by-hypothesis this is designed to hide.*

Three rows have almost no collected description (r69, r147, r173). He will need the link, exactly as he did the first time. That is the real condition the gate faces, not a defect in the sample.

---

**r384 — K-pop Dance Camp**
> Join our FREE K-pop Dance Camp this summer! Connect, learn popular routines, and perform in a showcase. Open to Grade 9+ & young adults. Love K-pop and want to learn the moves? This dance workshop is for you! Whether you want to improve your technique or just dance to your favorite tracks, this is a fun, supportive space to move with others who share your passion.

`r384 — this would be included/eligble. i would change descrition and cta in a way so that it would get clicks. — `

**r37 — Mama$ita | Gemini Affair Friday June 12th | Toop Lounge**
> Get ready to vibe and get LIT at Mama$ita — Celebrating the birthday of Z6 & All Gemini's

`r37 — not eligible. editor says that people don't click on these sorts of events bc audience demographic is 75% women AND (unsure percentage) 30-65 so not necessarily going to be included in the top 15 — `

**r69 — Advance Care Planning Workshop**
> _(no description collected — needs the link)_

`r69 — not eligible. wouldn't really get clicks People like entertainment and food — `

**r356 — MINISTERS OF MAY**
> SANTAMARIA × AFRO FRIDAY × AFRO BANA this link up is bringing pure sound and Vibes don't snooze. If you're scared, stay tf home.

`r356 — not eligible editor would look at this but to include in Quiet week probably not because because it's too niche. older women probably don't listen to Afro beats and whatnot — `

**r173 — Experience Thermomix Like Never Before**
> Come for a refreshing lemonade

`r173 — this is eligible. Refreshing lemonade is something everyone likes — `

**r12 — Geocaching & Orienteering with BIAYR**
> Get ready to hunt for hidden treasures and master your map skills in this fun outdoor adventure! BIAYR Members and their support persons are invited to join us for a guided tour of Phyllis Rawlinson Park where participants will learn orienteering and geo-navigating skills as well as other nature/outdoor education.

`r12 — this is eligible this is outdoor fun stuff and you're learning and talking with other peoples — `

**r136 — K-pop Dance Camp**
> Join our FREE K-pop Dance Camp this summer! Connect, learn popular routines, and perform in a showcase. Open to Grade 9+ & young adults. Love K-pop and want to learn the moves? This dance workshop is for you! Whether you want to improve your technique or just dance to your favorite tracks, this is a fun, supportive space to move with others who share your passion.

`r136 — already answered this — `

**r52 — Global Running Day Social 5k**
> Get ready to lace up and join a fun 5k run with the top run clubs north of the city celebrating Global Running Day together!

`r52 — this is eligible because this is novel and not often included But could be fun — `

**r321 — Gospel Of Amapiano 2.0**
> AMAPIANO CITY TAKEOVER! Gospel of Amapiano 2.0 is back. 30th May 2026 9pm – 3am @LaShish. Get your early bird tickets now!

`r321 — other parties and events it's not necessarily the age range — `

**r111 — Roblox Coding Basics (June 22-26:AM)**
> This is the place for budding game developers embark on an exciting journey into the world of Roblox! Throughout the camp, Ninjas will explore the basics of game building on Roblox, an innovative online gaming platform. They'll spend their time designing and crafting their own 3D worlds, gaining valuable skills in planning, designing, and constructing immersive environments.

`r111 — to niche not eligible because it's just kids and just coding basics for roblox — `

**r178 — BLACK STARS KICKOFF (AFTER PARTY)**
> After Party Experience – Keep the Energy Alive. The celebration doesn't stop at the final whistle. Join us for the official after party at La Shish Lounge for a night of music, vibes, and unforgettable moments. Starting at 10 PM, step into a lively atmosphere featuring top-tier DJs, great music, and a vibrant crowd.

`r178 — it's not an age range of old people or like our demographic— `

**r303 — Global Running Day Social 5k**
> Get ready to lace up and join a fun 5k run with the top run clubs north of the city celebrating Global Running Day together!

`r303 — already did this — `

**r147 — The Fray**
> Friday, May 15th, 2026 | 8:00pm _(needs the link)_

`r147 — this is a rock band active from 2002 and popular people would probably like this — `

**r423 — Blood on the Clocktower @ Royal Game Cafe in Richmond Hill**
> Together with Royal Game Cafe, we invite you to join us for a beginner-friendly game of BOTC! | Hobbies & Special Interest, Party or Social Gathering

`r423 — every once in a while on a quiet week this would be included but not every week would this be included— `

**r29 — Spring Colours – Album Release Show with Mayraki & otsyuda**
> Spring Colours performs their debut LP 'The Courage Cloak' in full for the very first time and one time only! Spring Colours performs with Mayraki & otsyuda at Underground (formerly Drake Underground). Presale tickets $15, door $20.

`r29 — each group depends on the age group But if it's appropriate for the age then include — `

**r220 — Bilingual Crêpes**
> Sucrées ou salées, avec ou sans gluten, les crêpes, avec un peu de français, sont parfaites pour tous les repas ! L'inscription est de 5 $. — Sweet or savoury, made with wheat or gluten-free, crêpes with a sprinkle of French are perfect for every meal! Registration is $5. Room capacity is limited.

`r220 — people speaking French so I wouldn't people wouldn't do it I don't want to bring them it could be confusing for people trying to speak French or understand— `

**r53 — Greater Toronto Sports Card Show Vaughan Edition**
> It's on! The Greater Toronto Card Show! An action packed day loaded with 125+ vendor tables buying/selling sports cards, memorabilia & more!

`r53 — eligible because it's popular and people click on this sort of stuff — `

**r240 — STRICTLY VIBES**
> The best of the 1990's & 2000's — HIP HOP | R&B | REGGAE | SOCA — Strictly Old School, Strictly Bangers, STRICTLY VIBES! Patio season has returned! Come join us on June 13 on Forty 40's covered patio.

`r240 — eligible because it matches the demographic of our audience — `

**r123 — Sip & Stride Markham**
> Join us for Sip & Stride Markham: a fun day of tasty sips and cool strolls around town!

`r123 — eligible this is exactly what older women like!— `

**r140 — Leonid & Friends**
> Performing the Music of Chicago, Earth Wind & Fire, Steely Dan and more!

`r140 — absolutely yes eligible — `

---

# ⛔ STOP — DO NOT SCROLL PAST THIS UNTIL EVERY PHASE 1 ANSWER IS WRITTEN DOWN

Everything below reveals the prior labels. Reading it first destroys the sitting.

---

<details>
<summary><b>PHASE 2 — the reveal (click to open only after Phase 1 is recorded)</b></summary>

For each row: *"You previously marked this `outcompeted`. What did `outcompeted` mean for this event?"*

| Row | Event | His original words |
|---|---|---|
| r12 | Geocaching & Orienteering | "Coaching event that can be interesting for my audience but there are more engaging ones." |
| r29 | Spring Colours | "music and potentially a show, maybe good" |
| r37 | Mama$ita \| Gemini Affair | "festival, could be ok" |
| r52 | Global Running Day 5k | *(no reasoning recorded)* |
| r53 | GTA Sports Card Show | "this is actually a good event" |
| r69 | Advance Care Planning | link: "for old people so could be relavent" |
| r111 | Roblox Coding Basics | "could be for familes like for kids who want to learn how to develop roblox" |
| r123 | Sip & Stride Markham | "this is a good event and has been used" |
| r136 | K-pop Dance Camp | "k pop is popular and it's a free event, which people are more inclined to go to" |
| r140 | Leonid & Friends | "music event, could be good" |
| r147 | The Fray | "had to go on link" → "some sort of music or theatre show, could be good" |
| r173 | Experience Thermomix | "good event" |
| r178 | BLACK STARS KICKOFF | "party, could be good" |
| r220 | Bilingual Crêpes | "cooking and people might learn a bit of french, also only 5dollars" |
| r240 | STRICTLY VIBES | *(no reasoning recorded)* |
| r303 | Global Running Day 5k | *(no reasoning recorded)* |
| r321 | Gospel Of Amapiano 2.0 | link: "this is a party, maybe too young for the audience though" |
| r356 | MINISTERS OF MAY | "could be good, but also maybe a young crowd event, but it is a party thign" |
| r384 | K-pop Dance Camp | *(no reasoning recorded)* |
| r423 | Blood on the Clocktower | **"this is a party, so outcompeted"** |


r12 - I would consider once in a while if the weather permits, editor word
r29 - same words, that's what outcompeted means this time
overall editor agrees with his own words back then
</details>

---

<details>
<summary><b>APPENDIX — the three double-ticks (a different question; ask last)</b></summary>

These three carry **`outcompeted` + `B2B / professional dev`** and are **not** part of the 69. Under §77's priority order the permanent negative wins, so **they stay gate-negative regardless of what he says here.** They test how the label was being used, nothing more.

All three are AdeptSkil rows whose only "description" is an AllEvents category block — he cannot judge them on text alone, which is likely part of why they were double-ticked.

| Row | Event | His original words |
|---|---|---|
| r106 | Conflict Management Training — Markham | *(none)* |
| r153 | 10 Essential Soft Skills Workshop — Markham | "would be included but would probably not make it through" |
| r287 | Conflict Management Training — Vaughan | "would be included potentialyl but ideally it wouldn't make it through. soft skills and conflict managment could make it throug. but overall editro looks for entertainment. but maybe it could be." |

Ask: **"When you ticked both, which one was the reason you didn't run it?"**

</details>

---

## Result

*Fill in after the sitting, then record the outcome in `docs/r7/R7_Scope.md`'s Status Snapshot and, if it changes a rate, in `NA/Vaughan_Metrics_Log.md`.*

- Date run:
- Phase 1 tally — eligible __ / permanent-reject __ / unclear __
- Duplicate-pair check — r136/r384 agree? __ · r52/r303 agree? __ (or: void, pair spotted)
- Decision-rule branch taken:
- Consequence for §77 routing:
