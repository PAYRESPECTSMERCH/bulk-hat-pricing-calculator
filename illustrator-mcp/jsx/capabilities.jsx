// Cheap health check: is Illustrator up, what version, is a doc open.
function __op(args) {
    return {
        app: "Adobe Illustrator",
        version: String(app.version),
        documentsOpen: app.documents.length,
        activeDocument: app.documents.length ? app.activeDocument.name : null
    };
}
