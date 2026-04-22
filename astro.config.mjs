// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	integrations: [
		starlight({
			title: '',
			description: 'Atypical Fansub - 专业字幕翻译团队',

			logo: {
				src: './src/assets/favicon.svg',
			},

			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/ZahicAtypical/AtypicalFansub',
				},
			],

			sidebar: [
				{
					label: '作品库',
					link: '/works/',
					translations: { en: 'Works' },
				},
				{
					label: '教程',
					link: '/guides/',
					translations: { en: 'Guides' },
				},
				{
					label: '关于',
					link: '/about/',
					translations: { en: 'About' },
				},
			],

			defaultLocale: 'root',
			locales: {
				root: {
					label: '简体中文',
					lang: 'zh-CN',
				},
				en: {
					label: 'English',
					lang: 'en',
				},
			},

			components: {
				Header: './src/components/Header.astro',
				MobileMenuFooter: './src/components/MobileMenuFooter.astro',
				SiteTitle: './src/components/SiteTitle.astro',
			},

			customCss: ['./src/styles/global.css'],

			editLink: {
				baseUrl: 'https://github.com/ZahicAtypical/AtypicalFansub/edit/main/',
			},

			lastUpdated: true,
		}),
	],
	output: 'static',
});
