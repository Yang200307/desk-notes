# Code signing policy

Free code signing is intended to be provided by SignPath.io, with a certificate
provided by SignPath Foundation.

## Project and release source

- Source repository: https://github.com/Yang200307/desk-notes
- Release page: https://github.com/Yang200307/desk-notes/releases
- License: MIT
- Privacy policy: [PRIVACY.md](PRIVACY.md)
- Security policy: [SECURITY.md](SECURITY.md)

Signed artifacts must be produced from the public repository by the configured
automated build pipeline. Maintainers must not upload unrelated or locally
modified binaries for signing.

## Roles

- Committer and reviewer: [Yang200307](https://github.com/Yang200307)
- Signing approver: [Yang200307](https://github.com/Yang200307)

All accounts with repository or signing authority must use multi-factor
authentication. Changes from contributors without direct commit access must be
reviewed before merge. Signing requests are approved only for tagged releases
whose source and dependency metadata are present in the repository.

## Artifact verification

Release checks verify tests, the production renderer build, dependency audit,
and PDF integration behavior. A signed release must also pass Authenticode
verification after signing and before publication.
