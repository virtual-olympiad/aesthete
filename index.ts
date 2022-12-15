import got from "got";
import cheerio from "cheerio";
import katex from "katex";

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
        !isNaN(str) &&
        !isNaN(parseFloat(str)) &&
        Number.isInteger(parseFloat(str))
    );
};

const parseWikiProblem = async (page: string) => {
    const {
        title,
        text: { "*": wikiPage },
        categories,
        links
    } = await fetchWikiPage(page);

    const $ = cheerio.load(wikiPage);

    let problemHTML = $('h2:has(span:contains("Problem"))').nextUntil(
        'p:has(a:contains("Solution")), h2, .toc'
    );

    let wikiProblem = Object.entries($(problemHTML))
        .map((el) => {
            if (!isInt(el[0])) {
                return "";
            }
            let element = $(el[1]);
            return `<${element["0"].name}>${element.html()}</${
                element["0"].name
            }>`;
        })
        .join("");
    
    if (!wikiProblem){
        console.log("Fetching failed for " + title + ", checking redirects...");
        const redirectPage = $('.redirectText a').attr('title');
        if (redirectPage){
            return await parseWikiProblem(redirectPage);
        }
        return;
    }
    
    return {
        title: title,
        problem: wikiProblem,
        category: categories?.[0]?.["*"] ?? null
    };
};

const parseKatex = (htmlString: string) => {
    let $ = cheerio.load(htmlString);

    $('img.latexcenter,img.latex').replaceWith((index, el) => {
        let latexSrc = $(el).attr('alt');
        
        if (latexSrc.includes('[asy]')){
            // Asymptote Raster  
            return $(el);
        }

        latexSrc = latexSrc.replaceAll('$', '').replaceAll('\\[', '').replaceAll('\\]', '');

        let newEl;

        try {
            newEl = katex.renderToString(latexSrc, {
                throwOnError: true,
                displayMode: $(el).attr('class') == 'latexcenter'
            });
        } catch (e) {
            if (e instanceof katex.ParseError) {
                // Katex Parsing Error
                newEl = $(el);
            } else {
                console.error(e);
            }
        }
        
        return $(newEl);
    });

    return $.html();
};

const listAllProblems = async () => {
    let body, amc8 = [], amc10 = [], amc12 = [], aime = [];

    do {
        let res = await got(api + "action=query&list=allpages&aplimit=max&format=json&apcontinue=" + (body?.continue?.apcontinue ?? ""));
        body = JSON.parse(res.body);

        for (let page of body?.query?.allpages){
            let { title } = page;

            if (title.match(/^2\d{3} AIME I{1,2} Problems\/Problem \d+/)){
                aime.push(title);
                continue;
            }
            
            if (title.match(/^2\d{3} AMC 8 Problems\/Problem \d+/)){
                amc8.push(title);
                continue;
            }
            
            if (title.match(/^2\d{3} AMC 10[AB] Problems\/Problem \d+/)){
                amc10.push(title);
                continue;
            }

            if (title.match(/^2\d{3} AMC 12[AB] Problems\/Problem \d+/)){
                amc12.push(title);
                continue;
            }
        }
    } while(body?.continue);

    return {
        amc8, amc10, amc12, aime
    };
};

/** 
 * 
(async () => {
    let problemCache = await listAllProblems();
    let { amc8, amc10, amc12, aime } = problemCache;

    fs.writeFileSync('problems.json', JSON.stringify(problemCache, null, 4));
    fs.writeFileSync('amc8Problems.json', JSON.stringify(amc8, null, 4));
    fs.writeFileSync('amc10Problems.json', JSON.stringify(amc10, null, 4));
    fs.writeFileSync('amc12Problems.json', JSON.stringify(amc12, null, 4));
    fs.writeFileSync('aimeProblems.json', JSON.stringify(aime, null, 4));
})();

(async () => {
    const problem = await parseWikiProblem("2008_AMC_12B_Problems/Problem_2");
    console.log(problem.problem);
    console.log("---")
    console.log(parseKatex(problem.problem));
})();
**/

export { fetchWikiPage, parseWikiProblem, parseKatex, listAllProblems };