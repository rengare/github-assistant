#!/usr/bin/env node

import * as yargs from 'yargs';
import * as GitHub from 'github-api';
import * as log from 'loglevel';
import releaseNotes from './utils/release-notes';

const argv = yargs
    .usage('Usage: $0 [options]')
    .option('repo', {
        alias: 'r',
        description: 'Name of the repo in the format username/reponame',
        type: 'string'
    })
    .option('tag', {
        alias: 't',
        description: 'Version tag to use for the release',
        type: 'string'
    })
    .option('branch', {
        alias: 'b',
        description: 'Branch to use for the release',
        type: 'string'
    })
    .option('gh-token-env-var', {
        description: 'Environment variable name for GitHub access token',
        type: 'string',
        'default': null
    })
    .option('gh-api-base-url', {
        description: 'Base URL of the GitHub API',
        type: 'string',
        'default': 'https://api.github.com'
    })
    .option('prerelease', {
        alias: 'p',
        description: 'Mark as a pre-release',
        type: 'boolean',
        'default': false
    })
    .option('hide-docs', {
        description: 'Omit Documentation section from the release notes',
        type: 'boolean',
        'default': false
    })
    .option('dry-run', {
        description: 'Skip the creation of the release on GitHub, but do everything else',
        type: 'boolean',
        'default': false
    })
    .option('debug', {
        alias: 'd',
        description: 'Turn on console messages',
        type: 'boolean',
        'default': false
    })
    .demandOption(['repo', 'tag', 'branch'], 'Please provide the repo, version tag and branch to create this release')
    .alias('help', 'h')
    .version(false)
    .help()
    .argv;

run();

async function run() {
    const gh = new GitHub({
        token: argv['gh-token-env-var'] || process.env['REPO_TOKEN']
    }, argv['gh-api-base-url']);

    const [user, repoName] = argv.repo.split('/');

    const repo = gh.getRepo(user, repoName);

    try {
        const notes = await releaseNotes(repo, argv);

        log.info(notes);

        if (!argv['dry-run']) {
            await release(repo, notes)
        }
    }
    catch (e) {
        log.error(`❌ ---> Error: ${e}`)
    }
}

async function release(repo: any, notes: any) {
    const tag = (argv.tag as string).includes('v') ? argv.tag : `v${argv.tag}`;

    const response = await repo.createRelease({
        'tag_name': tag,
        'target_commitish': argv.branch,
        'name': `Release ${tag}`,
        'body': notes,
        'draft': false,
        'prerelease': argv.prerelease
    })

    log.info('\nCreated release:', response.data.id, response.data.name, '\n\n');
}