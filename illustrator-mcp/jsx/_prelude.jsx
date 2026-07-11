/*
 * Shared prelude — injected before every operation.
 * Provides: a minimal JSON polyfill (ExtendScript lacks JSON),
 * a result-writer, and __emit() which runs the operation inside a
 * try/catch and writes a structured {ok, data|error} envelope back to
 * __RESULT_FILE__. This is the whole reason the bridge is stable:
 * a failed op returns a clean error string instead of leaving the
 * document in an unknown state and forcing blind retries.
 *
 * __RESULT_FILE__ and __ARGS__ are declared by the Python bridge above this.
 */

if (typeof JSON === "undefined") {
    JSON = {};
    (function () {
        function f(n) { return n < 10 ? "0" + n : n; }
        function quote(string) {
            var esc = {
                '\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f',
                '\r': '\\r', '"': '\\"', '\\': '\\\\'
            };
            var out = '"';
            for (var i = 0; i < string.length; i++) {
                var c = string.charAt(i);
                if (esc[c]) { out += esc[c]; }
                else if (c < ' ') {
                    out += '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
                } else { out += c; }
            }
            return out + '"';
        }
        function str(value) {
            if (value === null) return "null";
            switch (typeof value) {
                case "number": return isFinite(value) ? String(value) : "null";
                case "boolean": return String(value);
                case "string": return quote(value);
                case "object":
                    if (!value) return "null";
                    var parts = [], i;
                    if (value instanceof Array) {
                        for (i = 0; i < value.length; i++) parts.push(str(value[i]) || "null");
                        return "[" + parts.join(",") + "]";
                    }
                    for (var k in value) {
                        if (Object.prototype.hasOwnProperty.call(value, k)) {
                            var v = str(value[k]);
                            if (v) parts.push(quote(k) + ":" + v);
                        }
                    }
                    return "{" + parts.join(",") + "}";
            }
            return undefined;
        }
        JSON.stringify = function (value) { return str(value); };
        JSON.parse = function (text) { return eval("(" + text + ")"); };
    })();
}

function __writeResult(obj) {
    var f = new File(__RESULT_FILE__);
    f.encoding = "UTF-8";
    f.open("w");
    f.write(JSON.stringify(obj));
    f.close();
}

function __emit(fn) {
    try {
        __writeResult({ ok: true, data: fn() });
    } catch (e) {
        __writeResult({
            ok: false,
            error: (e && e.message) ? e.message : String(e),
            line: (e && e.line) ? e.line : null
        });
    }
}
