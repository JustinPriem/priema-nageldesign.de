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
