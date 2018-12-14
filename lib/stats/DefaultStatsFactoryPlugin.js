/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

const SizeLimitsPlugin = require("../performance/SizeLimitsPlugin");
const {
	compareChunksById,
	compareNumbers,
	compareIds,
	concatComparators,
	compareSelect,
	compareModulesById,
	keepOriginalOrder
} = require("../util/comparators");

/** @typedef {import("../Compiler")} Compiler */
/** @typedef {import("../Compilation")} Compilation */
/** @typedef {import("../Module")} Module */
/** @typedef {import("../Chunk")} Chunk */
/** @typedef {import("../ChunkGroup")} ChunkGroup */
/** @typedef {import("webpack-sources").Source} Source */

/** @template T @typedef {Record<string, (object: Object, data: T, context: { type: string, compilation: Compilation, startTime: number, endTime: number }) => void>} ExtractorsByOption */

/**
 * @typedef {Object} SimpleExtractors
 * @property {ExtractorsByOption<Compilation>} compilation
 * @property {ExtractorsByOption<{ name: string, source: Source }>} asset
 * @property {ExtractorsByOption<{ name: string, chunkGroup: ChunkGroup }>} chunkGroup
 * @property {ExtractorsByOption<Module>} module
 * @property {ExtractorsByOption<Chunk>} chunk
 * @property {ExtractorsByOption<Module>} moduleIssuer
 */

/** @type {SimpleExtractors} */
const SIMPLE_EXTRACTORS = {
	compilation: {
		_: (object, compilation) => {
			if (compilation.needAdditionalPass) {
				object.needAdditionalPass = true;
			}
		},
		hash: (object, compilation) => {
			object.hash = compilation.hash;
		},
		version: object => {
			object.version = require("../../package.json").version;
		},
		timings: (object, compilation, { startTime, endTime }) => {
			object.time = endTime - startTime;
		},
		builtAt: (object, compilation, { endTime }) => {
			object.builtAt = endTime;
		},
		publicPath: (object, compilation) => {
			object.publicPath = compilation.mainTemplate.getPublicPath({
				hash: compilation.hash
			});
		},
		outputPath: (object, compilation) => {
			object.outputPath = compilation.mainTemplate.outputOptions.path;
		},
		assets: (object, compilation, context, options, factory) => {
			const { type } = context;
			const array = Object.keys(compilation.assets).map(name => {
				const source = compilation.assets[name];
				return {
					name,
					source
				};
			});
			object.assets = factory.create(`${type}.assets`, array, context);
			object.filteredAssets = array.length - object.assets.length;
		},
		chunks: (object, compilation, context, options, factory) => {
			const { type } = context;
			object.chunks = factory.create(
				`${type}.chunks`,
				Array.from(compilation.chunks),
				context
			);
		},
		modules: (object, compilation, context, options, factory) => {
			const { type } = context;
			const array = Array.from(compilation.modules);
			object.modules = factory.create(`${type}.modules`, array, context);
			object.filteredModules = array.length - object.modules.length;
		},
		entrypoints: (object, compilation, context, options, factory) => {
			const { type } = context;
			const array = Array.from(compilation.entrypoints, ([key, value]) => ({
				name: key,
				chunkGroup: value
			}));
			object.entrypoints = factory.create(
				`${type}.entrypoints`,
				array,
				context
			);
		},
		chunkGroups: (object, compilation, context, options, factory) => {
			const { type } = context;
			const array = Array.from(
				compilation.namedChunkGroups,
				([key, value]) => ({
					name: key,
					chunkGroup: value
				})
			);
			object.entrypoints = factory.create(
				`${type}.entrypoints`,
				array,
				context
			);
		}
	},
	asset: {
		_: (object, asset, { compilation }) => {
			object.name = asset.name;
			object.size = asset.source.size();
			const chunks = Array.from(compilation.chunks).filter(chunk =>
				chunk.files.includes(asset.name)
			);
			object.chunks = Array.from(
				chunks.reduce((ids, chunk) => {
					for (const id of chunk.ids) {
						ids.add(id);
					}
					return ids;
				}, new Set())
			).sort(compareIds);
			object.chunkNames = Array.from(
				chunks.reduce((names, chunk) => {
					if (chunk.name) {
						names.add(chunk.name);
					}
					return names;
				}, new Set())
			).sort(compareIds);
			object.emitted = compilation.emittedAssets.has(asset.source);
		},
		performance: (object, asset) => {
			object.isOverSizeLimit = SizeLimitsPlugin.isOverSizeLimit(asset.source);
		}
	},
	chunkGroup: {
		_: (
			object,
			{ name, chunkGroup },
			{ compilation: { moduleGraph, chunkGraph } }
		) => {
			const children = chunkGroup.getChildrenByOrders(moduleGraph, chunkGraph);
			Object.assign(object, {
				name,
				chunks: chunkGroup.chunks.map(c => c.id),
				assets: chunkGroup.chunks.reduce(
					(array, c) => array.concat(c.files || []),
					/** @type {string[]} */ ([])
				),
				children: Object.keys(children).reduce((obj, key) => {
					const groups = children[key];
					obj[key] = groups.map(group => ({
						name: group.name,
						chunks: group.chunks.map(c => c.id),
						assets: group.chunks.reduce(
							(array, c) => array.concat(c.files || []),
							/** @type {string[]} */ ([])
						)
					}));
					return obj;
				}, /** @type {Record<string, {name: string, chunks: (string|number)[], assets: string[]}[]>} */ Object.create(null)),
				childAssets: Object.keys(children).reduce((obj, key) => {
					const groups = children[key];
					obj[key] = Array.from(
						groups.reduce((set, group) => {
							for (const chunk of group.chunks) {
								for (const asset of chunk.files) {
									set.add(asset);
								}
							}
							return set;
						}, /** @type {Set<string>} */ (new Set()))
					);
					return obj;
				}, Object.create(null))
			});
		}
	},
	module: {
		_: (object, module, context, { requestShortener }, factory) => {
			const { compilation, type } = context;
			const { chunkGraph, moduleGraph } = compilation;
			const path = [];
			const issuer = moduleGraph.getIssuer(module);
			let current = issuer;
			while (current) {
				path.push(current);
				current = moduleGraph.getIssuer(current);
			}
			path.reverse();
			Object.assign(object, {
				id: chunkGraph.getModuleId(module),
				identifier: module.identifier(),
				name: module.readableIdentifier(requestShortener),
				index: moduleGraph.getPreOrderIndex(module),
				preOrderIndex: moduleGraph.getPreOrderIndex(module),
				index2: moduleGraph.getPostOrderIndex(module),
				postOrderIndex: moduleGraph.getPostOrderIndex(module),
				size: module.size(),
				sizes: Array.from(module.getSourceTypes()).reduce((obj, type) => {
					obj[type] = module.size(type);
					return obj;
				}, {}),
				cacheable: module.buildInfo.cacheable,
				built: compilation.builtModules.has(module),
				optional: module.isOptional(moduleGraph),
				runtime: module.type === "runtime",
				chunks: Array.from(
					chunkGraph.getOrderedModuleChunksIterable(module, compareChunksById),
					chunk => chunk.id
				),
				issuer: issuer && issuer.identifier(),
				issuerId: issuer && chunkGraph.getModuleId(issuer),
				issuerName: issuer && issuer.readableIdentifier(requestShortener),
				issuerPath:
					issuer && factory.create(`${type}.issuerPath`, path, context),
				profile: factory.create(
					`${type}.profile`,
					moduleGraph.getProfile(module),
					context
				),
				failed: !!module.error,
				errors: module.errors ? module.errors.length : 0,
				warnings: module.warnings ? module.warnings.length : 0
			});
		},
		orphanModules: (object, module, { compilation, type }) => {
			if (!type.endsWith("module.modules[].module")) {
				object.orphan =
					compilation.chunkGraph.getNumberOfModuleChunks(module) === 0;
			}
		},
		moduleAssets: (object, module) => {
			object.assets = module.buildInfo.assets
				? Object.keys(module.buildInfo.assets)
				: [];
		},
		reasons: (object, module, context, options, factory) => {
			const {
				type,
				compilation: { moduleGraph }
			} = context;
			object.reasons = factory.create(
				`${type}.reasons`,
				moduleGraph.getIncomingConnections(module),
				context
			);
		},
		usedExports: (object, module, { compilation: { moduleGraph } }) => {
			const usedExports = moduleGraph.getUsedExports(module);
			if (usedExports === null) {
				object.usedExports = null;
			} else if (typeof usedExports === "boolean") {
				object.usedExports = usedExports;
			} else {
				object.usedExports = Array.from(usedExports);
			}
		},
		providedExports: (object, module) => {
			object.providedExports = Array.isArray(module.buildMeta.providedExports)
				? module.buildMeta.providedExports
				: null;
		},
		optimizationBailout: (
			object,
			module,
			{ compilation: { moduleGraph } },
			{ requestShortener }
		) => {
			object.optimizationBailout = moduleGraph
				.getOptimizationBailout(module)
				.map(item => {
					if (typeof item === "function") return item(requestShortener);
					return item;
				});
		},
		depth: (object, module, { compilation: { moduleGraph } }) => {
			object.depth = moduleGraph.getDepth(module);
		},
		nestedModules: (object, module, context, options, factory) => {
			const { type } = context;
			if (module.modules) {
				const modules = module.modules;
				object.modules = factory.create(`${type}.modules`, modules, context);
				object.filteredModules = modules.length - object.modules.length;
			}
		},
		source: (object, module) => {
			const originalSource = module.originalSource();
			if (originalSource) {
				object.source = originalSource.source();
			}
		}
	},
	moduleIssuer: {
		_: (object, module, context, { requestShortener }, factory) => {
			const { compilation, type } = context;
			const { chunkGraph, moduleGraph } = compilation;
			Object.assign(object, {
				id: chunkGraph.getModuleId(module),
				identifier: module.identifier(),
				name: module.readableIdentifier(requestShortener),
				profile: factory.create(
					`${type}.profile`,
					moduleGraph.getProfile(module),
					context
				)
			});
		}
	},
	chunk: {
		chunkModules: (object, chunk, context, options, factory) => {
			const {
				type,
				compilation: { chunkGraph }
			} = context;
			const array = chunkGraph.getChunkModules(chunk);
			object.modules = factory.create(`${type}.modules`, array, context);
			object.filteredModules = array.length - object.modules.length;
		},
		chunkRootModules: (object, chunk, context, options, factory) => {
			const {
				type,
				compilation: { chunkGraph }
			} = context;
			const array = chunkGraph.getChunkRootModules(chunk);
			object.rootModules = factory.create(
				`${type}.rootModules`,
				array,
				context
			);
			object.filteredRootModules = array.length - object.rootModules.length;
			object.nonRootModules =
				chunkGraph.getNumberOfChunkModules(chunk) - array.length;
		}
	}
};

const iterateConfig = (config, options, fn) => {
	for (const hookFor of Object.keys(config)) {
		const subConfig = config[hookFor];
		for (const option of Object.keys(subConfig)) {
			if (option === "_" || options[option]) {
				fn(hookFor, subConfig[option]);
			}
		}
	}
};

const ITEM_NAMES = {
	"compilation.children[]": "compilation",
	"compilation.modules[]": "module",
	"compilation.entrypoints[]": "chunkGroup",
	"compilation.namedChunkGroups[]": "chunkGroup",
	"chunk.modules[]": "module",
	"chunk.rootModules[]": "module",
	"compilation.chunks[]": "chunk",
	"compilation.assets[]": "asset",
	"module.issuerPath[]": "moduleIssuer"
};

const mergeToObject = items => {
	const obj = Object.create(null);
	for (const item of items) {
		obj[item.name] = item;
	}
	return obj;
};

const MERGER = {
	"compilation.entrypoints": mergeToObject,
	"compilation.namedChunkGroups": mergeToObject
};

class DefaultStatsFactoryPlugin {
	/**
	 * @param {Compiler} compiler webpack compiler
	 * @returns {void}
	 */
	apply(compiler) {
		compiler.hooks.compilation.tap("DefaultStatsFactoryPlugin", compilation => {
			compilation.hooks.statsFactory.tap(
				"DefaultStatsFactoryPlugin",
				(stats, options, context) => {
					const { chunkGraph } = compilation;
					iterateConfig(SIMPLE_EXTRACTORS, options, (hookFor, fn) => {
						stats.hooks.extract
							.for(hookFor)
							.tap("DefaultStatsFactoryPlugin", (obj, data, ctx) =>
								fn(obj, data, ctx, options, stats)
							);
					});
					for (const key of Object.keys(ITEM_NAMES)) {
						const itemName = ITEM_NAMES[key];
						stats.hooks.getItemName
							.for(key)
							.tap("DefaultStatsFactoryPlugin", () => itemName);
					}
					for (const key of Object.keys(MERGER)) {
						const merger = MERGER[key];
						stats.hooks.merge.for(key).tap("DefaultStatsFactoryPlugin", merger);
					}
					if (options.children) {
						stats.hooks.extract
							.for("compilation")
							.tap("DefaultStatsFactoryPlugin", (object, comp, context) => {
								const { type } = context;
								object.children = comp.children.map((child, idx) => {
									return stats.create(
										`${type}.children`,
										comp.children,
										context
									);
								});
							});
						if (Array.isArray(options.children)) {
							stats.hooks.getItemFactory
								.for("compilation.children[].compilation")
								.tap("DefaultStatsFactoryPlugin", (comp, { _index: idx }) => {
									if (idx < options.children.length) {
										return compilation.createStatsFactory(
											compilation.createStatsOptions(
												options.children[idx],
												context
											)
										);
									}
								});
						} else if (options.children !== true) {
							const childFactory = compilation.createStatsFactory(
								compilation.createStatsOptions(options.children, context)
							);
							stats.hooks.getItemFactory
								.for("compilation.children[].compilation")
								.tap("DefaultStatsFactoryPlugin", () => {
									return childFactory;
								});
						}
					}
				}
			);
		});
	}
}
module.exports = DefaultStatsFactoryPlugin;
