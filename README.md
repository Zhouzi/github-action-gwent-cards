# github-action-gwent-cards

A GitHub action that pulls cards from Gwent.one's API and submits a pull request with the changes.

## Usage

Add your Gwent.one API key to the repository's secrets, under the name `GWENT_ONE_API_KEY` for example.
Then, create `.github/workflows/update-gwent-cards.yml`:

```yml
name: Update Gwent Cards
on:
  schedule:
    - cron: "0 0 * * *"
jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: zhouzi/github-action-gwent-cards@0.0.0
        with:
          github-token: ${{secrets.GITHUB_TOKEN}}
          api-key: ${{secrets.GWENT_ONE_API_KEY}}
          output-path: src/data/cards.json
```

## Inputs

### github-token

**Required:** the GitHub token to use to create the pull request and push changes.

### api-key

**Required:** your Gwent.one API key, see: .

### api-language

The language parameter passed to the Gwent.one API, see: .

### api-version

The version parameter passed to the Gwent.one API, see: .

### base-branch

The base branch for the pull request, default to master.

### output-path

**Required:** the path to the generated file.
