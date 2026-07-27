const signingSource = process.env.WIN_CSC_LINK || process.env.CSC_LINK

if (!signingSource) {
  console.error(
    'Release publishing is blocked: set WIN_CSC_LINK (or CSC_LINK) to a Windows code-signing certificate first.'
  )
  process.exit(1)
}

console.log('Windows signing credentials are configured; continuing with the release build.')
