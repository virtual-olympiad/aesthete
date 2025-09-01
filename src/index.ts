import got from "got";
import { load } from "cheerio";
import katex from "katex";

import type { Element } from "cheerio";

/** 
interface Problem {
    exam: string;
    version: string;
    author?: string;
    difficulty?: number;
    answer?: string;
    link?: string;
}
*/

const api = "https://artofproblemsolving.com/wiki/api.php?";
const fetchWikiPage = async (page: string) => {
    return JSON.parse(
        (await got(api + "action=parse&format=json&page=" + page)).body
    ).parse;
};

const isInt = (str: string) => {
    return (
        !isNaN(+str) &&
        !isNaN(parseFloat(str)) &&
        Number.isInteger(parseFloat(str))
    );
};

const lerp = (p: number, a1: number, a2: number, b1: number, b2: number) => {
    return b1 + ((p - a1) * (b2 - b1)) / (a2 - a1);
};

const parseTitle = (contest = "aime", title: string) => {
    let match;

    title.replaceAll("_", " ");

    switch (contest) {
        case "amc8":
            match = title.match(/^(2\d{3}) ((?:\w* |)AMC 8) Problems\/Problem (\d+)/);
            break;
        case "amc10":
            match = title.match(
                /^(2\d{3}) ((?:\w* |)AMC 10[AB]) Problems\/Problem (\d+)/
            );
            break;
        case "amc12":
            match = title.match(
                /^(2\d{3}) ((?:\w* |)AMC 12[AB]) Problems\/Problem (\d+)/
            );
            break;
        case "aime":
        default:
            match = title.match(
                /^(2\d{3}) ((?:\w* |)AIME I{1,2}) Problems\/Problem (\d+)/
            );
            break;
    }

    if (!match?.[3]) {
        return null;
    }

    const [fullMatch, year, contestName, problemIndex, ...other] = match;

    return {
        year,
        contestName,
        problemIndex,
    };
};

// https://artofproblemsolving.com/wiki/index.php/AoPS_Wiki:Competition_ratings
const contestDifficulties = {
    amc8: [
        [1, 12, 1, 1.25],
        [13, 25, 1.5, 2],
    ],
    amc10: [
        [1, 10, 1, 2],
        [11, 20, 2, 3],
        [21, 25, 3.5, 4.5],
    ],
    amc12: [
        [1, 10, 1.5, 2],
        [11, 20, 2.5, 3.5],
        [21, 25, 4.5, 6],
    ],
    aime: [
        [1, 5, 3, 3.5],
        [6, 9, 4, 4.5],
        [10, 12, 5, 5.5],
        [13, 15, 6, 7],
    ],
};

const estimateDifficulty = (contest: keyof typeof contestDifficulties, year: number, problemIndex: number) => {
    // Interpolate according to AoPS metrics
    let contestDiff = contestDifficulties[contest] as number[][];
    for (let i = 0; i < contestDiff.length; ++i) {
        const c = contestDiff[i];
        if (problemIndex <= c[1]) {
            return lerp(problemIndex, c[0], c[1], c[2], c[3]);
        }
    }

    // TODO: Older years are weighted easier? (maybe bad for objectiveness, will have to decide)
};

interface WikiProblem {
    pageTitle: string;
    link: string;
    problem: string;
    category: string[];
}

async function parseWikiProblem (page: string): Promise<WikiProblem | null> {
    const {
        title,
        text: { "*": wikiPage },
        categories,
        links,
    } = await fetchWikiPage(page);

    const $ = load(wikiPage);

    // :header:has(span:contains("Problem"))
    let problemHTML = $(".mw-parser-output")
        .children()
        .not(".toc") // table of contents
        .not("dl") // redirect message
        .not(":header")
        .first()
        .nextUntil('p:has(a:contains("Solution")), :header, .toc')
        .addBack()
        .not("p:last-child > br:first-child"); // trailing line break

    let wikiProblem = Object.entries($(problemHTML))
        .map((el) => {
            if (!isInt(el[0])) {
                return "";
            }
            let element = $(el[1]);
            return `<${(element["0"] as Element).name}>${element.html()}</${
                (element["0"] as Element).name
            }>`;
        })
        .join("");

    if (!wikiProblem) {
        console.log("Fetching failed for " + title + ", checking redirects...");
        const redirectPage = $(".redirectText a").attr("title");
        if (redirectPage) {
            return await parseWikiProblem(redirectPage);
        }
        console.log("No redirects found for " + title + ".");
        return null;
    }

    return {
        pageTitle: title,
        link:
            "https://artofproblemsolving.com/wiki/index.php/" +
            page.replaceAll(" ", "_"),
        problem: wikiProblem,
        category: categories?.[0]?.["*"] ?? null,
    };
};

const fetchProblemAnswer = async (year: number, contestName: string, problemIndex: number) => {
    contestName.replaceAll(" ", "_");

    // problem edge cases
    if (year == 2012 && contestName == "AMC_12B" && problemIndex == 12){
        return ['d', 'e'];
    }

    if (year == 2015 && contestName == "AMC_10A" && problemIndex == 20){
        return 'b';
    }

    const page = `${year}_${contestName}_Answer_Key`;
    const {
        text: { "*": wikiPage },
    } = await fetchWikiPage(page);

    const $ = load(wikiPage);

    return $(`.mw-parser-output`)
        .find(`ol > li`)
        .eq(problemIndex - 1)
        .text().toLowerCase();
};

const serializeLatexString = (htmlString: string) => {
    let $ = load(htmlString);

    $("img.latexcenter,img.latex").replaceWith((index, el) => {
        let latexSrc = $(el).attr("alt") as string;

        latexSrc = latexSrc.replace(/&nbsp;/g, ' ');

        if (latexSrc.includes("[asy]")) {
            // Asymptote Raster
            return $(el).clone().addClass("katex-image");
        }

        latexSrc = latexSrc
            .replaceAll(/^\$|\$$/g, "")
            .replaceAll(`\\[`, "")
            .replaceAll(`\\]`, "")
            .replaceAll(/{tabular}(\[\w\])*/g, "{array}");

        let newEl = $('<latex></latex>');

        newEl.text(latexSrc);
        newEl.attr("center", String(Number($(el).attr("class") == "latexcenter")));

        try {
            katex.renderToString(latexSrc, {
                throwOnError: true,
                displayMode: $(el).attr("class") == "latexcenter",
            });
        } catch (e) {
            if (e instanceof katex.ParseError) {
                // Katex Parsing Error, use original image
                newEl = $(el).clone().addClass("katex-image");
            } else {
                console.error(e);
            }
        }

        return newEl;
    });

    return $.html();
};

const renderKatexString = (htmlString: string) => {
    let $ = load(htmlString);

    $("latex").replaceWith((index, el) => {
        let latexSrc = $(el).text() as string;

        let newEl;

        try {
            newEl = katex.renderToString(latexSrc, {
                throwOnError: true,
                displayMode: $(el).attr("center") === "1",
            });
        } catch (e) {
            if (e instanceof katex.ParseError) {
                // Katex Parsing Error, use original image
                newEl = $(el).clone();
            } else {
                console.error(e);
            }
        }

        return $(newEl).addClass("katex-image");
    });

    return $.html();
};

const listAllProblems = async () => {
    let body,
        amc8 = [],
        amc10 = [],
        amc12 = [],
        aime = [];

    do {
        let res = await got(
            api +
                "action=query&list=allpages&aplimit=max&format=json&apcontinue=" +
                (body?.continue?.apcontinue ?? "")
        );
        body = JSON.parse(res.body);

        for (let page of body?.query?.allpages) {
            let { title } = page;

            if (title.match(/^2\d{3} (?:\w* |)AIME I{1,2} Problems\/Problem \d+/)) {
                aime.push(title);
                continue;
            }

            if (title.match(/^2\d{3} (?:\w* |)AMC 8 Problems\/Problem \d+/)) {
                amc8.push(title);
                continue;
            }

            if (title.match(/^2\d{3} (?:\w* |)AMC 10[AB] Problems\/Problem \d+/)) {
                amc10.push(title);
                continue;
            }

            if (title.match(/^2\d{3} (?:\w* |)AMC 12[AB] Problems\/Problem \d+/)) {
                amc12.push(title);
                continue;
            }
        }
    } while (body?.continue);

    return {
        amc8,
        amc10,
        amc12,
        aime,
    };
};

export {
    fetchWikiPage,
    parseTitle,
    estimateDifficulty,
    fetchProblemAnswer,
    parseWikiProblem,
    serializeLatexString,
    renderKatexString,
    listAllProblems,
};
