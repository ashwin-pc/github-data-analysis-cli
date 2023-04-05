import { config } from "https://deno.land/x/dotenv@v3.2.0/mod.ts";
import { createWriteStream } from "https://deno.land/std@0.171.0/node/fs.ts";
import { Octokit } from "npm:octokit";
import { IGNORE_PRS } from "./backport_ignore.ts";
import {
  Repository,
  LabelEdge,
  PullRequest,
} from "npm:@octokit/graphql-schema";
import { removeMaybe } from "../../utils/index.ts";

const configData = await config();

// Use for debugging the script to understand why the check did not find the correct backport PR
const DEBUG = {
  src: 2890,
  dest: 2924,
};

const USE_CACHE = configData["CACHE"] === "true" || false;
const CACHE_FILE = "./data/cache.json";
const LOG_FILE = "./data/log.md";
const BACKPORT_PREFIX_RGX = /\[.*Backport \d..\] ?(.*)/i;
const octokit = new Octokit({
  auth: configData["ACCESS_TOKEN"],
});
const { readFile, writeFile } = Deno;

const log = (message: string) =>
  console.log("\x1b[36m%s\x1b[0m", `-- ${message}`);

const getAllPrs = async () => {
  const pageSize = 100;
  let cursor;
  let page = 1;
  let data: PullRequest[] = [];
  let fetching = true;

  while (fetching) {
    log(`loading data for page ${page}`);
    const after: string = cursor ? `after:"${cursor}"` : "";

    const res = await octokit.graphql<{ repository: Repository }>(`
    {
      repository(name: "OpenSearch-Dashboards", owner: "opensearch-project") {
        pullRequests(first: ${pageSize}, ${after}) {
          edges {
            cursor,
            node {
              title
              url
              state
              number
              labels(first: 20){
                edges {
                  node{
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
    `);

    const edges = removeMaybe(res.repository.pullRequests.edges ?? []);
    const prs = removeMaybe(edges.map((edge) => edge.node)).filter((pr) =>
      Boolean(pr)
    ) as PullRequest[];

    if (!res) throw Error("failed to fetch data");

    data = [...data, ...prs];

    if (!prs.length) {
      fetching = false;
      continue;
    }

    cursor = edges.length > 0 ? edges[edges.length - 1]?.cursor : "";
    page++;
  }

  return data;
};

const isBackPortLabel = (label: LabelEdge) =>
  label?.node?.name.match(/backport [\d\..|main]/) !== null;
const getBackportLabels = (pr: PullRequest) => {
  const labelEdges = removeMaybe(pr.labels?.edges ?? []);
  return removeMaybe(labelEdges.filter(isBackPortLabel) || []);
};

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

const isBackportPr = (pr: PullRequest) => !!pr.title.match(BACKPORT_PREFIX_RGX);

const isBackportOfPr = (pr: PullRequest, backPr: PullRequest): boolean => {
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
let prs: PullRequest[] = [];
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
  if (["OPEN", "CLOSED"].includes(pr.state)) return false; // Ignore open and closed PR's
  // if (pr.merged_at === null) return false; // Ignore closed and not merged PR's
  if (IGNORE_PRS.includes(pr.number)) return false; // Ignore list
  const backportLabels = getBackportLabels(pr);
  return backportLabels.length > 0;
});

log("Get all Backport PRs");
const backportPrs = prs
  .filter(isBackportPr)
  .filter((pr) => ["OPEN", "MERGED"].includes(pr.state)); // Keep all open and merged PR's

debugger;

log("Caculate PRs with missing backports");
const missingBackports: {
  [key: string]: {
    pr: PullRequest;
    verifyUrl: string;
    labels: LabelEdge[];
  };
} = {};

prsToValidate.forEach((pr) => {
  pr.labels?.edges?.forEach((label) => {
    if (!label || !isBackPortLabel(label)) return;

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
Object.values(missingBackports).forEach(({ pr, verifyUrl, labels }) => {
  const msg = [
    `- ${pr.title}  `,
    `    Missing backports: ${JSON.stringify(
      labels.map((l) => l.node?.name)
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
