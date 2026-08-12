// Read-only inventory of every unique fill/stroke color in the document.
// Useful for planning screen-print / embroidery color separations before
// touching anything. Zero risk — it never mutates the document.
function __op(args) {
    if (app.documents.length === 0) throw new Error("No document open");
    var doc = app.activeDocument;

    function h2(n) {
        n = Math.round(n); if (n < 0) n = 0; if (n > 255) n = 255;
        var s = n.toString(16); return s.length < 2 ? "0" + s : s;
    }
    function key(c) {
        switch (c.typename) {
            case "RGBColor":  return "RGB #" + h2(c.red) + h2(c.green) + h2(c.blue);
            case "CMYKColor": return "CMYK " + Math.round(c.cyan) + "/" + Math.round(c.magenta) + "/" + Math.round(c.yellow) + "/" + Math.round(c.black);
            case "GrayColor": return "GRAY " + Math.round(c.gray);
            case "SpotColor": return "SPOT " + c.spot.name;
            case "NoColor":   return null;
            default:          return c.typename;
        }
    }

    var seen = {}, out = [];
    var items = doc.pathItems;
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var ks = [];
        if (it.filled)  ks.push(key(it.fillColor));
        if (it.stroked) ks.push(key(it.strokeColor));
        for (var j = 0; j < ks.length; j++) {
            var k = ks[j];
            if (k && !seen[k]) { seen[k] = true; out.push(k); }
        }
    }
    return { colorCount: out.length, colors: out };
}
