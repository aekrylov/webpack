/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

/** @typedef {import("../Compiler")} Compiler */

const printSizes = (sizes, { formatSize }) => {
	const keys = Object.keys(sizes);
	if (keys.length > 1) {
		return keys.map(key => `${formatSize(sizes[key])} (${key})`).join(" ");
	} else if (keys.length === 1) {
		return formatSize(sizes[keys[0]]);
	}
};

const SIMPLE_PRINTERS = {
	"compilation.hash": (hash, { bold, type }) =>
		type === "compilation.hash" ? `Hash: ${bold(hash)}` : undefined,
	"compilation.version": (version, { bold, type }) =>
		type === "compilation.version"
			? `Version: webpack ${bold(version)}`
			: undefined,
	"compilation.time": (time, { bold }) => `Time: ${bold(time)}ms`,
	"compilation.builtAt": (builtAt, { bold }) => {
		const builtAtDate = new Date(builtAt);
		return `Built at: ${builtAtDate.toLocaleDateString(undefined, {
			day: "2-digit",
			month: "2-digit",
			year: "numeric"
		})} ${bold(builtAtDate.toLocaleTimeString())}`;
	},
	"compilation.env": (env, { bold }) =>
		`Environment (--env): ${bold(JSON.stringify(env, null, 2))}`,
	"compilation.publicPath": (publicPath, { bold }) =>
		`PublicPath: ${bold(publicPath || "(none)")}`,
	"compilation.entrypoints": (entrypoints, context, printer) =>
		Array.isArray(entrypoints)
			? undefined
			: printer.print(
					context.type,
					Object.values(entrypoints),
					Object.assign({}, context, { chunkGroupKind: "Entrypoint" })
			  ),
	"compilation.namedChunkGroups": (namedChunkGroups, context, printer) =>
		Array.isArray(namedChunkGroups)
			? undefined
			: printer.print(
					context.type,
					Object.values(namedChunkGroups),
					Object.assign({}, context, { chunkGroupKind: "ChunkGroup" })
			  ),
	"asset.name": (name, { asset: { isOverSizeLimit }, yellow, green }) =>
		(isOverSizeLimit ? yellow : green)(name),
	"asset.size": (
		size,
		{ asset: { isOverSizeLimit }, yellow, green, formatSize }
	) => (isOverSizeLimit ? yellow : green)(formatSize(size)),
	"asset.emitted": (emitted, { green, formatFlag }) =>
		emitted ? green(formatFlag("emitted")) : undefined,
	"asset.isOverSizeLimit": (isOverSizeLimit, { yellow, formatFlag }) =>
		isOverSizeLimit ? yellow(formatFlag("big")) : undefined,
	assetChunk: (id, { formatChunkId }) => formatChunkId(id),
	assetChunkName: name => name,
	"module.id": (id, { formatModuleId }) => formatModuleId(id),
	"module.name": name => name,
	"module.identifier": identifier => identifier,
	"module.sizes": printSizes,
	"module.chunks[]": (id, { formatChunkId }) => formatChunkId(id),
	"module.depth": (depth, { formatFlag }) => formatFlag(`depth ${depth}`),
	"module.cacheable": (cacheable, { formatFlag, red }) =>
		cacheable ? undefined : red(formatFlag("cacheable")),
	"module.orphan": (orphan, { formatFlag, yellow }) =>
		orphan ? yellow(formatFlag("orphan")) : undefined,
	"module.runtime": (runtime, { formatFlag, yellow }) =>
		runtime ? yellow(formatFlag("runtime")) : undefined,
	"module.optional": (optional, { formatFlag, yellow }) =>
		optional ? yellow(formatFlag("optional")) : undefined,
	"module.built": (built, { formatFlag, green }) =>
		built ? green(formatFlag("built")) : undefined,
	"module.assets": (assets, { formatFlag, magenta }) =>
		assets && assets.length
			? magenta(
					formatFlag(
						`${assets.length} ${assets.length === 1 ? "asset" : "assets"}`
					)
			  )
			: undefined,
	"module.failed": (failed, { formatFlag, red }) =>
		failed ? red(formatFlag("failed")) : undefined,
	"module.warnings": (warnings, { formatFlag, yellow }) =>
		warnings
			? yellow(
					formatFlag(`${warnings} ${warnings === 1 ? "warning" : "warnings"}`)
			  )
			: undefined,
	"module.errors": (errors, { formatFlag, red }) =>
		errors
			? red(formatFlag(`${errors} ${errors === 1 ? "error" : "errors"}`))
			: undefined,
	"module.providedExports": (providedExports, { formatFlag, cyan }) => {
		if (Array.isArray(providedExports)) {
			if (providedExports.length === 0) return cyan(formatFlag("no exports"));
			return cyan(formatFlag(`exports ${providedExports.join(", ")}`));
		}
	},
	"module.usedExports": (usedExports, { formatFlag, cyan, module }) => {
		if (usedExports !== true) {
			if (usedExports === null) return cyan(formatFlag("used exports unknown"));
			if (usedExports === false) return cyan(formatFlag("module unused"));
			if (Array.isArray(usedExports)) {
				if (usedExports.length === 0)
					return cyan(formatFlag("no exports used"));
				const providedExportsCount = Array.isArray(module.providedExports)
					? module.providedExports.length
					: null;
				if (
					providedExportsCount !== null &&
					providedExportsCount === module.usedExports.length
				) {
					return cyan(formatFlag("all exports used"));
				} else {
					return cyan(
						formatFlag(`only some exports used: ${usedExports.join(", ")}`)
					);
				}
			}
		}
	},
	"module.optimizationBailout[]": (optimizationBailout, { yellow }) =>
		yellow(optimizationBailout),
	"module.profile": profile => undefined,
	"moduleReason.type": type => type,
	"moduleReason.userRequest": (userRequest, { cyan }) => cyan(userRequest),
	"moduleReason.moduleId": (moduleId, { formatModuleId }) =>
		formatModuleId(moduleId),
	"moduleReason.module": (module, { magenta }) => magenta(module),
	"moduleReason.loc": loc => loc,
	"moduleReason.explanation": (explanation, { cyan }) => cyan(explanation),
	"chunkGroup.kind!": (_, { chunkGroupKind }) => chunkGroupKind,
	"chunkGroup.name": (name, { bold }) => bold(name),
	"chunkGroup.isOverSizeLimit": (isOverSizeLimit, { formatFlag, yellow }) =>
		isOverSizeLimit ? yellow(formatFlag("big")) : undefined,
	"chunkGroup.separator!": () => "=",
	"chunkGroup.assets[]": (asset, { green }) => green(asset)
};

const ITEM_NAMES = {
	"compilation.assets[]": "asset",
	"compilation.modules[]": "module",
	"compilation.chunks[]": "chunk",
	"compilation.entrypoints[]": "chunkGroup",
	"compilation.namedChunkGroups[]": "chunkGroup",
	"asset.chunks[]": "assetChunk",
	"asset.chunkNames[]": "assetChunkName",
	"module.modules[]": "module",
	"module.reasons[]": "moduleReason"
};

const PREFERED_ORDERS = {
	compilation: [
		"hash",
		"version",
		"time",
		"builtAt",
		"env",
		"publicPath",
		"assets",
		"filteredAssets",
		"entrypoints",
		"namedChunkGroups",
		"chunks",
		"warnings",
		"errors",
		"children",
		"needAdditionalPass"
	],
	asset: ["name", "size", "chunks", "emitted", "isOverSizeLimit", "chunkNames"],
	chunkGroup: [
		"kind!",
		"name",
		"isOverSizeLimit",
		"separator!",
		"assets",
		"childAssets"
	],
	module: [
		"id",
		"name",
		"identifier",
		"sizes",
		"chunks",
		"depth",
		"cacheable",
		"orphan",
		"runtime",
		"optional",
		"built",
		"assets",
		"failed",
		"warnings",
		"errors",
		"providedExports",
		"usedExports",
		"optimizationBailout",
		"reasons",
		"profile",
		"modules"
	]
};

const SIMPLE_ITEMS_JOINER = {
	"asset.chunks": items => items.join(", "),
	"asset.chunkNames": items => items.join(", ")
};

const joinOneLine = items =>
	items
		.map(item => item.content)
		.filter(Boolean)
		.join(" ");

const SIMPLE_ELEMENT_JOINERS = {
	module: (items, { module }) => {
		let id = undefined;
		let hasName = false;
		return items
			.filter(item => {
				switch (item.element) {
					case "id":
						id = item.content;
						if (module.id === module.name) hasName = true;
						break;
					case "name":
						if (hasName) return false;
						if (item.content) hasName = true;
						break;
					case "identifier":
						if (hasName) return false;
						if (item.content) hasName = true;
						break;
				}
				return true;
			})
			.map(item => item.content)
			.filter(Boolean)
			.join(" ");
	},
	chunkGroup: joinOneLine
};

const AVAILABLE_COLORS = {
	bold: "\u001b[1m",
	yellow: "\u001b[1m\u001b[33m",
	red: "\u001b[1m\u001b[31m",
	green: "\u001b[1m\u001b[32m",
	cyan: "\u001b[1m\u001b[36m",
	magenta: "\u001b[1m\u001b[35m"
};

const AVAILABLE_FORMATS = {
	formatChunkId: (id, { yellow }) => `{${yellow(id)}}`,
	formatModuleId: id => `[${id}]`,
	formatFlag: flag => `[${flag}]`,
	formatSize: require("../SizeFormatHelpers").formatSize
};

const createOrder = (array, preferedOrder) => {
	const originalArray = array.slice();
	const set = new Set(array);
	const usedSet = new Set();
	array.length = 0;
	for (const element of preferedOrder) {
		if (element.endsWith("!") || set.has(element)) {
			array.push(element);
			usedSet.add(element);
		}
	}
	for (const element of originalArray) {
		if (!usedSet.has(element)) {
			array.push(element);
		}
	}
	return array;
};

const table = (array, align, splitter) => {
	const rows = array.length;
	const cols = array[0].length;
	const colSizes = new Array(cols);
	for (let col = 0; col < cols; col++) {
		colSizes[col] = 0;
	}
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			const value = `${array[row][col]}`;
			if (value.length > colSizes[col]) {
				colSizes[col] = value.length;
			}
		}
	}
	const lines = [];
	for (let row = 0; row < rows; row++) {
		let str = "";
		for (let col = 0; col < cols; col++) {
			const value = `${array[row][col]}`;
			let l = value.length;
			if (align[col] === "l") {
				str += value;
			}
			for (; l < colSizes[col] && col !== cols - 1; l++) {
				str += " ";
			}
			if (align[col] === "r") {
				str += value;
			}
			if (col + 1 < cols && colSizes[col] !== 0) {
				str += splitter || "  ";
			}
		}
		lines.push(str);
	}
	return lines.join("\n");
};

class DefaultStatsPrinterPlugin {
	/**
	 * @param {Compiler} compiler webpack compiler
	 * @returns {void}
	 */
	apply(compiler) {
		compiler.hooks.compilation.tap("DefaultStatsPrinterPlugin", compilation => {
			compilation.hooks.statsPrinter.tap(
				"DefaultStatsPrinterPlugin",
				(stats, options, context) => {
					// Put colors into context
					stats.hooks.print
						.for("compilation")
						.tap("DefaultStatsPrinterPlugin", (compilation, context) => {
							for (const color of Object.keys(AVAILABLE_COLORS)) {
								let start;
								if (options.colors) {
									if (
										typeof options.colors === "object" &&
										typeof options.colors[color] === "string"
									) {
										start = options.colors[color];
									} else {
										start = AVAILABLE_COLORS[color];
									}
								}
								if (start) {
									context[color] = str => `${start}${str}\u001b[39m\u001b[22m`;
								} else {
									context[color] = str => str;
								}
							}
							for (const format of Object.keys(AVAILABLE_FORMATS)) {
								context[format] = content =>
									AVAILABLE_FORMATS[format](content, context);
							}
						});

					for (const key of Object.keys(SIMPLE_PRINTERS)) {
						stats.hooks.print
							.for(key)
							.tap("DefaultStatsPrinterPlugin", (obj, ctx) =>
								SIMPLE_PRINTERS[key](obj, ctx, stats)
							);
					}

					for (const key of Object.keys(PREFERED_ORDERS)) {
						const preferedOrder = PREFERED_ORDERS[key];
						stats.hooks.sortElements
							.for(key)
							.tap("DefaultStatsPrinterPlugin", (elements, context) => {
								createOrder(elements, preferedOrder);
							});
					}

					for (const key of Object.keys(ITEM_NAMES)) {
						const itemName = ITEM_NAMES[key];
						stats.hooks.getItemName
							.for(key)
							.tap("DefaultStatsPrinterPlugin", () => itemName);
					}

					for (const key of Object.keys(SIMPLE_ITEMS_JOINER)) {
						const joiner = SIMPLE_ITEMS_JOINER[key];
						stats.hooks.printItems
							.for(key)
							.tap("DefaultStatsPrinterPlugin", joiner);
					}

					for (const key of Object.keys(SIMPLE_ELEMENT_JOINERS)) {
						const joiner = SIMPLE_ELEMENT_JOINERS[key];
						stats.hooks.printElements
							.for(key)
							.tap("DefaultStatsPrinterPlugin", joiner);
					}

					// Print assets as table
					stats.hooks.printElements
						.for("compilation.assets[].asset")
						.tap("DefaultStatsPrinterPlugin", (elements, { bold }) => {
							const elementsMap = elements.reduce(
								(obj, e) => ((obj[e.element] = e.content), obj),
								Object.create(null)
							);
							return [
								elementsMap.name || "",
								elementsMap.size || "",
								elementsMap.chunks || "",
								elementsMap.emitted || "",
								elementsMap.isOverSizeLimit || "",
								elementsMap.chunkNames || ""
							];
						});
					stats.hooks.printItems
						.for("compilation.assets")
						.tap("DefaultStatsPrinterPlugin", (items, { bold }) => {
							if (items.length === 0) return undefined;
							let header = ["Asset", "Size", "Chunks", "", "", "Chunk Names"];
							header = header.map(h => (h ? bold(h) : h));
							return table([header].concat(items), "rrrlll");
						});
				}
			);
		});
	}
}
module.exports = DefaultStatsPrinterPlugin;
