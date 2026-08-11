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

// Hält die Testausgabe sauber: die erwarteten Warnungen der Skip-Pfade
// werden gesammelt statt gedruckt.
function captureWarnings(fn) {
	const original = console.warn;
	const warnings = [];
	console.warn = (msg) => warnings.push(String(msg));
	return fn(warnings).finally(() => {
		console.warn = original;
	});
}

function photosUrl(pageId, token) {
	return (
		"https://graph.facebook.com/v19.0/" +
		pageId +
		"/photos?type=uploaded&fields=id,images,created_time&access_token=" +
		token
	);
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

test("runSync überspringt ein fehlgeschlagenes Foto und behält die erfolgreichen", async () => {
	const { dataDir, imagesDir } = makeTempDirs();
	const url = photosUrl("999", "TOKEN");
	const fetchImpl = fakeFetch({
		[url]: {
			data: [
				{ id: "1", images: [{ width: 1200, height: 900, source: "http://fake/1.jpg" }], created_time: "2024-01-01T00:00:00+0000" },
				{ id: "2", images: [{ width: 1200, height: 900, source: "http://fake/kaputt.jpg" }], created_time: "2024-02-01T00:00:00+0000" },
				{ id: "3", images: [{ width: 1200, height: 900, source: "http://fake/3.jpg" }], created_time: "2024-03-01T00:00:00+0000" },
			],
		},
	});
	const downloadImpl = async (downloadUrl, destPath) => {
		if (downloadUrl.includes("kaputt")) throw new Error("404 Not Found");
		fs.writeFileSync(destPath, "fake-bytes");
	};

	const result = await captureWarnings(async (warnings) => {
		const r = await runSync({ pageId: "999", accessToken: "TOKEN", dataDir, imagesDir, fetchImpl, downloadImpl });
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /Foto 2 fehlgeschlagen/);
		return r;
	});

	assert.equal(result.changed, true);
	assert.deepEqual(result.added.sort(), ["1", "3"]);
	assert.equal(fs.existsSync(path.join(imagesDir, "2.jpg")), false);
	const gallery = JSON.parse(fs.readFileSync(path.join(dataDir, "nailsGallery.json"), "utf8"));
	assert.deepEqual(gallery.map((e) => e.id), ["3", "1"]);
});

test("runSync überspringt Fotos mit nicht-numerischer ID und ohne Bildvarianten", async () => {
	const { dataDir, imagesDir } = makeTempDirs();
	const url = photosUrl("999", "TOKEN");
	const fetchImpl = fakeFetch({
		[url]: {
			data: [
				{ id: "../../evil", images: [{ width: 1200, height: 900, source: "http://fake/evil.jpg" }], created_time: "2024-01-01T00:00:00+0000" },
				{ id: "7", images: [], created_time: "2024-02-01T00:00:00+0000" },
			],
		},
	});
	const downloadCalls = [];
	const downloadImpl = async (downloadUrl, destPath) => {
		downloadCalls.push(downloadUrl);
		fs.writeFileSync(destPath, "fake-bytes");
	};

	const result = await captureWarnings(async (warnings) => {
		const r = await runSync({ pageId: "999", accessToken: "TOKEN", dataDir, imagesDir, fetchImpl, downloadImpl });
		assert.equal(warnings.length, 2);
		assert.match(warnings[0], /unerwarteter ID/);
		assert.match(warnings[1], /keine Bildvarianten/);
		return r;
	});

	assert.equal(result.changed, false);
	assert.deepEqual(downloadCalls, []);
	assert.deepEqual(fs.readdirSync(imagesDir), []);
});

test("runSync lädt die Variante nahe 1024px statt der größten", async () => {
	const { dataDir, imagesDir } = makeTempDirs();
	const url = photosUrl("999", "TOKEN");
	const fetchImpl = fakeFetch({
		[url]: {
			data: [
				{
					id: "1",
					images: [
						{ width: 2048, height: 1536, source: "http://fake/1-2048.jpg" },
						{ width: 1080, height: 810, source: "http://fake/1-1080.jpg" },
						{ width: 480, height: 360, source: "http://fake/1-480.jpg" },
					],
					created_time: "2024-01-01T00:00:00+0000",
				},
			],
		},
	});
	const downloadCalls = [];
	const downloadImpl = async (downloadUrl, destPath) => {
		downloadCalls.push(downloadUrl);
		fs.writeFileSync(destPath, "fake-bytes");
	};

	await runSync({ pageId: "999", accessToken: "TOKEN", dataDir, imagesDir, fetchImpl, downloadImpl });

	assert.deepEqual(downloadCalls, ["http://fake/1-1080.jpg"]);
});
