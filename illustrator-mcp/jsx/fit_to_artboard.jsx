// Scale + center the current selection to fit an artboard (minus margin).
// Groups the selection first so it scales as one unit. Handy for dropping
// a logo onto a hat / template artboard.
// args: { artboardIndex (default: active), marginPt (default 0) }
function __op(args) {
    if (app.documents.length === 0) throw new Error("No document open");
    var doc = app.activeDocument;
    if (doc.selection.length === 0) throw new Error("Nothing selected");

    var abIndex = (args.artboardIndex == null)
        ? doc.artboards.getActiveArtboardIndex()
        : args.artboardIndex;
    if (abIndex < 0 || abIndex >= doc.artboards.length)
        throw new Error("artboardIndex out of range: " + abIndex);

    var margin = args.marginPt || 0;
    var rect = doc.artboards[abIndex].artboardRect; // [l, t, r, b]
    var abL = rect[0], abT = rect[1], abR = rect[2], abB = rect[3];
    var abW = (abR - abL) - 2 * margin;
    var abH = (abT - abB) - 2 * margin;
    if (abW <= 0 || abH <= 0) throw new Error("Margin larger than artboard");

    // Measure the combined visible bounds of the current selection.
    var sel = doc.selection;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < sel.length; i++) {
        var b = sel[i].visibleBounds; // [l, t, r, b]
        if (b[0] < minX) minX = b[0];
        if (b[1] > maxY) maxY = b[1];
        if (b[2] > maxX) maxX = b[2];
        if (b[3] < minY) minY = b[3];
    }
    var selW = maxX - minX, selH = maxY - minY;
    if (selW <= 0 || selH <= 0) throw new Error("Selection has no measurable size");

    var factor = Math.min(abW / selW, abH / selH) * 100; // resize() takes percent

    // Group so the whole selection scales/moves as one object.
    app.executeMenuCommand("group");
    var grp = doc.selection[0];
    grp.resize(factor, factor);

    // Re-center within the artboard using the new bounds.
    var nb = grp.visibleBounds; // [l, t, r, b]
    var nw = nb[2] - nb[0], nh = nb[1] - nb[3];
    var targetLeft = abL + margin + (abW - nw) / 2;
    var targetTop  = abT - margin - (abH - nh) / 2;
    grp.position = [targetLeft, targetTop]; // [left, top] of geometric bounds

    return {
        artboardIndex: abIndex,
        scaledToPercent: factor,
        finalBounds: grp.visibleBounds
    };
}
