# GitHub Data Analysis CLI Tool
This is a command-line interface (CLI) tool for analyzing data from GitHub repositories using the GitHub GraphQL API.

## Prerequisites
- Node.js
- A personal access token from GitHub with the read:user and read:org permissions.

## Installation
To install the CLI tool, clone this repository and run the following command from the root directory:

```
npm install
```

## Usage
To use the CLI tool, run the following command:

```
npm start
```

This will start the tool and prompt you for your GitHub personal access token and the name of the repository you want to analyze.

Once you have entered this information, the CLI will connect to the GitHub GraphQL API and retrieve data about the repository. It will then display a summary of the data, including the number of stars, forks, and open issues, as well as the repository's primary language and the date of the last push.

License
This project is licensed under the MIT License. See the LICENSE file for details.