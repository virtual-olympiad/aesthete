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
        text: { "*": wikiPage },
    } = await fetchWikiPage(page);

    let $ = cheerio.load(wikiPage);

    let problemHTML = $('h2:has(span[id="Problem"])').nextUntil(
        'p:has(a:contains("Solution")), h2'
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

    console.log(wikiProblem);

    return wikiProblem;
};

const renderKatex = (htmlString: string) => {
    let $ = cheerio.load(htmlString);

    let latexImages = $('img.latexcenter,img.latex').replaceWith((index, el) => {
        let latexSrc = $(el).attr('alt');

        latexSrc = latexSrc.replaceAll('$', '').replaceAll('\\[', '').replaceAll('\\]', '');
        console.log(latexSrc); 

        let newEl = katex.renderToString(latexSrc, {
            throwOnError: false,
            displayMode: $(el).attr('class') == 'latexcenter'
        });

        console.log(newEl);
        
        return $(newEl);
    });

    return $.html();
};

(async () => {
    const problem = await parseWikiProblem("2020_AMC_10A_Problems/Problem_8");
    console.log(renderKatex(problem));
})();
