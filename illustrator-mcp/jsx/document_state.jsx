// Structured snapshot of the active document. Returns JSON, never a
// screenshot — a few hundred tokens instead of thousands, and it gives
// the model the object names/indices it needs to act deterministically.
function __op(args) {
    if (app.documents.length === 0) return { open: false };
    var doc = app.activeDocument;

    var layers = [];
    for (var i = 0; i < doc.layers.length; i++) {
        var L = doc.layers[i];
        layers.push({
            name: L.name,
            visible: L.visible,
            locked: L.locked,
            itemCount: L.pageItems.length
        });
    }

    var abs = [];
    for (var a = 0; a < doc.artboards.length; a++) {
        var ab = doc.artboards[a];
        var r = ab.artboardRect; // [left, top, right, bottom] in points
        abs.push({
            index: a,
            name: ab.name,
            widthPt: r[2] - r[0],
            heightPt: r[1] - r[3]
        });
    }

    var sel = [];
    for (var s = 0; s < doc.selection.length; s++) {
        var it = doc.selection[s];
        sel.push({ type: it.typename, name: (it.name || "") });
    }

    var spots = [];
    for (var k = 0; k < doc.spots.length; k++) spots.push(doc.spots[k].name);

    return {
        open: true,
        name: doc.name,
        colorSpace: String(doc.documentColorSpace),
        artboards: abs,
        layers: layers,
        selectionCount: doc.selection.length,
        selection: sel,
        spotColors: spots
    };
}
