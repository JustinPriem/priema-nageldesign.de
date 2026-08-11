# Facebook-Nails-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein geplanter GitHub-Actions-Job holt Fotos von der Facebook-Seite "Priema Nageldesign" (photos_by) automatisch ins Repo; die Website zeigt sie im "Nails"-Tab der Galerie mit reduzierter Bildgröße und einem "Mehr laden"-Button, damit weder das Repo noch der Traffic pro Seitenaufruf unkontrolliert wachsen.

**Architecture:** Statischer "Bake-in"-Sync statt Live-API-Abruf: ein Node-Skript ruft die Graph API ab, lädt neue Fotos herunter, pflegt eine JSON-Datenliste und eine Ausschlussliste; ein GitHub-Actions-Workflow führt das Skript täglich aus und committet Änderungen. Das bestehende Eleventy-Build/Deploy bleibt davon unberührt und unabhängig fehlertolerant. Im Frontend werden Bilder erst beim Klick auf "Mehr laden" aktiv geladen (`data-src` → `src`), nicht beim Seitenaufruf.

**Tech Stack:** Eleventy 3 + eleventy-img (bestehend), Node.js 20 (`node:test` für automatisierte Tests — kein zusätzliches Test-Framework nötig), Vanilla JS (bestehendes `gallery.js`), GitHub Actions.

## Global Constraints

- Seitengröße "Mehr laden": 24 Fotos pro Portion (aus der Spec).
- Nails-Fotos werden nur in einer Breite (480px) + WebP/JPEG erzeugt, keine mehrstufige Responsive-Pipeline wie bei Schmuck/Schuhe/Muster.
- Bilder jenseits der ersten Portion dürfen beim Seitenaufruf **nicht** heruntergeladen werden (kein `src`/`srcset` bis zur Aktivierung durch JS).
- Ausschluss-Liste (`src/_data/nailsExcluded.json`) muss von Menschen ohne Code-Kenntnisse editierbar sein (einfaches JSON-Array von Facebook-Foto-IDs).
- Ein fehlschlagender Sync darf den bestehenden Build-und-Deploy-Workflow nicht beeinflussen (komplett getrennter Workflow, `contents: write` nur dort).
- Kein Meta-App-Review notwendig (nur Lesezugriff auf die eigene Seite als Admin) — muss im Setup-Dokument klar beschrieben sein.
- Kein leerer Commit, wenn der Sync nichts Neues findet.
- Alt-Text für synchronisierte Fotos: `"Nailart-Arbeit von Priema Nageldesign"` (Facebook liefert keine verlässlichen Bildbeschreibungen).

---

## Task 1: Datenfundament für die Nails-Galerie

**Files:**
- Create: `src/_data/nailsGallery.json`
- Create: `src/_data/nailsExcluded.json`

**Interfaces:**
- Produces: Eleventy-Globaldaten `nailsGallery` (Array von `{id, filename, createdTime}`) und `nailsExcluded` (Array von Facebook-Foto-ID-Strings), automatisch verfügbar in allen Templates (wie das bestehende `src/_data/site.json` → `site`).

- [ ] **Step 1: Leere Datendateien anlegen**

`src/_data/nailsGallery.json`:
```json
[]
```

`src/_data/nailsExcluded.json`:
```json
[]
```

- [ ] **Step 2: Build verifizieren**

Run: `"/c/Program Files/nodejs/node.exe" node_modules/@11ty/eleventy/cmd.cjs`
Expected: Build läuft ohne Fehler durch (Nails-Daten werden noch nirgends verwendet, das ist erst Task 3).

- [ ] **Step 3: Commit**

```bash
git add src/_data/nailsGallery.json src/_data/nailsExcluded.json
git commit -m "feat: leere Datengrundlage für Facebook-Nails-Sync"
```

---

## Task 2: Deferred-Bild-Shortcode für Nails-Fotos

**Files:**
- Modify: `.eleventy.js`

**Interfaces:**
- Consumes: `Image` von `@11ty/eleventy-img` (bereits importiert), `path` (bereits importiert), `pathPrefix` (bereits definiert in Zeile 5).
- Produces: Nunjucks-Async-Shortcode `imageDeferred(src, alt)` → gibt `<picture>`-HTML mit `data-src`/`data-srcset` statt `src`/`srcset` zurück. Erzeugt Dateien mit Breite 480 in `_site/img/` (gleiche Konvention wie `imageShortcode`/`imageUrlShortcode`).

- [ ] **Step 1: Shortcode-Funktion ergänzen**

In `.eleventy.js`, nach der bestehenden `imageUrlShortcode`-Funktion (nach Zeile 45, vor `module.exports`) einfügen:

```javascript
async function imageDeferredShortcode(src, alt) {
	if (!alt) {
		throw new Error(`Fehlendes alt-Attribut für Bild: ${src}`);
	}

	const metadata = await Image(path.join("src/images", src), {
		widths: [480],
		formats: ["webp", "jpeg"],
		outputDir: "_site/img/",
		urlPath: pathPrefix + "img/",
		filenameFormat: function (id, src, width, format) {
			const name = path.basename(src, path.extname(src));
			return `${name}-${width}w.${format}`;
		},
	});

	const webp = metadata.webp[0];
	const jpeg = metadata.jpeg[0];

	return `<picture><source type="image/webp" data-srcset="${webp.url}"><img data-src="${jpeg.url}" alt="${alt}" width="${jpeg.width}" height="${jpeg.height}" loading="lazy" decoding="async"></picture>`;
}
```

- [ ] **Step 2: Shortcode registrieren**

In `.eleventy.js`, Zeile 53 (`eleventyConfig.addAsyncShortcode("imageUrl", imageUrlShortcode);`) direkt danach ergänzen:

```javascript
	eleventyConfig.addAsyncShortcode("imageDeferred", imageDeferredShortcode);
```

- [ ] **Step 3: Shortcode mit einem Testbild verifizieren**

Temporäres Testbild anlegen und in einer Scratch-Datei aufrufen:

Run:
```bash
cd "/c/Meine Webseiten/priema-nageldesign"
mkdir -p src/images/nails
cp src/images/schmuck/schmuck-01.jpg src/images/nails/test-fixture.jpg
cat > src/_scratch-imagedeferred-test.njk <<'EOF'
---
layout: layouts/base.njk
title: ScratchTest
permalink: /_scratch-imagedeferred-test/
---
{% imageDeferred "nails/test-fixture.jpg", "Testbild" %}
EOF
"/c/Program Files/nodejs/node.exe" node_modules/@11ty/eleventy/cmd.cjs
grep -o '<picture>.*</picture>' _site/_scratch-imagedeferred-test/index.html
```

Expected: Ausgabe enthält `<source type="image/webp" data-srcset="/priema-nageldesign.de/img/test-fixture-480w.webp">` und `<img data-src="/priema-nageldesign.de/img/test-fixture-480w.jpeg" ...>` — **kein** `src=`/`srcset=` Attribut auf `<img>`/`<source>` außer den `data-*`-Varianten.

- [ ] **Step 4: Scratch-Dateien aufräumen**

Run:
```bash
cd "/c/Meine Webseiten/priema-nageldesign"
rm src/_scratch-imagedeferred-test.njk
rm -rf src/images/nails
rm -rf _site
```

- [ ] **Step 5: Commit**

```bash
git add .eleventy.js
git commit -m "feat: imageDeferred-Shortcode für lazy-aktivierte Nails-Bilder"
```

---

## Task 3: Nails-Panel in der Galerie + CSS

**Files:**
- Modify: `src/galerie.njk`
- Modify: `src/css/style.css`

**Interfaces:**
- Consumes: `nailsGallery` (aus Task 1), `imageDeferred`-Shortcode (aus Task 2), bestehende Shortcodes `image`/`imageUrl`, bestehende `site.facebookUrl`.
- Produces: DOM-Struktur `<div class="photo-grid" data-page-size="24">…</div>` gefolgt von `<button data-load-more>Mehr laden</button>` — wird von Task 4 (gallery.js) konsumiert. Jedes Grid-Item ist `<button data-full="...">{% imageDeferred %}</button>`, identisch zum Muster der anderen Kategorien.

- [ ] **Step 1: Nails-Panel-Markup ersetzen**

In `src/galerie.njk`, den kompletten bestehenden Block (Zeilen 18–24, das `panel-nails`-Div mit `gallery-placeholder`) ersetzen durch:

```njk
		<div class="gallery-panel is-active" id="panel-nails" role="tabpanel" aria-labelledby="tab-nails" data-panel="nails">
			{% if nailsGallery.length > 0 %}
			<div class="photo-grid" data-page-size="24">
				{% for photo in nailsGallery %}
				<button type="button" data-full="{% imageUrl "nails/" + photo.filename, 480 %}">
					{% imageDeferred "nails/" + photo.filename, "Nailart-Arbeit von Priema Nageldesign" %}
				</button>
				{% endfor %}
			</div>
			<p class="load-more-wrap"><button type="button" class="btn load-more" data-load-more>Mehr laden</button></p>
			{% else %}
			<div class="gallery-placeholder">
				<h3>Diese Galerie wird bald live verbunden</h3>
				<p>Hier zeigen wir automatisch aktuelle Nailart-Arbeiten von unserer <a href="{{ site.facebookUrl }}" target="_blank" rel="noopener">Facebook-Seite</a> – die Anbindung ist eingerichtet, die ersten Fotos folgen mit dem nächsten Sync.</p>
			</div>
			{% endif %}
		</div>
```

- [ ] **Step 2: CSS für "Mehr laden" und `hidden`-Fix ergänzen**

In `src/css/style.css`, im `/* ===== Reset ===== */`-Block (nach Zeile 21 `*, *::before, *::after { box-sizing: border-box; }`) ergänzen:

```css
[hidden] { display: none !important; }
```

Grund: `.btn` setzt `display: inline-block`, was sonst das native `hidden`-Attribut des "Mehr laden"-Buttons überschreiben würde.

Im `/* ===== Gallery ===== */`-Block, nach der bestehenden `.gallery-placeholder p`-Regel ergänzen:

```css
.load-more-wrap {
	text-align: center;
	margin-top: 2rem;
}
```

- [ ] **Step 3: Leerer Zustand verifizieren**

Run:
```bash
cd "/c/Meine Webseiten/priema-nageldesign"
"/c/Program Files/nodejs/node.exe" node_modules/@11ty/eleventy/cmd.cjs
grep -o 'Diese Galerie wird bald live verbunden' _site/galerie/index.html
grep -c 'data-page-size' _site/galerie/index.html
```

Expected: Erster grep findet den Platzhaltertext (da `nailsGallery.json` noch `[]` ist), zweiter grep gibt `0` zurück (Grid wird nicht gerendert, solange keine Daten da sind).

- [ ] **Step 4: Commit**

```bash
git add src/galerie.njk src/css/style.css
git commit -m "feat: Nails-Panel liest aus nailsGallery-Daten, Platzhalter bei leerer Liste"
```

---

## Task 4: Paginierung ("Mehr laden") in gallery.js

**Files:**
- Modify: `src/js/gallery.js`

**Interfaces:**
- Consumes: DOM-Struktur aus Task 3 (`[data-page-size]`-Grid + `[data-load-more]`-Button als Geschwister-Element im selben Panel), `data-src`/`data-srcset`-Attribute aus Task 2.
- Produces: Aktiviert beim Laden die erste Portion jedes `[data-page-size]`-Grids, lädt bei Klick auf `[data-load-more]` die nächste Portion nach.

- [ ] **Step 1: Paginierungslogik ergänzen**

In `src/js/gallery.js`, direkt vor der schließenden `})();` (letzte Zeile) einfügen:

```javascript
	// Paginierte Grids (z.B. die von Facebook synchronisierte Nails-Galerie):
	// Bilder jenseits der ersten Portion bekommen erst beim Klick auf
	// "Mehr laden" eine echte Bildquelle, damit sie nicht ungefragt geladen werden.
	document.querySelectorAll("[data-page-size]").forEach(function (grid) {
		var pageSize = parseInt(grid.dataset.pageSize, 10);
		var items = Array.prototype.slice.call(grid.children);
		var shown = 0;
		var loadMoreBtn = grid.parentElement.querySelector("[data-load-more]");

		function activateItem(item) {
			var img = item.querySelector("img[data-src]");
			if (img) {
				img.src = img.getAttribute("data-src");
				img.removeAttribute("data-src");
			}
			var source = item.querySelector("source[data-srcset]");
			if (source) {
				source.srcset = source.getAttribute("data-srcset");
				source.removeAttribute("data-srcset");
			}
		}

		function showNextPage() {
			var next = items.slice(shown, shown + pageSize);
			next.forEach(activateItem);
			shown += next.length;
			if (loadMoreBtn) {
				loadMoreBtn.hidden = shown >= items.length;
			}
		}

		showNextPage();
		if (loadMoreBtn) {
			loadMoreBtn.addEventListener("click", showNextPage);
		}
	});
```

- [ ] **Step 2: Testfixtures für 30 Bilder anlegen (2 Portionen)**

Run:
```bash
cd "/c/Meine Webseiten/priema-nageldesign"
mkdir -p src/images/nails
for i in $(seq -w 1 30); do
  cp "src/images/schmuck/schmuck-$(printf '%02d' $((10#$i % 5 + 1))).jpg" "src/images/nails/fixture-$i.jpg"
done
node -e "
const fs = require('fs');
const entries = [];
for (let i = 1; i <= 30; i++) {
  const n = String(i).padStart(2, '0');
  entries.push({ id: 'fixture-' + n, filename: 'fixture-' + n + '.jpg', createdTime: '2024-01-' + n + 'T00:00:00+0000' });
}
fs.writeFileSync('src/_data/nailsGallery.json', JSON.stringify(entries, null, 2) + '\n');
"
"/c/Program Files/nodejs/node.exe" node_modules/@11ty/eleventy/cmd.cjs
```

- [ ] **Step 3: Paginierung im Browser verifizieren**

Preview-Server starten (`.claude/launch.json` Eintrag `eleventy-dev` existiert bereits aus früherer Arbeit), `http://localhost:8080/priema-nageldesign.de/galerie/` öffnen, dann per `javascript_tool`:

```javascript
(function(){
  var grid = document.querySelector('[data-page-size]');
  var imgsWithSrcBefore = grid.querySelectorAll('img[src]').length;
  var btn = grid.parentElement.querySelector('[data-load-more]');
  var btnHiddenBefore = btn.hidden;
  btn.click();
  var imgsWithSrcAfter = grid.querySelectorAll('img[src]').length;
  return JSON.stringify({ imgsWithSrcBefore, btnHiddenBefore, imgsWithSrcAfter, btnHiddenAfter: btn.hidden, totalItems: grid.children.length });
})();
```

Expected: `imgsWithSrcBefore` = 24, `btnHiddenBefore` = false, `imgsWithSrcAfter` = 30, `btnHiddenAfter` = true, `totalItems` = 30.

Zusätzlich per `read_network_requests`: vor dem Klick auf den Button dürfen nur 24 `fixture-*.webp`/`fixture-*.jpeg`-Requests aufgetaucht sein, nicht 30.

- [ ] **Step 4: Testfixtures wieder entfernen**

Run:
```bash
cd "/c/Meine Webseiten/priema-nageldesign"
rm -rf src/images/nails
echo '[]' > src/_data/nailsGallery.json
"/c/Program Files/nodejs/node.exe" node_modules/@11ty/eleventy/cmd.cjs
grep -o 'Diese Galerie wird bald live verbunden' _site/galerie/index.html
```

Expected: grep findet den Platzhaltertext wieder (Datenstand ist zurückgesetzt).

- [ ] **Step 5: Commit**

```bash
git add src/js/gallery.js
git commit -m "feat: Mehr-laden-Paginierung für Foto-Grids mit data-page-size"
```

---

## Task 5: Sync-Skript mit automatisierten Tests

**Files:**
- Create: `scripts/facebook-sync-lib.js`
- Create: `scripts/facebook-sync-lib.test.js`
- Create: `scripts/sync-facebook-photos.js`
- Modify: `package.json`

**Interfaces:**
- Produces (aus `facebook-sync-lib.js`): `pickLargestImage(images)`, `filterNewPhotos(apiPhotos, knownIds, excludedIds)`, `buildGalleryEntry(photo, filename)`, `sortGalleryNewestFirst(gallery)` — reine Funktionen ohne I/O.
- Produces (aus `sync-facebook-photos.js`): `runSync({ pageId, accessToken, dataDir, imagesDir, fetchImpl, downloadImpl })` → `Promise<{ changed: boolean, added: string[], removed: string[] }>`.
- Consumes: Node.js `fs`, `path`, globales `fetch` (Node ≥18).

- [ ] **Step 1: package.json um Test-Skript ergänzen**

In `package.json`, im `"scripts"`-Block nach `"debug"` ergänzen:

```json
    "test": "node --test scripts/"
```

- [ ] **Step 2: Tests für die reinen Funktionen schreiben (Lib existiert noch nicht)**

`scripts/facebook-sync-lib.test.js`:
```javascript
const test = require("node:test");
const assert = require("node:assert/strict");
const {
	pickLargestImage,
	filterNewPhotos,
	buildGalleryEntry,
	sortGalleryNewestFirst,
} = require("./facebook-sync-lib.js");

test("pickLargestImage wählt das breiteste Bild", () => {
	const images = [
		{ width: 200, height: 133, source: "small.jpg" },
		{ width: 800, height: 600, source: "large.jpg" },
		{ width: 400, height: 300, source: "medium.jpg" },
	];
	assert.equal(pickLargestImage(images).source, "large.jpg");
});

test("pickLargestImage gibt null bei leerem Array zurück", () => {
	assert.equal(pickLargestImage([]), null);
});

test("filterNewPhotos lässt bekannte und ausgeschlossene IDs weg", () => {
	const apiPhotos = [{ id: "1" }, { id: "2" }, { id: "3" }];
	const known = new Set(["1"]);
	const excluded = new Set(["3"]);
	const result = filterNewPhotos(apiPhotos, known, excluded);
	assert.deepEqual(result.map((p) => p.id), ["2"]);
});

test("buildGalleryEntry baut den Eintrag korrekt", () => {
	const photo = { id: "42", created_time: "2024-05-01T00:00:00+0000" };
	assert.deepEqual(buildGalleryEntry(photo, "42.jpg"), {
		id: "42",
		filename: "42.jpg",
		createdTime: "2024-05-01T00:00:00+0000",
	});
});

test("sortGalleryNewestFirst sortiert neueste zuerst", () => {
	const gallery = [
		{ id: "a", createdTime: "2024-01-01T00:00:00+0000" },
		{ id: "b", createdTime: "2024-06-01T00:00:00+0000" },
	];
	const sorted = sortGalleryNewestFirst(gallery);
	assert.deepEqual(sorted.map((e) => e.id), ["b", "a"]);
});
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `"/c/Program Files/nodejs/node.exe" --test scripts/facebook-sync-lib.test.js`
Expected: FAIL — `Error: Cannot find module './facebook-sync-lib.js'`

- [ ] **Step 4: Reine Logik-Funktionen implementieren**

`scripts/facebook-sync-lib.js`:
```javascript
function pickLargestImage(images) {
	if (!images || images.length === 0) return null;
	return images.reduce((largest, img) => (img.width > largest.width ? img : largest));
}

function filterNewPhotos(apiPhotos, knownIds, excludedIds) {
	return apiPhotos.filter((p) => !knownIds.has(p.id) && !excludedIds.has(p.id));
}

function buildGalleryEntry(photo, filename) {
	return { id: photo.id, filename, createdTime: photo.created_time };
}

function sortGalleryNewestFirst(gallery) {
	return [...gallery].sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
}

module.exports = { pickLargestImage, filterNewPhotos, buildGalleryEntry, sortGalleryNewestFirst };
```

- [ ] **Step 5: Tests erneut laufen lassen, Erfolg bestätigen**

Run: `"/c/Program Files/nodejs/node.exe" --test scripts/facebook-sync-lib.test.js`
Expected: 5 Tests, alle PASS.

- [ ] **Step 6: CLI-Skript mit Graph-API-Anbindung schreiben**

`scripts/sync-facebook-photos.js`:
```javascript
const fs = require("fs");
const path = require("path");
const {
	pickLargestImage,
	filterNewPhotos,
	buildGalleryEntry,
	sortGalleryNewestFirst,
} = require("./facebook-sync-lib.js");

async function fetchAllPhotos(pageId, accessToken, fetchImpl) {
	let url =
		"https://graph.facebook.com/v19.0/" +
		pageId +
		"/photos?type=uploaded&fields=id,images,created_time&access_token=" +
		accessToken;
	const results = [];
	while (url) {
		const res = await fetchImpl(url);
		if (!res.ok) {
			const body = await res.text();
			throw new Error(`Facebook Graph API Fehler (${res.status}): ${body}`);
		}
		const json = await res.json();
		results.push(...json.data);
		url = json.paging && json.paging.next ? json.paging.next : null;
	}
	return results;
}

async function defaultDownload(url, destPath, fetchImpl) {
	const res = await fetchImpl(url);
	if (!res.ok) {
		throw new Error(`Download fehlgeschlagen (${res.status}): ${url}`);
	}
	const buffer = Buffer.from(await res.arrayBuffer());
	fs.writeFileSync(destPath, buffer);
}

async function runSync({
	pageId,
	accessToken,
	dataDir,
	imagesDir,
	fetchImpl = fetch,
	downloadImpl = defaultDownload,
}) {
	fs.mkdirSync(imagesDir, { recursive: true });
	const galleryPath = path.join(dataDir, "nailsGallery.json");
	const excludedPath = path.join(dataDir, "nailsExcluded.json");

	const gallery = JSON.parse(fs.readFileSync(galleryPath, "utf8"));
	const excludedIds = new Set(JSON.parse(fs.readFileSync(excludedPath, "utf8")));
	const knownIds = new Set(gallery.map((entry) => entry.id));

	const apiPhotos = await fetchAllPhotos(pageId, accessToken, fetchImpl);
	const newPhotos = filterNewPhotos(apiPhotos, knownIds, excludedIds);

	const added = [];
	for (const photo of newPhotos) {
		const largest = pickLargestImage(photo.images);
		if (!largest) continue;
		const filename = `${photo.id}.jpg`;
		await downloadImpl(largest.source, path.join(imagesDir, filename), fetchImpl);
		added.push(buildGalleryEntry(photo, filename));
	}

	let updatedGallery = gallery.concat(added);

	const removed = [];
	updatedGallery = updatedGallery.filter((entry) => {
		if (excludedIds.has(entry.id)) {
			const filePath = path.join(imagesDir, entry.filename);
			if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
			removed.push(entry.id);
			return false;
		}
		return true;
	});

	updatedGallery = sortGalleryNewestFirst(updatedGallery);

	const changed = added.length > 0 || removed.length > 0;
	if (changed) {
		fs.writeFileSync(galleryPath, JSON.stringify(updatedGallery, null, 2) + "\n");
	}

	return { changed, added: added.map((e) => e.id), removed };
}

module.exports = { runSync, fetchAllPhotos };

if (require.main === module) {
	const pageId = process.env.FB_PAGE_ID;
	const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;
	if (!pageId || !accessToken) {
		console.error("FB_PAGE_ID und FB_PAGE_ACCESS_TOKEN müssen gesetzt sein.");
		process.exit(1);
	}
	runSync({
		pageId,
		accessToken,
		dataDir: path.join(__dirname, "..", "src", "_data"),
		imagesDir: path.join(__dirname, "..", "src", "images", "nails"),
	})
		.then((result) => {
			console.log(`Sync abgeschlossen: ${result.added.length} neu, ${result.removed.length} entfernt.`);
			if (process.env.GITHUB_OUTPUT) {
				fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${result.changed}\n`);
			}
		})
		.catch((err) => {
			console.error(err);
			process.exit(1);
		});
}
```

- [ ] **Step 7: Integrationstest mit gefaktem fetch/download schreiben**

An `scripts/facebook-sync-lib.test.js` anhängen (gleiche Datei, da `node --test scripts/` alle `*.test.js` findet — für Übersichtlichkeit trotzdem als eigene Datei):

`scripts/sync-facebook-photos.test.js`:
```javascript
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { runSync } = require("./sync-facebook-photos.js");

function makeTempDirs() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "nails-sync-test-"));
	const dataDir = path.join(root, "data");
	const imagesDir = path.join(root, "images");
	fs.mkdirSync(dataDir, { recursive: true });
	fs.mkdirSync(imagesDir, { recursive: true });
	fs.writeFileSync(path.join(dataDir, "nailsGallery.json"), "[]");
	fs.writeFileSync(path.join(dataDir, "nailsExcluded.json"), "[]");
	return { root, dataDir, imagesDir };
}

function fakeFetch(responses) {
	return async (url) => {
		const body = responses[url];
		if (!body) throw new Error(`Keine gefakte Antwort für ${url}`);
		return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
	};
}

test("runSync lädt neue Fotos herunter und schreibt die Galerie", async () => {
	const { dataDir, imagesDir } = makeTempDirs();
	const page1Url =
		"https://graph.facebook.com/v19.0/999/photos?type=uploaded&fields=id,images,created_time&access_token=TOKEN";
	const page2Url = "https://graph.facebook.com/v19.0/page2";
	const fetchImpl = fakeFetch({
		[page1Url]: {
			data: [
				{
					id: "1",
					images: [{ width: 200, height: 133, source: "http://fake/1-small.jpg" }, { width: 600, height: 400, source: "http://fake/1-large.jpg" }],
					created_time: "2024-01-01T00:00:00+0000",
				},
			],
			paging: { next: page2Url },
		},
		[page2Url]: {
			data: [
				{
					id: "2",
					images: [{ width: 800, height: 600, source: "http://fake/2-large.jpg" }],
					created_time: "2024-06-01T00:00:00+0000",
				},
			],
		},
	});
	const downloadCalls = [];
	const downloadImpl = async (url, destPath) => {
		downloadCalls.push(url);
		fs.writeFileSync(destPath, "fake-bytes");
	};

	const result = await runSync({
		pageId: "999",
		accessToken: "TOKEN",
		dataDir,
		imagesDir,
		fetchImpl,
		downloadImpl,
	});

	assert.equal(result.changed, true);
	assert.deepEqual(result.added.sort(), ["1", "2"]);
	assert.deepEqual(downloadCalls.sort(), ["http://fake/1-large.jpg", "http://fake/2-large.jpg"]);
	assert.ok(fs.existsSync(path.join(imagesDir, "1.jpg")));
	assert.ok(fs.existsSync(path.join(imagesDir, "2.jpg")));

	const gallery = JSON.parse(fs.readFileSync(path.join(dataDir, "nailsGallery.json"), "utf8"));
	assert.deepEqual(gallery.map((e) => e.id), ["2", "1"]);
});

test("runSync lädt bekannte Fotos nicht erneut herunter", async () => {
	const { dataDir, imagesDir } = makeTempDirs();
	fs.writeFileSync(
		path.join(dataDir, "nailsGallery.json"),
		JSON.stringify([{ id: "1", filename: "1.jpg", createdTime: "2024-01-01T00:00:00+0000" }])
	);
	const url =
		"https://graph.facebook.com/v19.0/999/photos?type=uploaded&fields=id,images,created_time&access_token=TOKEN";
	const fetchImpl = fakeFetch({
		[url]: { data: [{ id: "1", images: [{ width: 600, height: 400, source: "http://fake/1.jpg" }], created_time: "2024-01-01T00:00:00+0000" }] },
	});
	let downloadCount = 0;
	const downloadImpl = async () => {
		downloadCount += 1;
	};

	const result = await runSync({ pageId: "999", accessToken: "TOKEN", dataDir, imagesDir, fetchImpl, downloadImpl });

	assert.equal(result.changed, false);
	assert.equal(downloadCount, 0);
});

test("runSync entfernt ausgeschlossene Fotos aus Galerie und Dateisystem", async () => {
	const { dataDir, imagesDir } = makeTempDirs();
	fs.writeFileSync(
		path.join(dataDir, "nailsGallery.json"),
		JSON.stringify([{ id: "1", filename: "1.jpg", createdTime: "2024-01-01T00:00:00+0000" }])
	);
	fs.writeFileSync(path.join(dataDir, "nailsExcluded.json"), JSON.stringify(["1"]));
	fs.writeFileSync(path.join(imagesDir, "1.jpg"), "fake-bytes");
	const url =
		"https://graph.facebook.com/v19.0/999/photos?type=uploaded&fields=id,images,created_time&access_token=TOKEN";
	const fetchImpl = fakeFetch({ [url]: { data: [] } });

	const result = await runSync({ pageId: "999", accessToken: "TOKEN", dataDir, imagesDir, fetchImpl });

	assert.equal(result.changed, true);
	assert.deepEqual(result.removed, ["1"]);
	assert.equal(fs.existsSync(path.join(imagesDir, "1.jpg")), false);
	const gallery = JSON.parse(fs.readFileSync(path.join(dataDir, "nailsGallery.json"), "utf8"));
	assert.deepEqual(gallery, []);
});
```

- [ ] **Step 8: Alle Tests ausführen**

Run: `"/c/Program Files/nodejs/node.exe" --test scripts/`
Expected: 8 Tests insgesamt (5 aus `facebook-sync-lib.test.js`, 3 aus `sync-facebook-photos.test.js`), alle PASS, 0 FAIL.

- [ ] **Step 9: Commit**

```bash
git add scripts/ package.json
git commit -m "feat: Facebook-Sync-Skript mit automatisierten Tests"
```

---

## Task 6: GitHub-Actions-Workflow für den täglichen Sync

**Files:**
- Create: `.github/workflows/sync-facebook-photos.yml`

**Interfaces:**
- Consumes: `scripts/sync-facebook-photos.js` (aus Task 5), GitHub-Secrets `FB_PAGE_ID` und `FB_PAGE_ACCESS_TOKEN` (werden erst im Setup-Schritt von Task 7 tatsächlich angelegt — der Workflow läuft bis dahin fehl, was erwartet und harmlos ist, siehe Global Constraints).

- [ ] **Step 1: Workflow-Datei schreiben**

`.github/workflows/sync-facebook-photos.yml`:
```yaml
name: Sync Facebook photos

on:
  schedule:
    - cron: "17 4 * * *"
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: sync-facebook-photos
  cancel-in-progress: false

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Sync photos from Facebook
        env:
          FB_PAGE_ID: ${{ secrets.FB_PAGE_ID }}
          FB_PAGE_ACCESS_TOKEN: ${{ secrets.FB_PAGE_ACCESS_TOKEN }}
        run: node scripts/sync-facebook-photos.js

      - name: Commit and push if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add src/images/nails src/_data/nailsGallery.json
          if ! git diff --cached --quiet; then
            git commit -m "chore: sync Facebook-Fotos"
            git push
          else
            echo "Keine neuen Facebook-Fotos."
          fi
```

- [ ] **Step 2: YAML-Syntax lokal prüfen**

Run: `node -e "require('fs').readFileSync('.github/workflows/sync-facebook-photos.yml','utf8')" && echo "Datei lesbar"`

(Kein YAML-Parser als Dependency vorhanden — Sichtprüfung der Einrückung reicht hier; die eigentliche Validierung erfolgt durch GitHub selbst beim ersten Workflow-Lauf in Task 7.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/sync-facebook-photos.yml
git commit -m "feat: geplanter GitHub-Actions-Workflow für Facebook-Foto-Sync"
```

---

## Task 7: Setup-Anleitung für den Facebook-Zugriff

**Files:**
- Create: `docs/facebook-sync-setup.md`

**Interfaces:**
- Produces: Für Menschen lesbares Dokument, keine Code-Schnittstelle. Ergebnis der Anleitung sind zwei GitHub-Repository-Secrets (`FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN`), die der Workflow aus Task 6 konsumiert.

- [ ] **Step 1: Anleitung schreiben**

`docs/facebook-sync-setup.md`:
```markdown
# Facebook-Foto-Sync einrichten

Einmaliger Schritt, danach läuft der Sync automatisch. Muss von einer
Person gemacht werden, die **Admin der Facebook-Seite "Priema
Nageldesign"** ist.

## 1. Facebook-App anlegen

1. Auf [developers.facebook.com/apps](https://developers.facebook.com/apps) einloggen (mit dem Facebook-Account, der Admin der Seite ist).
2. "App erstellen" → Typ **"Sonstige"** → **"Unternehmen"** wählen.
3. Einen beliebigen App-Namen vergeben (z. B. "Priema Nageldesign Sync").
4. Die App bleibt im **Entwicklungsmodus** — das reicht, da nur die eigene
   Seite gelesen wird. Ein Facebook-Review ist **nicht** nötig.

## 2. Page Access Token erzeugen

1. Im Facebook-App-Dashboard links auf **"Graph API Explorer"** (unter
   Tools) gehen, oder direkt
   [developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer)
   öffnen.
2. Oben rechts die gerade erstellte App auswählen.
3. Bei "User or Page" **"Get Page Access Token"** wählen und die Seite
   "Priema Nageldesign" auswählen.
4. Bei den Berechtigungen **`pages_read_engagement`** und
   **`pages_show_list`** hinzufügen, dann den Token generieren.
5. Der erzeugte Token ist zunächst nur 1–2 Stunden gültig — das ist
   normal. Um ihn langlebig zu machen:
   - Auf das kleine "i"-Symbol neben dem Token klicken → **"Open in
     Access Token Debugger"**.
   - Dort auf **"Extend Access Token"** klicken. Der verlängerte Token
     gilt ca. 60 Tage und erneuert sich als Page Token danach in der
     Regel automatisch, solange der Account Admin der Seite bleibt.
6. Den langen Token-String kopieren.

## 3. Page-ID herausfinden

1. Auf der Facebook-Seite "Priema Nageldesign" → "Info" → dort steht die
   numerische **Seiten-ID**. Alternativ im Graph API Explorer
   `me/accounts` abfragen — die Antwort enthält `id` für jede
   verwaltete Seite.

## 4. GitHub-Secrets anlegen

1. Im GitHub-Repository `JustinPriem/priema-nageldesign.de` → **Settings
   → Secrets and variables → Actions**.
2. **"New repository secret"** → Name `FB_PAGE_ACCESS_TOKEN`, Wert der
   Token-String aus Schritt 2.
3. Noch ein Secret → Name `FB_PAGE_ID`, Wert die Seiten-ID aus Schritt 3.

## 5. Ersten Sync auslösen

1. Im Repository → Tab **"Actions"** → Workflow **"Sync Facebook
   photos"** auswählen → **"Run workflow"** → **"Run workflow"**
   bestätigen.
2. Nach ca. 1–2 Minuten ist der Lauf grün, und ein neuer Commit mit den
   Facebook-Fotos erscheint automatisch im Repository. Die Website zeigt
   die Fotos nach dem nächsten automatischen Deploy (läuft direkt im
   Anschluss).

## Ein Foto von der Website ausblenden

Ohne es auf Facebook zu löschen: die Facebook-Foto-ID (aus dem Dateinamen
in `src/images/nails/`, z. B. `123456789.jpg` → ID `123456789`) in
`src/_data/nailsExcluded.json` eintragen und committen (oder direkt in
GitHub im Browser bearbeiten). Beim nächsten Sync-Lauf verschwindet das
Foto von der Website.

## Wenn der Sync mal fehlschlägt

Das betrifft nur den Sync-Workflow, nicht die Website selbst — die bleibt
online und zeigt weiterhin die zuletzt synchronisierten Fotos. Häufigste
Ursache: der Token ist abgelaufen oder wurde widerrufen. Schritte 2 und 4
oben wiederholen, um einen neuen Token zu hinterlegen.
```

- [ ] **Step 2: Anleitung auf Konsistenz mit dem tatsächlichen Workflow prüfen**

Manuell gegenlesen: Secret-Namen (`FB_PAGE_ACCESS_TOKEN`, `FB_PAGE_ID`) müssen exakt mit `.github/workflows/sync-facebook-photos.yml` (Task 6) übereinstimmen. Repository-Name im Text (`JustinPriem/priema-nageldesign.de`) muss mit dem tatsächlichen Remote übereinstimmen.

Run: `git remote get-url origin`
Expected: `https://github.com/JustinPriem/priema-nageldesign.de.git` — stimmt mit dem Dokument überein.

- [ ] **Step 3: Commit**

```bash
git add docs/facebook-sync-setup.md
git commit -m "docs: Setup-Anleitung für den Facebook-Foto-Sync"
```

---

## Nach Abschluss aller Tasks

- `npm test` (bzw. `node --test scripts/`) läuft grün.
- `"/c/Program Files/nodejs/node.exe" node_modules/@11ty/eleventy/cmd.cjs` baut fehlerfrei, `_site/galerie/index.html` zeigt den Platzhaltertext (da `nailsGallery.json` noch `[]` ist — das ist der korrekte Zustand, bis Task 7 von einem Menschen durchgeführt und der erste echte Sync gelaufen ist).
- Push nach `main` löst den bestehenden Deploy-Workflow aus wie gewohnt; der neue Sync-Workflow läuft unabhängig nach Zeitplan bzw. manuell.
- Sobald die Facebook-Secrets hinterlegt sind (Task 7, von Nadine/Justin außerhalb dieser Coding-Session durchzuführen) und der erste Sync-Lauf grün war: Website erneut aufrufen und die "Nails"-Kachel prüfen (echte Fotos statt Platzhalter, "Mehr laden" falls mehr als 24 Fotos vorhanden).
