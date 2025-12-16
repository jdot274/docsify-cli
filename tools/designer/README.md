# Docsify Designer

A local UI for editing docsify sites with a “premium” workflow: page list, markdown editor + toolbar, image uploads, and a live preview iframe.

## Usage

```bash
# from the repo root
npm run design
```

The server starts on `http://localhost:4173` (configurable via `DOCS_DESIGNER_PORT`). It targets `docs-new` by default; point it elsewhere via `DOCS_DESIGN_DIR=/path/to/docs`.

## Preview

Run a docsify preview server (any port is fine):

```bash
./bin/docsify serve docs-new --port 3002 --no-open
```

Then set the preview URL in the designer UI (defaults to `http://localhost:3002`).

## Notes

- The designer stores the last saved site settings in `.designer-state.json` inside the docs folder to keep defaults in sync.
- Image uploads are saved under `docs-new/media/` (or the selected docs dir).
