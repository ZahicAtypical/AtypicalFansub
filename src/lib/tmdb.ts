/**
 * TMDB API 集成模块
 * 提供欧美剧集海报数据获取、缓存、错误重试等功能
 */

// ==================== 类型定义 ====================

export interface Movie {
	id: number;
	title: string;
	originalTitle: string;
	posterPath: string | null;
	backdropPath: string | null;
	releaseDate: string;
	voteAverage: number;
	overview: string;
	genreIds: number[];
}

export interface TMDBResponse {
	page: number;
	results: Array<{
		id: number;
		title: string;
		original_title: string;
		poster_path: string | null;
		backdrop_path: string | null;
		release_date: string;
		vote_average: number;
		overview: string;
		genre_ids: number[];
		origin_country: string[];
		original_language: string;
	}>;
	total_pages: number;
	total_results: number;
}

export interface TVShow {
	id: number;
	name: string;
	originalName: string;
	posterPath: string | null;
	backdropPath: string | null;
	firstAirDate: string;
	voteAverage: number;
	overview: string;
	genreIds: number[];
	originCountry: string[];
	originalLanguage: string;
}

export interface TVResponse {
	page: number;
	results: Array<{
		id: number;
		name: string;
		original_name: string;
		poster_path: string | null;
		backdrop_path: string | null;
		first_air_date: string;
		vote_average: number;
		overview: string;
		genre_ids: number[];
		origin_country: string[];
		original_language: string;
	}>;
	total_pages: number;
	total_results: number;
}

export interface CacheEntry<T> {
	data: T;
	timestamp: number;
}

// ==================== 欧美地区配置 ====================

const WESTERN_COUNTRIES = new Set([
	'US', 'GB', 'CA', 'AU', 'NZ', 'IE',
	'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'CH', 'AT',
	'SE', 'NO', 'DK', 'FI', 'PT', 'PL', 'CZ',
]);

const WESTERN_LANGUAGES = new Set([
	'en', 'de', 'fr', 'es', 'it', 'nl', 'pt',
	'sv', 'no', 'da', 'fi', 'pl', 'cs',
]);

const EXCLUDED_COUNTRIES = new Set(['CN', 'KR', 'JP', 'IN', 'TH', 'PH', 'TR']);

const EXCLUDED_LANGUAGES = new Set(['zh', 'ko', 'ja', 'hi', 'th', 'tl', 'tr']);

// ==================== TMDB 配置 ====================

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
const API_KEY = typeof import.meta !== 'undefined' && import.meta.env
	? (import.meta.env.PUBLIC_TMDB_API_KEY || import.meta.env.TMDB_API_KEY || '')
	: '';

const REQUEST_CONFIG = {
	maxRetries: 3,
	retryDelay: 1000,
	requestsPerSecond: 4,
};

const CACHE_CONFIG = {
	memoryTTL: 5 * 60 * 1000,
	localStorageTTL: 30 * 60 * 1000,
	localStorageKey: 'tmdb_cache',
};

const POSTER_WALL_CACHE_CONFIG = {
	localStorageKey: 'poster_wall_cache',
	version: 3,
	maxAge: 7 * 24 * 60 * 60 * 1000,
};

export interface PosterWallCache {
	version: number;
	shows: TVShow[];
	posterUrls: Record<number, string | null>;
	timestamp: number;
}

// ==================== 图片尺寸配置 ====================

export type PosterSize = 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original';

function getOptimalPosterSize(): PosterSize {
	const dpr = window.devicePixelRatio || 1;
	const width = window.innerWidth;

	if (width >= 1200) {
		return dpr >= 2 ? 'w500' : 'w342';
	} else if (width >= 768) {
		return dpr >= 2 ? 'w342' : 'w185';
	} else {
		return dpr >= 2 ? 'w185' : 'w154';
	}
}

export function getPosterUrl(path: string | null, size?: PosterSize): string | null {
	if (!path) return null;
	const posterSize = size || getOptimalPosterSize();
	return `${TMDB_IMAGE_BASE_URL}/${posterSize}${path}`;
}

// ==================== 内存缓存 ====================

class MemoryCache {
	private cache = new Map<string, CacheEntry<unknown>>();

	get<T>(key: string): T | null {
		const entry = this.cache.get(key);
		if (!entry) return null;
		if (Date.now() - entry.timestamp > CACHE_CONFIG.memoryTTL) {
			this.cache.delete(key);
			return null;
		}
		return entry.data as T;
	}

	set<T>(key: string, data: T): void {
		this.cache.set(key, { data, timestamp: Date.now() });
	}

	clear(): void {
		this.cache.clear();
	}
}

const memoryCache = new MemoryCache();

// ==================== LocalStorage 缓存 ====================

class LocalStorageCache {
	get<T>(key: string): T | null {
		try {
			const raw = localStorage.getItem(`${CACHE_CONFIG.localStorageKey}_${key}`);
			if (!raw) return null;
			const entry: CacheEntry<T> = JSON.parse(raw);
			if (Date.now() - entry.timestamp > CACHE_CONFIG.localStorageTTL) {
				localStorage.removeItem(`${CACHE_CONFIG.localStorageKey}_${key}`);
				return null;
			}
			return entry.data;
		} catch {
			return null;
		}
	}

	set<T>(key: string, data: T): void {
		try {
			const entry: CacheEntry<T> = { data, timestamp: Date.now() };
			localStorage.setItem(`${CACHE_CONFIG.localStorageKey}_${key}`, JSON.stringify(entry));
		} catch {
		}
	}

	clear(): void {
		try {
			const keysToRemove: string[] = [];
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key?.startsWith(CACHE_CONFIG.localStorageKey)) {
					keysToRemove.push(key);
				}
			}
			keysToRemove.forEach((k) => localStorage.removeItem(k));
		} catch {
		}
	}
}

const localStorageCache = new LocalStorageCache();

// ==================== 请求频率控制 ====================

class RateLimiter {
	private lastRequestTime = 0;
	private queue: Array<() => void> = [];
	private processing = false;

	async acquire(): Promise<void> {
		return new Promise((resolve) => {
			this.queue.push(resolve);
			this.processQueue();
		});
	}

	private async processQueue(): Promise<void> {
		if (this.processing || this.queue.length === 0) return;
		this.processing = true;

		const now = Date.now();
		const minInterval = 1000 / REQUEST_CONFIG.requestsPerSecond;
		const waitTime = Math.max(0, minInterval - (now - this.lastRequestTime));

		if (waitTime > 0) {
			await new Promise((r) => setTimeout(r, waitTime));
		}

		this.lastRequestTime = Date.now();
		const next = this.queue.shift();
		next?.();

		this.processing = false;
		if (this.queue.length > 0) {
			this.processQueue();
		}
	}
}

const rateLimiter = new RateLimiter();

// ==================== 核心 API 请求 ====================

const activeControllers = new Set<AbortController>();

function createAbortController(): AbortController {
	const controller = new AbortController();
	activeControllers.add(controller);
	controller.signal.addEventListener('abort', () => {
		activeControllers.delete(controller);
	});
	return controller;
}

export function abortAllRequests(): void {
	activeControllers.forEach((controller) => controller.abort());
	activeControllers.clear();
}

async function fetchWithRetry(
	url: string,
	options: RequestInit = {},
	retries = REQUEST_CONFIG.maxRetries
): Promise<Response> {
	try {
		await rateLimiter.acquire();
		const response = await fetch(url, {
			...options,
			headers: {
				'Content-Type': 'application/json',
				...options.headers,
			},
		});

		if (!response.ok) {
			if (response.status === 429 && retries > 0) {
				await new Promise((r) => setTimeout(r, REQUEST_CONFIG.retryDelay * (REQUEST_CONFIG.maxRetries - retries + 1)));
				return fetchWithRetry(url, options, retries - 1);
			}
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		return response;
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') {
			throw error;
		}
		if (retries > 0) {
			await new Promise((r) => setTimeout(r, REQUEST_CONFIG.retryDelay));
			return fetchWithRetry(url, options, retries - 1);
		}
		throw error;
	}
}

// ==================== 数据转换 ====================

function transformMovie(raw: TMDBResponse['results'][0]): Movie {
	return {
		id: raw.id,
		title: raw.title,
		originalTitle: raw.original_title,
		posterPath: raw.poster_path,
		backdropPath: raw.backdrop_path,
		releaseDate: raw.release_date,
		voteAverage: raw.vote_average,
		overview: raw.overview,
		genreIds: raw.genre_ids,
	};
}

function transformTVShow(raw: TVResponse['results'][0]): TVShow {
	return {
		id: raw.id,
		name: raw.name,
		originalName: raw.original_name,
		posterPath: raw.poster_path,
		backdropPath: raw.backdrop_path,
		firstAirDate: raw.first_air_date,
		voteAverage: raw.vote_average,
		overview: raw.overview,
		genreIds: raw.genre_ids,
		originCountry: raw.origin_country || [],
		originalLanguage: raw.original_language || '',
	};
}

// ==================== 欧美剧集筛选 ====================

export function isWesternShow(show: TVShow): boolean {
	const hasWesternCountry = show.originCountry?.some((c) => WESTERN_COUNTRIES.has(c.toUpperCase()));
	const hasWesternLanguage = WESTERN_LANGUAGES.has(show.originalLanguage?.toLowerCase());
	const hasExcludedCountry = show.originCountry?.some((c) => EXCLUDED_COUNTRIES.has(c.toUpperCase()));
	const hasExcludedLanguage = EXCLUDED_LANGUAGES.has(show.originalLanguage?.toLowerCase());

	if (hasExcludedCountry || hasExcludedLanguage) return false;
	if (hasWesternCountry || hasWesternLanguage) return true;

	return false;
}

export function filterToWesternShows(shows: TVShow[]): TVShow[] {
	return shows.filter(isWesternShow);
}

export function filterOutChineseContent(shows: TVShow[]): TVShow[] {
	return shows.filter((show) => {
		const isChineseCountry = show.originCountry?.some((country) =>
			country.toUpperCase() === 'CN'
		);
		const isChineseLanguage = show.originalLanguage?.toLowerCase().startsWith('zh');
		return !isChineseCountry && !isChineseLanguage;
	});
}

// ==================== 公开 API ====================

export async function getPopularMovies(page = 1): Promise<Movie[]> {
	const cacheKey = `popular_${page}`;

	const memCached = memoryCache.get<Movie[]>(cacheKey);
	if (memCached) return memCached;

	const lsCached = localStorageCache.get<Movie[]>(cacheKey);
	if (lsCached) {
		memoryCache.set(cacheKey, lsCached);
		return lsCached;
	}

	if (!API_KEY) {
		console.warn('TMDB API key not configured');
		return [];
	}

	const url = `${TMDB_BASE_URL}/movie/popular?api_key=${API_KEY}&language=zh-CN&page=${page}`;
	const response = await fetchWithRetry(url);
	const data: TMDBResponse = await response.json();
	const movies = data.results.map(transformMovie);

	memoryCache.set(cacheKey, movies);
	localStorageCache.set(cacheKey, movies);

	return movies;
}

export async function getPopularTVShows(page = 1): Promise<TVShow[]> {
	const cacheKey = `tv_popular_${page}`;

	const memCached = memoryCache.get<TVShow[]>(cacheKey);
	if (memCached) return memCached;

	const lsCached = localStorageCache.get<TVShow[]>(cacheKey);
	if (lsCached) {
		memoryCache.set(cacheKey, lsCached);
		return lsCached;
	}

	if (!API_KEY) {
		console.warn('TMDB API key not configured');
		return [];
	}

	const url = `${TMDB_BASE_URL}/tv/popular?api_key=${API_KEY}&language=zh-CN&page=${page}`;
	const response = await fetchWithRetry(url);
	const data: TVResponse = await response.json();

	let shows = data.results.map(transformTVShow);
	shows = filterOutChineseContent(shows);

	memoryCache.set(cacheKey, shows);
	localStorageCache.set(cacheKey, shows);

	return shows;
}

async function getWesternTVShowsByPage(page = 1): Promise<TVShow[]> {
	const cacheKey = `tv_western_${page}`;

	const memCached = memoryCache.get<TVShow[]>(cacheKey);
	if (memCached) return memCached;

	const lsCached = localStorageCache.get<TVShow[]>(cacheKey);
	if (lsCached) {
		memoryCache.set(cacheKey, lsCached);
		return lsCached;
	}

	if (!API_KEY) {
		console.warn('TMDB API key not configured');
		return [];
	}

	const controller = createAbortController();
	try {
		const url = `${TMDB_BASE_URL}/tv/popular?api_key=${API_KEY}&language=zh-CN&page=${page}&with_original_language=en`;
		const response = await fetchWithRetry(url, { signal: controller.signal });
		const data: TVResponse = await response.json();

		let shows = data.results.map(transformTVShow);
		shows = filterToWesternShows(shows);

		memoryCache.set(cacheKey, shows);
		localStorageCache.set(cacheKey, shows);

		return shows;
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') return [];
		throw error;
	} finally {
		activeControllers.delete(controller);
	}
}

function shuffleArray<T>(array: T[]): T[] {
	const shuffled = [...array];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}

export async function getRandomPopularTVShows(count = 60, maxPages = 5): Promise<TVShow[]> {
	if (!API_KEY) {
		console.warn('TMDB API key not configured');
		return [];
	}

	const allShows: TVShow[] = [];
	const pagePromises: Promise<void>[] = [];

	for (let page = 1; page <= maxPages; page++) {
		pagePromises.push(
			getWesternTVShowsByPage(page).then((shows) => {
				allShows.push(...shows);
			}).catch(() => {
			})
		);
	}

	await Promise.all(pagePromises);

	if (allShows.length === 0) {
		return [];
	}

	const uniqueShows = Array.from(
		new Map(allShows.map((show) => [show.id, show])).values()
	);

	const shuffled = shuffleArray(uniqueShows);
	return shuffled.slice(0, count);
}

export async function getTVShowPosters(tvId: number): Promise<string[]> {
	const cacheKey = `tv_posters_${tvId}`;

	const memCached = memoryCache.get<string[]>(cacheKey);
	if (memCached) return memCached;

	if (!API_KEY) {
		return [];
	}

	try {
		const url = `${TMDB_BASE_URL}/tv/${tvId}/images?api_key=${API_KEY}&include_image_language=zh,null`;
		const response = await fetchWithRetry(url);
		const data = await response.json();

		const posters = (data.posters || [])
			.filter((p: { iso_639_1: string | null }) => !p.iso_639_1 || p.iso_639_1 === 'zh' || p.iso_639_1 === 'en')
			.map((p: { file_path: string }) => p.file_path);

		memoryCache.set(cacheKey, posters);
		return posters;
	} catch {
		return [];
	}
}

export async function getRandomPosterUrl(tvId: number, defaultPath: string | null): Promise<string | null> {
	const posters = await getTVShowPosters(tvId);

	if (posters.length > 0) {
		const zhPosters = posters.filter((_, i, arr) => {
			const poster = arr[i];
			return poster;
		});
		const randomPoster = zhPosters[Math.floor(Math.random() * zhPosters.length)];
		return getPosterUrl(randomPoster);
	}

	return getPosterUrl(defaultPath);
}

export async function searchMovies(query: string, page = 1): Promise<Movie[]> {
	const cacheKey = `search_${query}_${page}`;

	const memCached = memoryCache.get<Movie[]>(cacheKey);
	if (memCached) return memCached;

	if (!API_KEY) {
		console.warn('TMDB API key not configured');
		return [];
	}

	const url = `${TMDB_BASE_URL}/search/movie?api_key=${API_KEY}&language=zh-CN&query=${encodeURIComponent(query)}&page=${page}`;
	const response = await fetchWithRetry(url);
	const data: TMDBResponse = await response.json();
	const movies = data.results.map(transformMovie);

	memoryCache.set(cacheKey, movies);

	return movies;
}

export async function getMovieDetails(movieId: number): Promise<Movie | null> {
	const cacheKey = `movie_${movieId}`;

	const memCached = memoryCache.get<Movie>(cacheKey);
	if (memCached) return memCached;

	const lsCached = localStorageCache.get<Movie>(cacheKey);
	if (lsCached) {
		memoryCache.set(cacheKey, lsCached);
		return lsCached;
	}

	if (!API_KEY) {
		console.warn('TMDB API key not configured');
		return null;
	}

	const url = `${TMDB_BASE_URL}/movie/${movieId}?api_key=${API_KEY}&language=zh-CN`;
	const response = await fetchWithRetry(url);
	const raw = await response.json();
	const movie = transformMovie(raw);

	memoryCache.set(cacheKey, movie);
	localStorageCache.set(cacheKey, movie);

	return movie;
}

// ==================== 海报墙持久化缓存 ====================

export const posterWallCache = {
	get(): PosterWallCache | null {
		try {
			const raw = localStorage.getItem(POSTER_WALL_CACHE_CONFIG.localStorageKey);
			if (!raw) return null;
			const cache: PosterWallCache = JSON.parse(raw);

			if (cache.version !== POSTER_WALL_CACHE_CONFIG.version) {
				localStorage.removeItem(POSTER_WALL_CACHE_CONFIG.localStorageKey);
				return null;
			}

			if (Date.now() - cache.timestamp > POSTER_WALL_CACHE_CONFIG.maxAge) {
				localStorage.removeItem(POSTER_WALL_CACHE_CONFIG.localStorageKey);
				return null;
			}

			return cache;
		} catch {
			return null;
		}
	},

	set(shows: TVShow[], posterUrls: Record<number, string | null>): void {
		try {
			const cache: PosterWallCache = {
				version: POSTER_WALL_CACHE_CONFIG.version,
				shows,
				posterUrls,
				timestamp: Date.now(),
			};
			localStorage.setItem(POSTER_WALL_CACHE_CONFIG.localStorageKey, JSON.stringify(cache));
		} catch {
		}
	},

	clear(): void {
		localStorage.removeItem(POSTER_WALL_CACHE_CONFIG.localStorageKey);
	},
};

export function clearAllCaches(): void {
	memoryCache.clear();
	localStorageCache.clear();
	posterWallCache.clear();
}

// ==================== 图片预加载 ====================

export function preloadImage(src: string, timeout = 8000): Promise<void> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		let resolved = false;

		const timer = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				reject(new Error('Image load timeout'));
			}
		}, timeout);

		img.onload = () => {
			if (!resolved) {
				resolved = true;
				clearTimeout(timer);
				resolve();
			}
		};

		img.onerror = () => {
			if (!resolved) {
				resolved = true;
				clearTimeout(timer);
				reject(new Error('Image load error'));
			}
		};

		img.src = src;
	});
}

export async function preloadImages(srcs: string[], concurrency = 5, timeout = 8000): Promise<void> {
	const executing = new Set<Promise<void>>();

	for (const src of srcs) {
		const promise = preloadImage(src, timeout).catch(() => {
		});
		executing.add(promise);

		if (executing.size >= concurrency) {
			await Promise.race(executing);
		}

		promise.finally(() => executing.delete(promise));
	}

	await Promise.all(executing);
}

export function getLowQualityPosterUrl(path: string | null): string | null {
	if (!path) return null;
	return `${TMDB_IMAGE_BASE_URL}/w92${path}`;
}

export function getPosterSrcSet(path: string | null): string | null {
	if (!path) return null;
	const sizes: PosterSize[] = ['w154', 'w342', 'w500'];
	return sizes.map((size) => `${TMDB_IMAGE_BASE_URL}/${size}${path} ${parseInt(size.slice(1))}w`).join(', ');
}

export async function fetchAdditionalTVShows(
	existingIds: Set<number>,
	count: number,
	startPage = 6
): Promise<TVShow[]> {
	if (!API_KEY || count <= 0) return [];

	const maxPagesToFetch = Math.ceil(count / 15) + 1;
	const allNewShows: TVShow[] = [];
	const pagePromises: Promise<void>[] = [];

	for (let page = startPage; page < startPage + maxPagesToFetch; page++) {
		pagePromises.push(
			getWesternTVShowsByPage(page).then((shows) => {
				const filtered = shows.filter((s) => !existingIds.has(s.id) && s.posterPath);
				allNewShows.push(...filtered);
			}).catch(() => {
			})
		);
	}

	await Promise.all(pagePromises);

	const uniqueNew = Array.from(
		new Map(allNewShows.map((show) => [show.id, show])).values()
	);

	return shuffleArray(uniqueNew).slice(0, count);
}
