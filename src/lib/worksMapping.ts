/**
 * 作品库名称映射模块
 * 将 TMDB 剧集标题映射到作品库中的页面 slug
 * 支持按地区分类（欧美、日本等）
 */

export type WorkRegion = 'western' | 'japanese' | 'korean' | 'other';

export interface WorkMapping {
	tmdbTitle: string;
	slug: string;
	region: WorkRegion;
	tmdbId?: number;
	aliases?: string[];
}

export const WORKS_MAPPING: WorkMapping[] = [
	// 欧美剧集
	{ tmdbTitle: 'The Neighborhood', slug: 'works/the-neighborhood', region: 'western', tmdbId: 228731, aliases: ['东邻西舍'] },
	{ tmdbTitle: 'Things You Should Have Done', slug: 'works/things-you-should-have-done', region: 'western', tmdbId: 208864, aliases: ['你本该做的事'] },
	{ tmdbTitle: 'Young Rock', slug: 'works/young-rock', region: 'western', tmdbId: 162889, aliases: ['年少轻狂'] },
	{ tmdbTitle: 'Detectorists', slug: 'works/detectorists', region: 'western', tmdbId: 213753, aliases: ['寻宝搭档'] },

	// 日本动画
	{ tmdbTitle: 'Delicious in Dungeon', slug: 'works/dungeon-meshi', region: 'japanese', aliases: ['迷宫饭', 'ダンジョン飯'] },
	{ tmdbTitle: 'Oshi no Ko', slug: 'works/oshi-no-ko', region: 'japanese', aliases: ['我推的孩子', '推しの子'] },
	{ tmdbTitle: 'Frieren: Beyond Journey\'s End', slug: 'works/sousou-no-frieren', region: 'japanese', aliases: ['葬送的芙莉莲', '葬送のフリーレン'] },

	// 日剧
	{ tmdbTitle: 'Brush Up Life', slug: 'works/restart-life', region: 'japanese', aliases: ['重启人生', 'ブラッシュアップライフ'] },
	{ tmdbTitle: 'We Married as a Job!', slug: 'works/escape-shame', region: 'japanese', aliases: ['逃避虽可耻但有用', '逃げるは恥だが役に立つ'] },
];

const MIN_FUZZY_LENGTH = 3;

export function findWorkSlug(title: string): string | null {
	const lowerTitle = title.toLowerCase().trim();

	for (const mapping of WORKS_MAPPING) {
		if (mapping.tmdbTitle.toLowerCase() === lowerTitle) {
			return mapping.slug;
		}

		if (mapping.aliases?.some((alias) => alias.toLowerCase() === lowerTitle)) {
			return mapping.slug;
		}
	}

	return null;
}

export function findWorkByTmdbId(tmdbId: number): WorkMapping | null {
	return WORKS_MAPPING.find((m) => m.tmdbId === tmdbId) || null;
}

export function fuzzyFindWorkSlug(title: string): string | null {
	const lowerTitle = title.toLowerCase().trim();

	const exactMatch = findWorkSlug(title);
	if (exactMatch) return exactMatch;

	if (lowerTitle.length < MIN_FUZZY_LENGTH) return null;

	for (const mapping of WORKS_MAPPING) {
		const lowerMappingTitle = mapping.tmdbTitle.toLowerCase();
		if (lowerMappingTitle.length >= MIN_FUZZY_LENGTH &&
			(lowerMappingTitle.includes(lowerTitle) || lowerTitle.includes(lowerMappingTitle))) {
			return mapping.slug;
		}

		if (mapping.aliases?.some((alias) => {
			const lowerAlias = alias.toLowerCase();
			return lowerAlias.length >= MIN_FUZZY_LENGTH &&
				(lowerAlias.includes(lowerTitle) || lowerTitle.includes(lowerAlias));
		})) {
			return mapping.slug;
		}
	}

	return null;
}

export function getMappedWorkTitles(): string[] {
	return WORKS_MAPPING.map((m) => m.tmdbTitle);
}

export function getWorksByRegion(region: WorkRegion): WorkMapping[] {
	return WORKS_MAPPING.filter((m) => m.region === region);
}

export function getWesternWorks(): WorkMapping[] {
	return getWorksByRegion('western');
}

export function isTranslatedWorkByTmdbId(tmdbId: number): boolean {
	return WORKS_MAPPING.some((m) => m.tmdbId === tmdbId);
}

export function getTranslatedTmdbIds(): Set<number> {
	return new Set(WORKS_MAPPING.filter((m) => m.tmdbId != null).map((m) => m.tmdbId!));
}
