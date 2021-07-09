const lightCodeTheme = require('prism-react-renderer/themes/github')
const darkCodeTheme = require('prism-react-renderer/themes/dracula')

/** @type {import('@docusaurus/types').DocusaurusConfig} */
module.exports = {
	title: 'Sofie Automation',
	tagline: 'Dinosaurs are cool',
	url: 'https://julusian.github.io',
	baseUrl: '/tv-automation-server-core/',
	onBrokenLinks: 'warn',
	onBrokenMarkdownLinks: 'warn',
	favicon: 'img/favicon.ico',
	organizationName: 'nrkno', // Usually your GitHub org/user name.
	projectName: 'tv-automation-server-core', // Usually your repo name.
	themeConfig: {
		navbar: {
			title: 'Sofie Automation',
			logo: {
				alt: 'Sofie Logo',
				src: 'img/sofie-logo.svg',
			},
			items: [
				{ to: '/docs/getting-started/intro', label: 'Getting Started', position: 'left' },
				{ to: '/docs/main/intro', label: 'Docs', position: 'left' },
				{ to: '/docs/for-developers/intro', label: 'For Developers', position: 'left' },
				{ to: '/typedoc', label: 'API Docs' },
				{ to: '/releases', label: 'Releases', position: 'left' },
				// {to: '/blog', label: 'Blog', position: 'left'},
				{
					href: 'https://github.com/facebook/docusaurus',
					label: 'GitHub',
					position: 'right',
				},
			],
		},
		footer: {
			style: 'dark',
			links: [
				{
					title: 'Docs',
					items: [
						{ to: '/docs/getting-started/intro', label: 'Getting Started' },
						{ to: '/docs/main/intro', label: 'Docs' },
						{ to: '/docs/for-developers/intro', label: 'For Developers' },
						{ to: '/typedoc', label: 'API Docs' },
						{ to: '/releases', label: 'Releases' },
					],
				},
				{
					title: 'Community',
					items: [
						{
							label: 'Slack',
							href: 'http://google.com/TODO',
						},
					],
				},
				{
					title: 'More',
					items: [
						// {
						//   label: 'Blog',
						//   to: '/blog',
						// },
						{
							label: 'GitHub',
							href: 'https://github.com/nrkno?q=tv-automation-&type=source&language=&sort=',
						},
					],
				},
			],
			copyright: `Copyright © ${new Date().getFullYear()} My Project, Inc. Built with Docusaurus.`,
		},
		prism: {
			theme: lightCodeTheme,
			darkTheme: darkCodeTheme,
		},
	},
	presets: [
		[
			'@docusaurus/preset-classic',
			{
				docs: {
					sidebarPath: require.resolve('./sidebars.js'),
					// Please change this to your repo.
					editUrl: 'https://github.com/nrkno/tv-automation-server-core/edit/master/packages/documentation/',
				},
				// blog: {
				//   showReadingTime: true,
				//   // Please change this to your repo.
				//   editUrl:
				//     'https://github.com/facebook/docusaurus/edit/master/website/blog/',
				// },
				theme: {
					customCss: require.resolve('./src/css/custom.css'),
				},
			},
		],
	],
	plugins: [
		[
			'@docusaurus/plugin-content-docs',
			{
				id: 'releases',
				path: 'releases',
				routeBasePath: 'releases',
				sidebarPath: require.resolve('./sidebarsReleases.js'),
				// ... other options
			},
		],
		// [
		//   '@docusaurus/plugin-content-docs',
		//   {
		//     id: 'legacy',
		//     path: 'legacy',
		//     routeBasePath: 'legacy',
		//     sidebarPath: require.resolve('./sidebars.js'),
		//     // ... other options
		//   },
		// ],
	],
}