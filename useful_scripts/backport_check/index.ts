// deno-lint-ignore-file no-explicit-any
import { config } from "https://deno.land/x/dotenv@v3.2.0/mod.ts";
import { createWriteStream } from "https://deno.land/std@0.171.0/node/fs.ts";
import { Octokit } from "npm:octokit";
import { IGNORE_PRS } from "./backport_ignore.ts";

const configData = await config();

// Use for debugging the script
const DEBUG = {
  src: 2625,
  dest: 2642,
};

const USE_CACHE = Boolean(configData["CACHE"]) || false;
const CACHE_FILE = "./data/cache.json";
const LOG_FILE = "./data/log.md";
const BACKPORT_PREFIX_RGX = /\[Backport \d..\] ?(.*)/i;
const octokit = new Octokit({
  auth: configData["ACCESS_TOKEN"],
});
const { readFile, writeFile } = Deno;

const log = (message: string) =>
  console.log("\x1b[36m%s\x1b[0m", `-- ${message}`);

const getAllPrs = async () => {
  const pageSize = 100;
  let page = 1;
  let data: any[] = [];
  let fetching = true;

  while (fetching) {
    log(`loading data for page ${page}`);
    const res = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
      owner: "opensearch-project",
      repo: "OpenSearch-Dashboards",
      per_page: pageSize,
      state: "all",
      page,
    });

    res.data;

    if (res.status !== 200) throw Error("failed to fetch data");

    data = [...data, ...res.data];

    if (res.data.length < pageSize) {
      fetching = false;
    }

    page++;
  }

  return data;
};

const isBackPortLabel = (label: any) =>
  label.name.match(/backport [\d\..|main]/) !== null;
const getbackportLabels = (pr: any) => pr.labels.filter(isBackPortLabel);

const getSearchString = (title: string) => {
  let s = title;
  // Remove regex match group
  const simplify = (str: string, regex: RegExp) => {
    const match = str.match(regex);
    return match ? match[1] : str;
  };

  // Remove [Backport x.x]
  s = simplify(s, BACKPORT_PREFIX_RGX);
  // Remove [NameSpace]
  s = simplify(s, /^\[.*\](.*)/);
  // Remove (#0000)
  s = simplify(s, /(.*)(\(#\d{4}\))$/);

  return s;
};

const search = (a: string, b: string) =>
  a.toLowerCase().trim().includes(b.toLowerCase().trim());

const isBackportPr = (pr: any) => !!pr.title.match(BACKPORT_PREFIX_RGX);

const isBackportOfPr = (pr: any, backPr: any): boolean => {
  if (pr.number === DEBUG.src && backPr.number === DEBUG.dest) {
    // deno-lint-ignore no-debugger
    debugger;
  }

  const searchString = getSearchString(pr.title);
  const titleInBackTitle = search(backPr.title, searchString);
  const idInBackTitle = search(backPr.title, `#${pr.number}`);
  const titleIncludesBackportPrefix = !!backPr.title.match(BACKPORT_PREFIX_RGX);
  if ((titleInBackTitle || idInBackTitle) && titleIncludesBackportPrefix) {
    return true;
  }

  return false;
};

// -------- MAIN app ---------------

console.clear();
log("Started script");
let prs: any[] = [];
if (USE_CACHE) {
  log("Loading cache data");
  const decoder = new TextDecoder("utf-8");
  const data = await readFile(CACHE_FILE);
  prs = JSON.parse(decoder.decode(data));
} else {
  log("Loading github data");
  prs = await getAllPrs();
  log("Loaded data, writing to cache file now");
  const encoder = new TextEncoder();
  await writeFile(CACHE_FILE, encoder.encode(JSON.stringify(prs)));
  log("Data written, processing...");
}

log("Get all Pr's with backport labels");
const prsToValidate = prs.filter((pr) => {
  if (pr.status === "open") return false; // Ignore open PR's
  if (pr.merged_at === null) return false; // Ignore closed and not merged PR's
  if (IGNORE_PRS.includes(pr.number)) return false; // Ignore list
  const backportLabels = getbackportLabels(pr);
  return backportLabels.length > 0;
});

log("Get all Backport PRs");
const backportPrs = prs.filter(isBackportPr);

log("Caculate PRs with missing backports");
const missingBackports: any = {};
prsToValidate.forEach((pr) => {
  pr.labels.forEach((label: any) => {
    if (!isBackPortLabel(label)) return;

    const backportPrsForThisPrLabel = backportPrs.filter((backPr) => {
      return isBackportOfPr(pr, backPr);
    });

    if (!backportPrsForThisPrLabel.length) {
      if (!missingBackports[pr.number]) {
        missingBackports[pr.number] = {
          pr,
          verifyUrl: `https://github.com/opensearch-project/OpenSearch-Dashboards/pulls?q=${encodeURIComponent(
            getSearchString(pr.title)
          )}`,
          labels: [],
        };
      }

      missingBackports[pr.number].labels.push(label);
    }
  });
});

// Write to file
const writeStream = createWriteStream(LOG_FILE);
writeStream.write("# Missing backport PR's\n\n");
Object.values(missingBackports).forEach(({ pr, verifyUrl, labels }: any) => {
  const msg = [
    `- ${pr.title}  `,
    `    Missing backports: ${JSON.stringify(
      labels.map((l: any) => l.name)
    )}  `,
    `    ID: ${pr.number} | [Verify](${verifyUrl})\n`,
  ].join("\n");

  writeStream.write(msg);
});

writeStream.on("finish", () => {
  console.log(
    [
      "",
      `Total            : ${prs.length}`,
      `Ignored          : ${IGNORE_PRS.length}`,
      `To Backport      : ${prsToValidate.length}`,
      `Missing Backports: ${Object.keys(missingBackports).length}`,
      ``,
      `Check ${LOG_FILE} for missing backport PR's`,
    ].join("\n")
  );
});

writeStream.end();
