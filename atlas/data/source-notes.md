# The Nephite Annals — Source and coverage notes

82 major-event records, from Mosiah 29 to Helaman 1:34. All65 chapter texts in this span were fully inspected during research. The atlas is a major-event selection, not a verse-by-verse commentary.

# Early period source audit

Coverage: Mosiah 29 and Alma 1–16, all verse text and editorial chapter summaries read. Full official text downloaded from the Church scripture pages using urllib and extracted with HTMLParser into `mosiah-29.txt` and `alma-1.txt` through `alma-16.txt`. Mosiah 29 and Alma 1–3 also opened through the web search service. No search-snippet-only extraction.

Output: 21 event records in `early.json`, IDs E01–E21. Summaries are paraphrases. Scenes are illustration briefs rather than textual evidence for costume, physical appearance, architecture, weather, or light.

Chronology cautions:

- E01 uses year 0 only for interface ordering, with a note explaining that no scriptural year zero is asserted. Mosiah retains kingship until death while judges are appointed.
- E18 retains year 10 from Alma 15:19 despite the editorial heading about 81 BC. A strict `92 - year` BC converter would conflict with that heading; use the supplied display label and chronology note.
- E21 is regional, not a single fixed-city event. The ministry passage ends in year 14 but renewed warfare begins in year 14; no claim of uninterrupted year-14 peace.
- Hill Manti (E02) must not automatically be located at the city of Manti. Hill Amnihu, Minon, Hermounts, Sidom, Aaron, and the southern wilderness need geographically uncertain marker treatment where the supplied map does not identify them.
- The Lehi named in Alma 16 is Zoram's son. His identity with the later commander is not established here. The spy Manti is a person, distinct from both hill and land names.

Editorial grouping:

- Mosiah's governance proposal, appointment of Alma, and the deaths of Mosiah and Alma the elder are grouped as one transition event.
- Church persecution and charitable labor in Alma 1 are grouped together.
- Alma 4's rise in inequality is explained as the background to his year-9 resignation.
- Alma 5 and church reorganization in Alma 6 are grouped.
- Alma 9–11 are represented by the confrontation with Zeezrom, including the warnings and the bribe; the detailed monetary system is supporting context rather than a separate dated event.
- Alma 12–13's doctrinal discourses are one teaching event.
- Sidom's church establishment, Zeezrom's healing, and Alma receiving Amulek at home are grouped in E18.

No inaccessible chapter sources or missing episodes were identified within this bounded assignment. Minor doctrinal subpoints and background genealogies are not separate events. No novel characters, organizations, events, or approved novel appearances were used.


# Alma 17–42 source audit

All 26 full official chapters retrieved from https://www.churchofjesuschrist.org/study/scriptures/bofm/alma/CHAPTER?lang=eng using urllib.request, and read in full from locally extracted verse text. Chapter17–20 also opened with the web tool. Source copies saved as research/sources/alma-N.txt and alma-N.verses.txt.

21 narrative event records saved in middle.json. Chapter26 missionary thanksgiving and chapter29 Alma’s reflections are linked to the reunion entry rather than fabricated as separately located, dated scenes. Historical quotations and recalled earlier events in chapters33,36–42 remain teachings in their current narrative setting. Ammonihah’s destruction in25 is a retrospective link, not a second attack. Geographic description in22:27–34 is context rather than an event.

Chronology: year1 departure explicit17:6; most missionary episodes undated within the14-year mission, so year:null and approximate editorial dateLabel, with sortYear only an interface anchor. Some mission ranges overlap: ordering them among unrelated Nephite events is not established. Return/refuge in year15 inferred from editorial17 heading and end of15 in28. Korihor late17 explicit30:6. Zoramite mission before end17 explicit35:12. Melek relocation opening18 explicit35:13. Separate charges to sons dated about74BC by headings, year:null, sortYear18 narrative anchor.

Geography: no modern coordinates established. Water of Sebus, Ani-Anti, Middoni, Ishmael, Nephi, Shilom, Shemlon, Lemuel, Shimnilom, Jershon, Antionum, Onidah, Siron appear in the text. Jerusalem in21 is the Lamanite city, not Old World Jerusalem. Onidah hill32 is not automatically identical with place of arms47. Alma’s meeting with sons of Mosiah is between Gideon and Manti; no precise point given. Battlefield28 unnamed.

Art scenes are interpretive visualizations of specified actions, not portrait claims or archaeological assertions. No novel-only people/events used. Unnamed rulers stay descriptive: Lamoni’s father, his wife, Lamoni’s wife. Shiblon/Corianton scenes do not portray retrospective wrongdoing or persecution as occurring at the time of their counsel.


# War-chapter source and coverage audit

Scope: Alma 43–63 and Helaman 1. All 22 official English chapter pages were fetched in full using Python urllib from https://www.churchofjesuschrist.org/study/scriptures/bofm/ and verse paragraphs extracted to the adjacent chapter text files. Full extracted text of all chapters was read. An initially truncated combined display of Alma 43–49 was supplemented by a full display of Alma 45–47. Official web opens separately verified Alma 43–46. Sources are the actual primary scriptural text and its editorial chapter date headings, not novel materials or search snippets.

Output: war.json, 34 major-event records W01–W34. Chapters with several episodes are represented by several cards; related phases are sometimes combined in a single event card with a two- or three-sentence summary and the full passage link. Every record has a text-supported illustration brief. Clothing, faces, architecture and image style remain visual interpretations unless described in the cited text.

## Chronology handling

- Regnal year is primary. Approximate BC labels use 92 minus the regnal year for a conventional coarse display. An event near a year boundary may appear in chapter editorial headings one BC year later; those labels are not exact calendar dates.
- W14 follows Alma 56:7–9's explicit year 26 for the sons' enlistment, rather than treating the retrospective Alma 53 placement as year 28.
- W15 follows the year-27 sequence of Alma 56, not the year-30 receipt of the letter.
- W18 takes Antiparah in year 28 (Alma 57:5), despite the chapter heading's general about-63-BC date.
- W21 and W22 are year 29; the letter is received in year 30 (W23).
- W28 covers the post-war renewals through Helaman's death in year 35, without imposing a precise date on each renewal.
- W34 includes only the immediate recapture in Helaman 1, ending at verse 34 and year 41.

## Preserved textual tensions and uncertainties

- Nephihah: Alma 51:25 says Amalickiah avoided attacking it, while 51:26 lists it among captured cities. Alma 59 explicitly narrates its fall in year 30. W11 carries the tension, W23 references it; no intervening recapture is invented. A city-control visualization should not silently resolve it.
- Manti: Alma 58:21 describes destroying the remaining guards; 58:28 describes taking the city without bloodshed. W22 does not overgeneralize the latter wording.
- Alma's departure: no confirmed death or ascension, per Alma 45:18–19.
- Hagoth: the text does not state he personally sailed; lost voyagers' destinations and fate are unknown.
- Younger Helaman and younger Pahoran are labeled distinctly from their fathers.
- Government proceedings and letter-writing are not all precisely localized. Contextual places in W09, W10 and W19 are noted rather than asserted as exact scene sites.
- W29 has no map location; W31's northward land concerns Corianton's supply voyage, not the unspecified invasion battlefield.
- Routes are schematics between named textual destinations, never coordinate-level claims. W33's advance is toward Bountiful; Lehi stops it before arrival.

## Exclusions and scope

- No novel characters, invented factions, invented kinships, or approved novel likenesses were consulted or adopted.
- Later Helaman chapters, Gadianton's subsequent story, and later invasions are beyond the requested endpoint.
- Summary cards are a major-event selection, not a verse-by-verse commentary. The full source passages remain linked.


## Map source

The supplied locked map and city-position reference were downloaded via their exact Drive identifiers and visually inspected. The interactive marker coordinates follow the visible city markers on the locked mosaic image. No unplaced city was assigned a guessed position. Approximate relations within this map are not archaeological claims.

## Illustration method

Built-in image generation, one scene per event. Visual interpretations share mineral-pigment, jade, lapis, ochre and gold art direction. Unspecified clothing, architecture and facial appearances are not scriptural facts. Source scene briefs are available in illustration-prompts.json.

## Supplied map files

- Locked mosaic map: https://drive.google.com/file/d/1d0SUjIlbj95x3rOL_5e5ceEoH2CU5fLG/view?usp=drivesdk
- City-position reference: https://drive.google.com/file/d/1O1hpklM2gIFOOv2s4K4meesHKhn6DyPD/view?usp=drivesdk

## Visual review

Generated scenes reviewed as contact sheets and selected full images. Moroni’s title-of-liberty cloth was corrected to include inked writing, as required by Alma46:12. The depicted script is an artistic suggestion, not a recovered Nephite writing sample.


# Added scenes (October 2026)

Six records were added with the rebuilt illustration set, IDs N01–N06: Amulek taken into Alma's home (Alma 15:16–18), Zerahemnah's scalp (Alma 44:1–15), Amalickiah's oath (Alma 49:25–30), the mothers' teaching (Alma 53:16–21; 56:45–48), none of the 2,060 slain (Alma 57:25–27) and the mourning for Teancum (Alma 62:36–38). E18's summary no longer includes Amulek's homecoming, which is now N01. N04's year-26 placement and its setting in Melek are illustration choices; see its chronology note.
