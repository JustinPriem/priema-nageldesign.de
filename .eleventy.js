const Image = require("@11ty/eleventy-img");
const path = require("path");

// GitHub Pages project site → served under /priema-nageldesign.de/, not at domain root.
const pathPrefix = "/priema-nageldesign.de/";

async function imageShortcode(src, alt, sizes = "100vw", widths = [400, 800, 1200]) {
	if (!alt) {
		throw new Error(`Fehlendes alt-Attribut für Bild: ${src}`);
	}

	const metadata = await Image(path.join("src/images", src), {
		widths: [...widths, null],
		formats: ["webp", "jpeg"],
		outputDir: "_site/img/",
		urlPath: pathPrefix + "img/",
		filenameFormat: function (id, src, width, format) {
			const name = path.basename(src, path.extname(src));
			return `${name}-${width}w.${format}`;
		},
	});

	const imageAttributes = {
		alt,
		sizes,
		loading: "lazy",
		decoding: "async",
	};

	return Image.generateHTML(metadata, imageAttributes);
}

async function imageUrlShortcode(src, width) {
	const metadata = await Image(path.join("src/images", src), {
		widths: [width],
		formats: ["jpeg"],
		outputDir: "_site/img/",
		urlPath: pathPrefix + "img/",
		filenameFormat: function (id, src, w, format) {
			const name = path.basename(src, path.extname(src));
			return `${name}-${w}w.${format}`;
		},
	});
	return metadata.jpeg[0].url;
}

// defer=true: nur data-src/data-srcset, das Bild wird erst durch JS aktiviert.
// defer=false: echtes src/srcset, damit die erste Portion auch ohne JS sichtbar ist.
async function imageDeferredShortcode(src, alt, defer = true) {
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

	const sourceAttr = defer ? "data-srcset" : "srcset";
	const imgAttr = defer ? "data-src" : "src";

	return `<picture><source type="image/webp" ${sourceAttr}="${webp.url}"><img ${imgAttr}="${jpeg.url}" alt="${alt}" width="${jpeg.width}" height="${jpeg.height}" loading="lazy" decoding="async"></picture>`;
}

module.exports = function (eleventyConfig) {
	eleventyConfig.addPassthroughCopy("src/css");
	eleventyConfig.addPassthroughCopy("src/js");
	eleventyConfig.addPassthroughCopy("src/favicon.svg");

	eleventyConfig.addAsyncShortcode("image", imageShortcode);
	eleventyConfig.addAsyncShortcode("imageUrl", imageUrlShortcode);
	eleventyConfig.addAsyncShortcode("imageDeferred", imageDeferredShortcode);

	eleventyConfig.addFilter("currentYear", () => new Date().getFullYear());
	eleventyConfig.addFilter("pad2", (n) => String(n).padStart(2, "0"));

	return {
		pathPrefix,
		dir: {
			input: "src",
			output: "_site",
			includes: "_includes",
			data: "_data",
		},
		markdownTemplateEngine: "njk",
		htmlTemplateEngine: "njk",
	};
};
