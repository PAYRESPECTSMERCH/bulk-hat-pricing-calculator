// Export the active document to production files. Pure vector/raster
// export — consumes ZERO Adobe generative credits.
// args: { outDir, formats: ["png"|"svg"|"pdf"|"eps"...], scale (png %, default 100) }
function __op(args) {
    if (app.documents.length === 0) throw new Error("No document open");
    var doc = app.activeDocument;

    var outDir = args.outDir;
    if (!outDir) throw new Error("outDir is required");
    if (outDir.charAt(outDir.length - 1) !== "/") outDir += "/";

    var scale = args.scale || 100;
    var formats = args.formats || ["png"];
    var base = doc.name.replace(/\.[^\.]+$/, "");
    var written = [];

    for (var i = 0; i < formats.length; i++) {
        var fmt = String(formats[i]).toLowerCase();
        var path = outDir + base + "." + fmt;
        var f = new File(path);

        if (fmt === "png") {
            var po = new ExportOptionsPNG24();
            po.artBoardClipping = true;
            po.horizontalScale = scale;
            po.verticalScale = scale;
            po.transparency = true;
            doc.exportFile(f, ExportType.PNG24, po);
        } else if (fmt === "svg") {
            var so = new ExportOptionsSVG();
            so.embedRasterImages = true;
            so.coordinatePrecision = 3;
            doc.exportFile(f, ExportType.SVG, so);
        } else if (fmt === "pdf") {
            doc.saveAs(f, new PDFSaveOptions());
        } else if (fmt === "eps") {
            doc.saveAs(f, new EPSSaveOptions());
        } else {
            throw new Error("Unsupported format: " + fmt);
        }
        written.push(path);
    }
    return { written: written };
}
