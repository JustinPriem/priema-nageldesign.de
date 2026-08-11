const fs = require("fs");
const path = require("path");
const {
	pickImageNearWidth,
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
		// Die ID landet als Dateiname auf der Platte und später als
		// HTML-Attribut auf der Seite — nur numerische IDs zulassen.
		if (!/^\d+$/.test(String(photo.id))) {
			console.warn(`Foto mit unerwarteter ID übersprungen: ${photo.id}`);
			continue;
		}
		const chosen = pickImageNearWidth(photo.images, 1024);
		if (!chosen) {
			console.warn(`Foto ${photo.id} übersprungen: keine Bildvarianten geliefert.`);
			continue;
		}
		const filename = `${photo.id}.jpg`;
		try {
			await downloadImpl(chosen.source, path.join(imagesDir, filename), fetchImpl);
		} catch (err) {
			// Ein einzelner fehlgeschlagener Download darf nicht den
			// kompletten Sync (und damit alle anderen Fotos) verwerfen.
			console.warn(`Download von Foto ${photo.id} fehlgeschlagen, wird übersprungen: ${err.message}`);
			continue;
		}
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
		})
		.catch((err) => {
			console.error(err);
			process.exit(1);
		});
}
