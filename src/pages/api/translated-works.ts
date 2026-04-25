import type { APIRoute } from 'astro';
import { WORKS_MAPPING } from '../../lib/worksMapping';

export const GET: APIRoute = async () => {
	try {
		const works = WORKS_MAPPING
			.filter((m) => m.tmdbId != null)
			.map((m) => ({
				title: m.aliases?.[0] || m.tmdbTitle,
				tmdbId: m.tmdbId!,
				slug: m.slug,
				region: m.region,
				status: '已完成' as const,
			}));

		return new Response(
			JSON.stringify({
				success: true,
				works,
				count: works.length,
				lastUpdated: new Date().toISOString()
			}),
			{
				status: 200,
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'public, max-age=300'
				}
			}
		);
	} catch (error) {
		console.error('Error fetching translated works:', error);
		return new Response(
			JSON.stringify({
				success: false,
				error: 'Failed to load translated works'
			}),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json'
				}
			}
		);
	}
};
