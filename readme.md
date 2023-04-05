# GitHub Data Analysis CLI Tool
This is a command-line interface (CLI) tool for analyzing data from GitHub repositories using the GitHub GraphQL API.

## Prerequisites
- Deno
- A personal access token from GitHub with the read:user and read:org permissions.

## Installation
Deno scripts do not require installation

## Usage
To use the CLI tool, run the following command:

```
deno run <script_name>

# e.g.
deno run explore.ts
```

This will start the script and print the reults in the console or into a file depending on the script

### Adding the personal access token for github

Create a `.env` file and add a line entry as follows

```
ACCESS_TOKEN=xxx
```

The scripts can then pickup the access token and execute the api calls

## Using the github graphql explorer

Use the GitHub GraphQL Explorer to test your queries. First make sure you have a GitHub account and are logged in. Then, go to the Explorer page by navigating to https://docs.github.com/en/graphql/overview/explorer.

Once on the Explorer page, you can start by typing in a query in the left-hand panel. The query will automatically be executed and the results will be displayed in the right-hand panel. You can also use the dropdown menus and autocomplete suggestions to help you construct your query.

Use the `explore.ts` script to run the query and transform its response for data analysis

## Useful scripts
### Backport check

To validate if each Pr that needs to be backported has a corresponding backport Pr that is either open or as been merged, run the backport check script

```
deno run --allow-all ./useful_scripts/backport_check/index.ts
```