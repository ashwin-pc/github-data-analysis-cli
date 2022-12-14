import { createWriteStream, readFileSync } from "fs";
import { writeFile } from "fs/promises";
import { Octokit } from "octokit";

const DEBUG = {
  src: 2625,
  dest: 2642,
};
const USE_CACHE = true;
const IGNORE_PRS = [1860, 2645, 2673, 2581, 2587, 2639, 2673];
const BACKPORT_PREFIX_RGX = /\[Backport \d..\] ?(.*)/i;
const octokit = new Octokit({
  auth: "xxx",
});

const log = (message) => console.log("\x1b[36m%s\x1b[0m", `-- ${message}`);

const getAllPrs = async () => {
  const pageSize = 100;
  let page = 1;
  let data = [];
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

    if (res.status !== 200) throw Error("failed to fetch data");

    data = [...data, ...res.data];

    if (res.data.length < pageSize) {
      fetching = false;
    }

    page++;
  }

  return data;
};

const isBackPortLabel = (label) =>
  label.name.match(/backport [\d\..|main]/) !== null;
const getbackportLabels = (pr) => pr.labels.filter(isBackPortLabel);

const getSearchString = (title) => {
  let s = title;
  // Remove regex match group
  const simplify = (str, regex) => {
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

const search = (a, b) =>
  a.toLowerCase().trim().includes(b.toLowerCase().trim());

const isBackportPr = (pr) => !!pr.title.match(BACKPORT_PREFIX_RGX);

const isBackportOfPr = (pr, backPr) => {
  if (pr.number === DEBUG.src && backPr.number === DEBUG.dest) {
    debugger;
  }

  const searchString = getSearchString(pr.title);
  const titleInBackTitle = search(backPr.title, searchString);
  const idInBackTitle = search(backPr.title, `#${pr.number}`);
  const titleIncludesBackportPrefix = !!backPr.title.match(BACKPORT_PREFIX_RGX);
  if ((titleInBackTitle || idInBackTitle) && titleIncludesBackportPrefix) {
    return true;
  }
};

// -------- MAIN app ---------------

console.clear();
log("Started app");
let prs = [];
if (USE_CACHE) {
  log("Loading cache data");
  prs = JSON.parse(readFileSync("./prs.json", "utf-8"));
} else {
  log("Loading github data");
  prs = await getAllPrs();
  log("Loaded data, writing to cache file now");
  await writeFile("./prs.json", JSON.stringify(prs));
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

// debugger;

log("Get all Backport PRs");
const backportPrs = prs.filter(isBackportPr);

log("Caculate PRs with missing backports");
const missingBackports = {};
prsToValidate.forEach((pr) => {
  pr.labels.forEach((label) => {
    if (!isBackPortLabel(label)) return;

    // if (pr.title.includes("Bumps chromedriver to v100 ")) {
    //   debugger;
    // }
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
const logFile = "./log.md";
const writeStream = createWriteStream(logFile);
writeStream.write("# Missing backport PR's\n\n");
Object.values(missingBackports).forEach(({ pr, verifyUrl, labels }) => {
  const msg = [
    `- ${pr.title}  `,
    `    Missing backports: ${JSON.stringify(labels.map((l) => l.name))}  `,
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
      `Check ${logFile} for missing backport PR's`,
    ].join("\n")
  );
});

writeStream.end();
