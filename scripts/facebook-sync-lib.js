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
