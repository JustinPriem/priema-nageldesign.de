const Image = require("@11ty/eleventy-img");
const path = require("path");

async function imageShortcode(src, alt, sizes = "100vw", widths = [400, 800, 1200]) {
	if (!alt) {
		throw new Error(`Fehlendes alt-Attribut für Bild: ${src}`);
	}

	const metadata = await Image(path.join("src/images", src), {
		widths: [...widths, null],
		formats: ["webp", "jpeg"],
		outputDir: "_site/img/",
		urlPath: "/img/",
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
		urlPath: "/img/",
		filenameFormat: function (id, src, w, format) {
			const name = path.basename(src, path.extname(src));
			return `${name}-${w}w.${format}`;
		},
	});
	return metadata.jpeg[0].url;
}

module.exports = function (eleventyConfig) {
	eleventyConfig.addPassthroughCopy("src/css");
	eleventyConfig.addPassthroughCopy("src/js");
	eleventyConfig.addPassthroughCopy("src/favicon.svg");

	eleventyConfig.addAsyncShortcode("image", imageShortcode);
	eleventyConfig.addAsyncShortcode("imageUrl", imageUrlShortcode);

	eleventyConfig.addFilter("currentYear", () => new Date().getFullYear());
	eleventyConfig.addFilter("pad2", (n) => String(n).padStart(2, "0"));

	return {
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
