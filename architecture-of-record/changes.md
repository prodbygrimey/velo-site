# Significant Change Log

Date: 2026-02-11
Change: Initialized architecture log folder
Why: Keep durable context for future sessions
What changed:
- Added architecture-of-record/README.md
- Added this running log file
Files:
- architecture-of-record/README.md
- architecture-of-record/changes.md
Impact/Risks:
- None
Next steps:
- Add a new entry whenever significant project changes are made

Date: 2026-02-11
Change: Replaced landing page with FTL-focused modern minimal redesign
Why: Align site with Velo-app positioning for B2B/FTL outreach and improve first impression
What changed:
- Rebuilt index.html structure and copy around FTL workflow messaging
- Added animated hero entrance, ambient motion background, and scroll-reveal sections
- Incorporated logo.png in both nav brand and featured metric card
- Switched typography to Plus Jakarta Sans + Space Grotesk for a stronger visual identity
Files:
- index.html
- style.css
Impact/Risks:
- Relies on Google Fonts CDN for typography; if blocked, falls back to local sans-serif
Next steps:
- Iterate copy once product positioning and CTA funnel are finalized

Date: 2026-02-11
Change: Switched landing page to dark theme and updated core messaging
Why: Better align the site style and language with product direction for B2B FTL outreach
What changed:
- Converted the visual system to a dark palette while preserving animations and layout
- Rewrote hero, CTA, feature, and workflow copy for clearer outbound/prospecting positioning
- Updated top nav CTA from demo framing to pilot framing
Files:
- index.html
- style.css
Impact/Risks:
- Dark mode readability should be reviewed in-browser on low-brightness displays
Next steps:
- Finalize brand voice variants for hero and CTA messaging

Date: 2026-02-11
Change: Updated landing copy to match current shipped capabilities
Why: Previous wording was too broad versus actual product functionality
What changed:
- Rewrote hero and feature copy around contact import, mass email throttling, KPI tracking, and scheduled follow-ups
- Added explicit note that open-rate tracking is in development
Files:
- index.html
Impact/Risks:
- Messaging now reflects current product scope more accurately
Next steps:
- Update copy again when open-rate tracking ships
