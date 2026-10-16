import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const postSchema = z
  .object({
    title: z.string(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    draft: z.boolean().optional(),
    pubDate: z.coerce.date().optional(),
    contentWidth: z.enum(['narrow', 'medium', 'wide', 'full']).optional(),
  })
  .refine(
    (data) => {
      if (data.draft === true) {
        return true;
      }
      return data.pubDate !== undefined;
    },
    {
      message: 'When draft is false, pubDate is required',
      path: ['pubDate'],
    },
  );

const postZh = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/post/zh' }),
  schema: postSchema,
});

const pagesCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    draft: z.boolean().optional(),
  }),
});

export const collections = {
  'post-zh': postZh,
  pages: pagesCollection,
};
