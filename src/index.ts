import * as github from "@actions/github";
import * as core from "@actions/core";
import got from "got";
import * as path from "path";
import * as crypto from "crypto";

(async () => {
  const parameters = {
    githubToken: core.getInput("github-token", { required: true }),
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    apiKey: core.getInput("api-key", { required: true }),
    apiLanguage: core.getInput("api-language") || undefined,
    apiVersion: core.getInput("api-version") || undefined,
    baseBranch: core.getInput("base-branch") || "master",
    outputPath: core.getInput("output-path", { required: true }),
  };
  const templates = {
    commit: {
      message: "Download Gwent cards from Gwent.one",
    },
    pullRequest: {
      branch: "automated-gwent-cards-update",
      title: "Update Gwent cards",
      body: `This PR updates the Gwent cards data in \`${parameters.outputPath}\`.`,
    },
  };
  const octokit = github.getOctokit(parameters.githubToken);

  const cards = await got("https://gwent.one/api/cardlist", {
    searchParams: {
      key: parameters.apiKey,
      language: parameters.apiLanguage,
      version: parameters.apiVersion,
    },
  }).json();
  const metadata = {
    path: path.join(
      path.dirname(parameters.outputPath),
      `${path.basename(parameters.outputPath, ".json")}.metadata.json`
    ),
    updatedAt: new Date().toLocaleDateString("en-US"),
    md5: crypto.createHash("md5").update(stringify(cards)).digest("hex"),
  };
  const shouldExitEarly = await isAlreadyUpToDate();

  if (shouldExitEarly) {
    return;
  }

  await createBranch();
  await createCommit();
  await createPullRequest();

  async function isAlreadyUpToDate(): Promise<boolean> {
    try {
      // Compare with an existing pull request.
      const { data: currentMetadata } = await octokit.repos.getContent({
        owner: parameters.owner,
        repo: parameters.repo,
        path: metadata.path,
        ref: templates.pullRequest.branch,
      });

      return (
        JSON.parse(Buffer.from(currentMetadata.content, "base64").toString())
          .md5 === metadata.md5
      );
    } catch (error) {}

    try {
      // Compare with the base branch.
      const { data: currentMetadata } = await octokit.repos.getContent({
        owner: parameters.owner,
        repo: parameters.repo,
        path: metadata.path,
        ref: parameters.baseBranch,
      });

      return (
        JSON.parse(Buffer.from(currentMetadata.content, "base64").toString())
          .md5 === metadata.md5
      );
    } catch (error) {}

    return false;
  }

  function stringify<T>(json: T): string {
    return JSON.stringify(json, null, 2);
  }

  async function createBranch() {
    try {
      // Fetch the branch, it fails if it doesn't exist yet.
      await octokit.git.getRef({
        owner: parameters.owner,
        repo: parameters.repo,
        ref: `heads/${templates.pullRequest.branch}`,
      });
    } catch (error) {
      // Create a new branch based on the most recent commit of the base branch.
      const { data: baseReference } = await octokit.git.getRef({
        owner: parameters.owner,
        repo: parameters.repo,
        ref: `heads/${parameters.baseBranch}`,
      });
      await octokit.git.createRef({
        owner: parameters.owner,
        repo: parameters.repo,
        ref: `refs/heads/${templates.pullRequest.branch}`,
        sha: baseReference.object.sha,
      });
    }
  }

  async function createCommit() {
    // Get the branch to commit to.
    const { data: branch } = await octokit.git.getRef({
      owner: parameters.owner,
      repo: parameters.repo,
      ref: `heads/${templates.pullRequest.branch}`,
    });

    // Create the Git tree.
    const { data: tree } = await octokit.git.createTree({
      owner: parameters.owner,
      repo: parameters.repo,
      tree: [
        {
          path: parameters.outputPath,
          mode: "100644",
          type: "blob",
          content: stringify(cards),
        },
        {
          path: metadata.path,
          mode: "100644",
          type: "blob",
          content: stringify(metadata),
        },
      ],
      base_tree: branch.object.sha,
    });

    // Create a commit.
    const { data: commit } = await octokit.git.createCommit({
      owner: parameters.owner,
      repo: parameters.repo,
      message: templates.commit.message,
      tree: tree.sha,
      parents: [branch.object.sha],
    });

    // Attach the commit to the branch.
    await octokit.git.updateRef({
      owner: parameters.owner,
      repo: parameters.repo,
      ref: branch.ref.replace(/^refs\//, ""),
      sha: commit.sha,
    });
  }

  async function createPullRequest() {
    try {
      await octokit.pulls.create({
        owner: parameters.owner,
        repo: parameters.repo,
        title: templates.pullRequest.title,
        body: templates.pullRequest.body,
        head: templates.pullRequest.branch,
        base: parameters.baseBranch,
      });
    } catch (error) {
      // There's already an open PR.
    }
  }
})();
