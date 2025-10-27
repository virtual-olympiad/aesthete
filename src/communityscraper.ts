import got from "got";
import { load, Element } from "cheerio";
import katex from "katex";
import { fileURLToPath } from "url";
import path from "path";
import { firefox, Browser } from "playwright";
import {scrapeIMO} from "./aops-contest-scraper.js";

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

export async function parseIndividualContestPage(pageHtml: string, baseUrl: string): Promise<void>{
    const $ = load(pageHtml);
    const posts: Element[] = $(".cmty-full-cell-link").toArray();
    const urlList: String[] = [];
    for (const postEl of posts.slice(1)) {
        const $el = $(postEl);
        const href = $el.attr("href");
        if (href) {
            const url = "https://artofproblemsolving.com" + href;
            if(urlList.includes(url)) continue;
            console.log("Scraping: " + url);
            urlList.push(url);
            await scrapeIMO(url)
        }
    }
}


if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    (async () => {
        console.log("Running...");
        const url = process.argv[2];
        if (!url) {
            console.error("Usage: node aops-contest-scraper.js <AoPS thread URL>");
            process.exit(1);
        }
        try {
            const html = await fetchPage(url);
            const problems = await parseIndividualContestPage(html, url);
        } catch (err) {
            console.error("Error:", (err as Error).message);
            process.exit(2);
        }
    })();
}
