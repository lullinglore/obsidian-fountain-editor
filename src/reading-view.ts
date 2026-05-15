import {TFile} from "obsidian";
import {classifyLines, type ClassifiedLine} from "./classifier.js";
import type FountainPlugin from "./main.js";
import {type FountainEditorSettings} from "./settings.js";

// Module-scope cache so prewarmCache and the post-processor share the same Map.
const cache = new Map<string, ClassifiedLine[]>();

function stripFrontmatter(source: string): string {
	const match = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
	if (match) return source.slice(match[0].length);
	return source;
}

function isFountainFile(
	sourcePath: string,
	frontmatter: Record<string, unknown> | null | undefined,
	plugin: FountainPlugin,
): boolean {
	const file = plugin.app.vault.getAbstractFileByPath(sourcePath);
	if (file instanceof TFile) {
		if (file.extension === "fountain" || file.basename.endsWith(".fountain")) {
			return true;
		}
	}

	const tags = frontmatter?.tags;
	if (Array.isArray(tags) && tags.includes("fountain")) return true;
	if (typeof tags === "string" && tags === "fountain") return true;

	const cssclasses = frontmatter?.cssclasses;
	if (Array.isArray(cssclasses) && cssclasses.includes("fountain")) return true;
	if (typeof cssclasses === "string" && cssclasses === "fountain") return true;

	return false;
}

/** Pre-warm the classifier cache for a file so the post-processor can run synchronously. */
export async function prewarmCache(
	plugin: FountainPlugin,
	settings: FountainEditorSettings,
	sourcePath: string,
): Promise<void> {
	const file = plugin.app.vault.getAbstractFileByPath(sourcePath);
	if (!(file instanceof TFile)) return;

	// Skip non-fountain files to avoid reading every file in the vault.
	if (file.extension !== "fountain" && !file.basename.endsWith(".fountain")) {
		const metadata = plugin.app.metadataCache.getFileCache(file);
		const fm = metadata?.frontmatter;
		const tags = fm?.tags;
		const cssclasses = fm?.cssclasses;
		const isFountain =
			(Array.isArray(tags) && tags.includes("fountain")) ||
			(typeof tags === "string" && tags === "fountain") ||
			(Array.isArray(cssclasses) && cssclasses.includes("fountain")) ||
			(typeof cssclasses === "string" && cssclasses === "fountain");
		if (!isFountain) return;
	}

	const source = stripFrontmatter(await plugin.app.vault.cachedRead(file));
	cache.set(sourcePath, classifyLines(source, settings));
}

/** Strip inline Markdown emphasis and Fountain single-char prefixes to normalize text for matching. */
function normalizeText(text: string): string {
	return text
		.replace(/^[!~@]/, "")
		.replace(/^=(?!=)/, "")
		.replace(/\*+([^*]+)\*+/g, "$1")
		.replace(/_([^_]+)_/g, "$1")
		.trim();
}

function buildTokenMap(classified: ClassifiedLine[]): Map<string, string> {
	const map = new Map<string, string>();
	for (const {text, tokenType} of classified) {
		if (!tokenType || !text.trim()) continue;
		const trimmed = text.trim();
		map.set(trimmed, tokenType);
		const normalized = normalizeText(trimmed);
		if (normalized !== trimmed) map.set(normalized, tokenType);
	}
	return map;
}

/** Split a `<p>` at its `<br>` children, returning one new `<p>` per line. */
function splitAtBr(el: HTMLElement): HTMLElement[] {
	const hasBr = Array.from(el.childNodes).some((n) => n.nodeName === "BR");
	if (!hasBr) return [el];

	const tag = el.tagName.toLowerCase();
	const segments: HTMLElement[] = [];
	let current = document.createElement(tag);

	for (const node of Array.from(el.childNodes)) {
		if (node.nodeName === "BR") {
			if (current.childNodes.length > 0) segments.push(current);
			current = document.createElement(tag);
		} else {
			current.appendChild(node.cloneNode(true));
		}
	}
	if (current.childNodes.length > 0) segments.push(current);
	return segments.length > 0 ? segments : [el];
}

function applyBlockquoteClass(
	el: HTMLElement,
	settings: FountainEditorSettings,
): void {
	const innerText = el.textContent?.trim() ?? "";
	if (innerText.endsWith("<")) {
		el.classList.add("cm-fountain-centered");
	} else if (!settings.preferObsidianBlockquote) {
		el.classList.add("cm-fountain-transition");
	}
}

function applyParagraphClass(
	el: HTMLElement,
	tokenMap: Map<string, string>,
): void {
	const text = el.textContent?.trim();
	if (!text) return;
	const tokenType = tokenMap.get(text) ?? tokenMap.get(normalizeText(text));
	if (tokenType) el.classList.add(`cm-fountain-${tokenType}`);
}

function processElement(
	el: HTMLElement,
	tokenMap: Map<string, string>,
	settings: FountainEditorSettings,
): void {
	const tag = el.tagName.toLowerCase();
	if (tag === "hr") {
		el.classList.add("cm-fountain-page-break");
	} else if (/^h[1-6]$/.test(tag)) {
		el.classList.add("cm-fountain-section");
	} else if (tag === "blockquote") {
		applyBlockquoteClass(el, settings);
	} else if (tag === "p") {
		const segments = splitAtBr(el);
		if (segments.length === 1) {
			applyParagraphClass(el, tokenMap);
		} else {
			const newEls = segments.map((seg) => {
				applyParagraphClass(seg, tokenMap);
				return seg;
			});
			el.replaceWith(...newEls);
		}
	} else {
		for (const child of Array.from(el.children) as HTMLElement[]) {
			processElement(child, tokenMap, settings);
		}
	}
}

export function registerReadingViewPostProcessor(
	plugin: FountainPlugin,
	settings: FountainEditorSettings,
): void {
	// Re-warm cache when file content changes so post-processor stays synchronous.
	plugin.registerEvent(
		plugin.app.metadataCache.on("changed", (file) => {
			prewarmCache(plugin, settings, file.path);
		}),
	);

	plugin.registerMarkdownPostProcessor(async (el, ctx) => {
		if (!isFountainFile(ctx.sourcePath, ctx.frontmatter, plugin)) return;

		// Broaden container search to cover reading view and print/PDF contexts.
		const container =
			el.closest(".markdown-preview-view") ??
			el.closest(".markdown-reading-view") ??
			el.closest(".print-preview") ??
			el.ownerDocument?.querySelector(
				".markdown-preview-view, .markdown-reading-view, .print-preview",
			);
		container?.classList.add("fountain");

		let classified = cache.get(ctx.sourcePath);
		if (!classified) {
			// Cold cache: read async. Works for reading view; may miss PDF export
			// if the file was never opened before triggering export.
			const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
			if (!(file instanceof TFile)) return;
			const source = stripFrontmatter(await plugin.app.vault.cachedRead(file));
			classified = classifyLines(source, settings);
			cache.set(ctx.sourcePath, classified);
		}

		const tokenMap = buildTokenMap(classified);
		const children = Array.from(el.children) as HTMLElement[];
		if (children.length === 0) {
			processElement(el, tokenMap, settings);
		} else {
			for (const child of children) {
				processElement(child, tokenMap, settings);
			}
		}
	});
}
