/**
 * Shared news fetching utility used by both the news API route
 * and the AI analysis routes (so news context flows into AI decisions).
 */

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  ago: string;
}

const _cache = new Map<string, { data: NewsItem[]; ts: number }>();
const CACHE_TTL = 15 * 60_000;

function cleanCompanyName(name: string): string {
  return name
    .replace(/\s+(limited|ltd\.?|pvt\.?|inc\.?|corp\.?|co\.?)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function extractText(xml: string, tag: string): string {
  const cdataMatch = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i").exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(xml);
  return match ? match[1].trim() : "";
}

function unescapeHTML(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function parseRSS(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = unescapeHTML(extractText(block, "title"));
    const linkMatch = /<link\s*\/?>([\s\S]*?)<\/link>/.exec(block)
      ?? /<guid[^>]*>([\s\S]*?)<\/guid>/.exec(block);
    const url = linkMatch?.[1]?.trim() ?? "";
    const pubDate = extractText(block, "pubDate");
    const source = unescapeHTML(extractText(block, "source"));
    if (title && url) {
      items.push({ title, url, source: source || "News", publishedAt: pubDate, ago: timeAgo(pubDate) });
    }
  }
  return items.slice(0, 10);
}

export async function getStockNews(symbol: string, name: string): Promise<NewsItem[]> {
  const key = symbol.toUpperCase();
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const company = cleanCompanyName(name);
  const query = company.length > 3 ? `"${company}" stock India` : `"${symbol}" NSE stock India`;
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;

  try {
    const res = await fetch(rssUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/rss+xml, text/xml, application/xml",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`RSS ${res.status}`);
    const items = parseRSS(await res.text());
    if (items.length > 0) _cache.set(key, { data: items, ts: Date.now() });
    return items;
  } catch {
    return cached?.data ?? [];
  }
}

/** Format news into a compact block suitable for an AI prompt */
export function formatNewsForPrompt(news: NewsItem[]): string {
  if (news.length === 0) return "No recent news found.";
  return news
    .map((n, i) => `${i + 1}. "${n.title}" — ${n.source}${n.ago ? `, ${n.ago}` : ""}`)
    .join("\n");
}
