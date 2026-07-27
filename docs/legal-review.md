# Preliminary copyright, license and branding review

Review date: July 27, 2026

This is a technical compliance review, not a legal opinion or a trademark
clearance search.

## Executive conclusion

No obvious copyright infringement or incompatible copyleft dependency was
found in the application source or the dependency tree inspected for version
1.0.2. The remaining material risks are brand-name collision, proving ownership
of all original source contributions, and publishing complete third-party
notices with every distributed build.

## Project source

- Application source contains no copied-source attribution, third-party code
  header, embedded commercial media, or copied sample document.
- The maintainer must still confirm that every original contribution was
  created with authority to publish it under MIT, including work created for an
  employer or copied from private projects.
- Development notes and screenshots are excluded from the packaged application.

Risk: low if the maintainer owns the submitted source; otherwise potentially high.

## Dependencies and fonts

- The distributed JavaScript dependency closure was enumerated from the locked
  npm tree. It contains permissive MIT, BSD, ISC, Apache-2.0, Python-2.0 and
  Unlicense components. DOMPurify is available under the Apache-2.0 option of
  its dual license.
- No package declaring GPL, AGPL, LGPL, SSPL or a non-commercial license was
  identified in the bundled dependency closure.
- KaTeX font files are supplied with the KaTeX package and its license notice.
- Electron ships its own `LICENSE` and `LICENSES.chromium.html` files beside the
  executable. Those files must remain in distributions.
- `THIRD_PARTY_NOTICES.md` is generated from the locked build tree and is copied
  into `resources/legal` during packaging.

Risk: low after the notices are included in each release.

## Icon and visual design

- The application icon is generated from locally maintained SVG source using
  basic shapes. No commercial icon or external font is embedded.
- It resembles the general Markdown downward-arrow convention. The published
  Markdown mark is made available under CC0, but CC0 does not itself provide a
  trademark clearance. Avoid claiming endorsement or official status.

Risk: low for copyright; low-to-medium for possible branding confusion.

## Product and repository names

- `Markdown Editor` is descriptive and already used by many unrelated tools.
  That reduces distinctiveness and makes the project difficult to identify in
  search results.
- `Desk Notes` is also used by unrelated note-taking products. The repository
  name should not be treated as an exclusive product brand.
- The SignPath application therefore uses `Yang200307 Markdown Editor` as a
  uniquely qualified project name. Before broad commercial promotion or Store
  submission, adopt a more distinctive name and perform jurisdiction-specific
  trademark searches.

Risk: medium. This is the largest current intellectual-property uncertainty.

## Privacy and user content

- Documents remain local and are not uploaded by the application.
- Packaged builds contact GitHub Releases to check for updates.
- Remote images referenced by a Markdown document may be requested by Chromium
  when displayed, disclosing ordinary connection metadata to the image host.
- These behaviors are disclosed in `PRIVACY.md`; the application contains no
  analytics or advertising SDK.

Risk: low after disclosure, subject to future feature changes.

## Required release controls

1. Keep the MIT license and generated third-party notices in the repository and
   packaged resources.
2. Regenerate notices after every dependency change.
3. Do not remove Electron/Chromium license files from the unpacked application.
4. Publish only artifacts produced by the documented CI/signing pipeline.
5. Re-run brand and privacy review before adding cloud sync, AI services,
   bundled templates, new artwork, or paid distribution.
