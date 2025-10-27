import got from "got";
import { load, Element } from "cheerio";
import katex from "katex";
import { fileURLToPath } from "url";
import path from "path";
import { firefox, Browser } from "playwright";

export interface Problem {
    exam?: string;
    version?: string;
    author?: string;
    postId?: string;
    html?: string;
    text?: string;
    link?: string;
    images?: string[];
    metadata?: Record<string, any>;
}

export async function fetchPage(
    url: string,
    options: { waitForSelector?: string } = {}
): Promise<string> {
    let browser: Browser | null = null;

    try {
        browser = await firefox.launch({ headless: true });
        const page = await browser.newPage();

        const response = await page.goto(url, { waitUntil: "networkidle" });
        if (!response) {
            throw new Error(`Failed to navigate to ${url}`);
        }

        if (options.waitForSelector) {
            await page.waitForSelector(options.waitForSelector);
        }

        const body = await page.content();
        const statusCode = response.status();
        const finalUrl = response.url();

        return body;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

export function serializeLatexString(htmlString: string): string {
    const $ = load(htmlString);
    $("img.latexcenter,img.latex").replaceWith((_, el) => {
        const $el = $(el);
        let latexSrc = $el.attr("alt") ?? "";
        latexSrc = latexSrc.replace(/&nbsp;/g, " ");
        if (latexSrc.includes("[asy]")) {
            return $el.clone().addClass("katex-image");
        }
        latexSrc = latexSrc.replaceAll(/^\$|\$$/g, "").replaceAll(/\\\[|\\\]/g, "");
        const newEl = $("<latex></latex>");
        newEl.text(latexSrc);
        newEl.attr("center", String(Number($el.attr("class") === "latexcenter")));
        try {
            katex.renderToString(latexSrc, {
                throwOnError: true,
                displayMode: $el.attr("class") === "latexcenter",
            });
        } catch (e) {
            return $el.clone().addClass("katex-image");
        }
        return newEl;
    });
    return $.html();
}

export function renderKatexString(htmlString: string): string {
    const $ = load(htmlString);
    $("latex").replaceWith((_, el) => {
        const $el = $(el);
        const latexSrc = $el.text();
        let rendered = $el.clone();
        try {
            const html = katex.renderToString(latexSrc, {
                throwOnError: true,
                displayMode: $el.attr("center") === "1",
            });
            rendered = load(html).root();
        } catch (e) {
            return $el;
        }
        return rendered.html() ?? "";
    });
    return $.html();
}

function buildPostPermalink(baseUrl: string, postId?: string | null): string {
    if (!postId) return baseUrl;
    if (postId.startsWith("#") || postId.startsWith("/")) return `${baseUrl}${postId}`;
    return `${baseUrl}#${postId}`;
}

export async function parseContestThread(pageHtml: string, baseUrl: string): Promise<Problem[]> {
    const $ = load(pageHtml);
    // Only select elements with the cmty-view-post-item-text class
    const posts: Element[] = $(".cmty-view-post-item-text").toArray();
    // console.log(posts);

    const problems: Problem[] = [];

    for (const postEl of posts) {
        const post = $(postEl);

        const text = post.text().trim();
        if (text.length < 20) continue; // Exclude short posts
        const author =
            post.closest(".cmty-view-post-item")
                .find(".username, .author, .poster, .message-user a, .user-name")
                .first()
                .text()
                .trim() || undefined;

        const postId =
            post.closest(".cmty-view-post-item").attr("data-post-id") ??
            post.closest(".cmty-view-post-item").attr("id") ??
            undefined;

        const images = post.find("img").toArray().map((i) => $(i).attr("src") ?? "").filter(Boolean);

        let html = serializeLatexString(post.html() ?? "");

        let version = null;
        const verMatch =
            text.match(/\bProblem\s*#?\s*(\d{1,2})\b/i) ||
            text.match(/\bP(?:roblem)?\s*(\d{1,2})\b/i) ||
            text.match(/\bDay\s*(\d)\s*Problem\s*(\d{1,2})\b/i) ||
            null;
        if (verMatch) {
            version = verMatch[0];
        }

        const link = buildPostPermalink(baseUrl, postId);

        problems.push({
            exam: undefined,
            version: version ?? undefined,
            author,
            postId: postId ?? undefined,
            html,
            text,
            link,
            images,
            metadata: {
                extractedDate: new Date().toISOString(),
            },
        });
    }

    const threadTitle =
        $('h1:not(.katex):first, .thread-title:first, .topic-title:first, #content h1:first')
            .first()
            .text()
            .trim() || undefined;

    if (threadTitle) {
        for (const p of problems) {
            p.exam = threadTitle;
        }
    }

    return problems;
}

export async function scrapeIMO(url: string): Promise<void> {
    if (!url) {
        console.error("Usage: node aops-contest-scraper.js <AoPS thread URL>");
    }
    try {
        const html = await fetchPage(url);
        const problems = await parseContestThread(html, url);
        console.log(JSON.stringify(problems, null, 2) + "\n-----------------------------------------");

    } catch (err) {
        console.error("Error:", (err as Error).message);
    }
}
