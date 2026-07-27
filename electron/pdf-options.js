const PDF_MARGIN_POINTS = 20;

function createPdfOptions() {
  const marginInches = PDF_MARGIN_POINTS / 72;
  return {
    printBackground: true,
    pageSize: 'A4',
    margins: {
      top: marginInches,
      bottom: marginInches,
      left: marginInches,
      right: marginInches,
    },
  };
}

module.exports = { PDF_MARGIN_POINTS, createPdfOptions };
