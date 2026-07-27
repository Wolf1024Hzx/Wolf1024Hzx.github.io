import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

/** frontmatter 中的 tags / categories 可能是单字符串或数组，统一归一化为数组 */
export function toArray(value?: string | string[]): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export async function getSortedPosts(): Promise<Post[]> {
  const posts = await getCollection('blog');
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** 按 key（tag 或 category）对文章分组，按文章数降序返回 */
export function groupBy(posts: Post[], field: 'tags' | 'categories'): Map<string, Post[]> {
  const map = new Map<string, Post[]>();
  for (const post of posts) {
    for (const key of toArray(post.data[field])) {
      const list = map.get(key) ?? [];
      list.push(post);
      map.set(key, list);
    }
  }
  return new Map([...map.entries()].sort((a, b) => b[1].length - a[1].length));
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
