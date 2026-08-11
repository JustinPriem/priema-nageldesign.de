// Wählt das kleinste Bild, das noch mindestens targetWidth breit ist —
// so landen keine unnötig großen Originale im Repo. Gibt es kein Bild in
// Zielbreite, wird das größte verfügbare genommen.
function pickImageNearWidth(images, targetWidth) {
	if (!images || images.length === 0) return null;
	const atLeastTarget = images.filter((img) => img.width >= targetWidth);
	if (atLeastTarget.length > 0) {
		return atLeastTarget.reduce((smallest, img) => (img.width < smallest.width ? img : smallest));
	}
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

module.exports = { pickImageNearWidth, filterNewPhotos, buildGalleryEntry, sortGalleryNewestFirst };
