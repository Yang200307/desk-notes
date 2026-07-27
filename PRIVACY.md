# Privacy Policy

Last updated: July 27, 2026

Markdown Editor is a local-first desktop application. It does not require an
account and does not collect analytics, advertising identifiers, document
contents, filenames, usage history, or crash telemetry.

## Data stored locally

Documents are read from and written to locations selected by the user. Editor
preferences are stored on the device by Electron. The application does not
upload document contents to the developer or to any third party.

## Network activity

Packaged releases automatically contact the GitHub Releases service for
`Yang200307/desk-notes` after startup to check for application updates. GitHub
may receive ordinary connection metadata such as the device IP address, request
time, application version, and user agent under GitHub's own privacy statement.
Downloaded updates also come from GitHub Releases.

The application opens an external HTTP or HTTPS address only when the user
activates a link in a document. The destination service then processes the
connection under its own privacy policy.

A Markdown document can contain a remote HTTPS image. When such a document is
displayed, Chromium may request that image automatically, which exposes normal
connection metadata such as the device IP address and request time to the image
host. Users handling sensitive documents should use local or embedded images.

## Security logs

Local application logs may contain update status and technical error messages.
They are stored on the device and are not transmitted automatically. Users
should review logs before sharing them in a bug report.

## Contact

Privacy questions can be submitted through:
https://github.com/Yang200307/desk-notes/issues
