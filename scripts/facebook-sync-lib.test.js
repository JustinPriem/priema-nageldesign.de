const test = require("node:test");
const assert = require("node:assert/strict");
const {
	pickImageNearWidth,
	filterNewPhotos,
	buildGalleryEntry,
	sortGalleryNewestFirst,
} = require("./facebook-sync-lib.js");

test("pickImageNearWidth wählt das kleinste Bild ab Zielbreite", () => {
	const images = [
		{ width: 480, height: 320, source: "small.jpg" },
		{ width: 2048, height: 1536, source: "huge.jpg" },
		{ width: 1200, height: 900, source: "medium.jpg" },
	];
	assert.equal(pickImageNearWidth(images, 1024).source, "medium.jpg");
});

test("pickImageNearWidth fällt auf das größte Bild zurück, wenn keins die Zielbreite erreicht", () => {
	const images = [
		{ width: 200, height: 133, source: "small.jpg" },
		{ width: 800, height: 600, source: "large.jpg" },
		{ width: 400, height: 300, source: "medium.jpg" },
	];
	assert.equal(pickImageNearWidth(images, 1024).source, "large.jpg");
});

test("pickImageNearWidth gibt null bei leerem Array zurück", () => {
	assert.equal(pickImageNearWidth([], 1024), null);
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
