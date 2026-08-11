(function () {
	var tabs = Array.prototype.slice.call(document.querySelectorAll("[role='tab']"));
	var panels = Array.prototype.slice.call(document.querySelectorAll("[role='tabpanel']"));

	function activate(name) {
		tabs.forEach(function (tab) {
			var isActive = tab.dataset.tab === name;
			tab.setAttribute("aria-selected", isActive ? "true" : "false");
			tab.tabIndex = isActive ? 0 : -1;
		});
		panels.forEach(function (panel) {
			var isActive = panel.dataset.panel === name;
			panel.classList.toggle("is-active", isActive);
			if (isActive) {
				panel.removeAttribute("hidden");
			} else {
				panel.setAttribute("hidden", "");
			}
		});
	}

	tabs.forEach(function (tab, index) {
		tab.addEventListener("click", function () {
			activate(tab.dataset.tab);
			history.replaceState(null, "", "#" + tab.dataset.tab);
		});
		tab.addEventListener("keydown", function (event) {
			var newIndex = null;
			if (event.key === "ArrowRight") newIndex = (index + 1) % tabs.length;
			if (event.key === "ArrowLeft") newIndex = (index - 1 + tabs.length) % tabs.length;
			if (newIndex !== null) {
				tabs[newIndex].focus();
				activate(tabs[newIndex].dataset.tab);
				history.replaceState(null, "", "#" + tabs[newIndex].dataset.tab);
			}
		});
	});

	var initialTab = window.location.hash.replace("#", "");
	if (initialTab && tabs.some(function (t) { return t.dataset.tab === initialTab; })) {
		activate(initialTab);
	}

	// Lightbox
	var lightbox = document.getElementById("lightbox");
	var lightboxImg = document.getElementById("lightbox-img");
	var lightboxClose = document.getElementById("lightbox-close");

	document.querySelectorAll(".photo-grid button").forEach(function (button) {
		button.addEventListener("click", function () {
			var full = button.getAttribute("data-full");
			var altText = button.querySelector("img") ? button.querySelector("img").alt : "";
			lightboxImg.src = full;
			lightboxImg.alt = altText;
			lightbox.classList.add("is-open");
		});
	});

	function closeLightbox() {
		lightbox.classList.remove("is-open");
		lightboxImg.src = "";
	}

	if (lightboxClose) lightboxClose.addEventListener("click", closeLightbox);
	if (lightbox) {
		lightbox.addEventListener("click", function (event) {
			if (event.target === lightbox) closeLightbox();
		});
	}
	document.addEventListener("keydown", function (event) {
		if (event.key === "Escape") closeLightbox();
	});

	// Paginierte Grids (z.B. die von Facebook synchronisierte Nails-Galerie):
	// Bilder jenseits der ersten Portion bekommen erst beim Klick auf
	// "Mehr laden" eine echte Bildquelle, damit sie nicht ungefragt geladen werden.
	document.querySelectorAll("[data-page-size]").forEach(function (grid) {
		var pageSize = parseInt(grid.dataset.pageSize, 10);
		var items = Array.prototype.slice.call(grid.children);
		var shown = 0;
		var loadMoreBtn = grid.parentElement.querySelector("[data-load-more]");

		function activateItem(item) {
			item.hidden = false;
			// Erst die <source>-Kandidaten, dann das <img>: sonst kann sich
			// der Browser schon auf das JPEG festlegen, bevor das WebP
			// überhaupt ein srcset hat.
			var sources = item.querySelectorAll("source[data-srcset]");
			sources.forEach(function (source) {
				source.srcset = source.getAttribute("data-srcset");
				source.removeAttribute("data-srcset");
			});
			var img = item.querySelector("img[data-src]");
			if (img) {
				img.src = img.getAttribute("data-src");
				img.removeAttribute("data-src");
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
})();
