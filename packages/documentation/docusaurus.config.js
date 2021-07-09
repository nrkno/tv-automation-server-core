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
				{ href: 'https://julusian.github.io/tv-automation-server-core/typedoc', label: 'API Docs' }, // external link to typedoc
				{ to: '/releases', label: 'Releases', position: 'left' },
				// {to: '/blog', label: 'Blog', position: 'left'},

				{
					type: 'docsVersionDropdown',

					position: 'right',
					// Add additional dropdown items at the beginning/end of the dropdown.
					dropdownItemsBefore: [],
					// dropdownItemsAfter: [{ to: '/versions', label: 'All versions' }],
					// Do not add the link active class when browsing docs.
					dropdownActiveClassDisabled: true,
					docsPluginId: 'default',
				},
				{
					href: 'https://github.com/nrkno/tv-automation-server-core',
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
					editUrl: 'https://github.com/nrkno/tv-automation-server-core/edit/master/packages/documentation/',
					// default to the 'next' docs
					lastVersion: 'current',
					versions: {
						// Override the rendering of the 'next' docs to be 'latest'
						current: {
							label: 'Latest',
							banner: 'none',
						},
					},
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
