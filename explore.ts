// deno-lint-ignore-file no-explicit-any
import { config } from "https://deno.land/x/dotenv@v3.2.0/mod.ts";
import { Octokit } from "npm:octokit";

const configData = await config();

const octokit = new Octokit({
  auth: configData["ACCESS_TOKEN"],
});

// deno-lint-ignore no-explicit-any
const result: any = await octokit.graphql(`
{
  repository(name: "OpenSearch-Dashboards", owner: "opensearch-project") {
    issues(labels: "untriaged", states: OPEN, first: 100) {
      edges {
        node {
          title
          url
          assignees(first: 10) {
            edges {
              node {
                name
                login
              }
            }
          }
        }
      }
    }
  }
}
`);

// Do something with the result
// console.log(result.repository.issues.edges);

// Pretty print the output
const byAssignee: { [key: string]: any } = {};
result.repository.issues.edges.forEach(({ node: issue }: any) => {
  // console.log("assignees", issue.assignees?.edges, issue.title);
  const assignee = issue.assignees?.edges[0]?.node.login ?? "unassigned";

  byAssignee[assignee] = byAssignee[assignee] || [];
  byAssignee[assignee].push(issue);
});

Object.keys(byAssignee).forEach((assignee) => {
  const issuesforAssignee = byAssignee[assignee];

  const issues = issuesforAssignee
    .map(
      (issue: any) => `
    - ${issue.title}: ${issue.url}`
    )
    .join("");

  const name = issuesforAssignee[0].assignees?.edges[0]?.node.name;
  const logMessage = `Assignee: ${assignee} | ${name}` + issues + "\n";

  console.log(logMessage);
});
