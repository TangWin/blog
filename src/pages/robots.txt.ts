import type { APIRoute } from 'astro';

const getRobotsTxt = (sitemapURL: URL, siteURL: URL) => `
User-agent: *
Allow: /

# AI / LLM crawlers (GEO, AEO, LLMO)
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

# Structured summary for LLMs: https://llmstxt.org/
# LLMs.txt: ${new URL('llms.txt', siteURL).href}

Sitemap: ${sitemapURL.href}
`;

export const GET: APIRoute = ({ site }) => {
  // `site` has no trailing slash (https://…/blog); add base so URLs resolve under /blog/
  const siteURL = new URL(import.meta.env.BASE_URL, site);
  const sitemapURL = new URL('sitemap-index.xml', siteURL);
  return new Response(getRobotsTxt(sitemapURL, siteURL));
};
