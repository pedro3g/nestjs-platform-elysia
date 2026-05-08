// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://pedro3g.github.io',
  base: '/nestjs-platform-elysia',
  integrations: [
    starlight({
      title: 'nestjs-platform-elysia',
      description: 'NestJS HTTP adapter for the Elysia web framework on Bun.',
      logo: { src: './src/assets/logo.svg' },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/pedro3g/nestjs-platform-elysia',
        },
        {
          icon: 'seti:npm',
          label: 'npm',
          href: 'https://www.npmjs.com/package/nestjs-platform-elysia',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/pedro3g/nestjs-platform-elysia/edit/main/docs/',
      },
      sidebar: [
        {
          label: 'Guide',
          items: [
            { label: 'Getting Started', slug: 'guides/getting-started' },
            { label: 'Route Decorators', slug: 'guides/route-decorators' },
            { label: 'Body Parsing', slug: 'guides/body-parsing' },
            { label: 'Trust Proxy', slug: 'guides/trust-proxy' },
            { label: 'WebSockets', slug: 'guides/websockets' },
            { label: 'Testing', slug: 'guides/testing' },
          ],
        },
        {
          label: 'Reference',
          items: [{ autogenerate: { directory: 'reference' } }],
        },
      ],
      lastUpdated: true,
      pagination: true,
    }),
  ],
});
