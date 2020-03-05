import * as log from 'loglevel';

class Message {
    fixes: string[] = [];
    features: string[] = [];
    docs: string[] = [];

    constructor(init?: Partial<Message>) {
        init && Object.assign(this, init);
    }
}

interface FilteredCommits {
    sha: string
    url: string
    message: string
    prNumber: number | null
}

interface GithubCommit {
    author: any;
    comments_url: string;
    commit: {
        message: string,
        url: string
    };
    commiter: any;
    html_url: string;
    node_id: string;
    parents: any[];
    sha: string;
    url: string;
}

interface Pr {
    number: number,
    html_url: string
}

interface Hash {
    [details: string]: string;
}

function buildCommitMessage(commit: any, pullRequests: any): string {
    const template = (msg, sha, url, prNumber, prUrl): string => {
        log.debug('\nTemplate\n', msg, sha, url, prNumber, prUrl);
        return `${msg}${prNumber ? ` ([#${prNumber}](${prUrl}))` : ''} ([${sha}](${url}))`;
    };

    let message = commit.message;
    log.debug('\nRaw Message\n', message);
    let pos = message.indexOf(':');
    if (pos !== -1) {
        message = message.substring(pos + 1).trim();
    }

    if (message.match(/BREAKING CHANGE\:/)) {
        message = `**BREAKING CHANGE:** ${message}`;
    }

    pos = message.indexOf(commit.prNumber ? '(#' : '\n\n');
    if (pos !== -1) {
        message = message.substring(0, pos).trim();
    }

    return template(
        message,
        commit.sha.substring(0, 7),
        commit.url,
        commit.prNumber,
        pullRequests[`pr_${commit.prNumber}`]
    );
};

function buildMessages(commits: any[], pr: Hash, hideDocs: boolean): Message {
    return new Message({
        fixes: commits.filter(x => x.message.match(/^fix/)).map(x => buildCommitMessage(x, pr)),
        features: commits.filter(x => x.message.match(/^feat/)).map(x => buildCommitMessage(x, pr)),
        docs: !hideDocs ? commits.filter(x => x.message.match(/^docs/)).map(x => buildCommitMessage(x, pr)) : [],
    });
};

function buildReleaseNotes(messages: Message) {
    let notes: string[] = [];

    if (messages.features.length > 0) {
        notes.push('\n### Features\n');
        notes = notes.concat(messages.features.map(msg => `* ${msg}`));
    }

    if (messages.fixes.length > 0) {
        notes.push('\n### Bug Fixes\n');
        notes = notes.concat(messages.fixes.map(msg => `* ${msg}`));
    }

    if (messages.docs.length > 0) {
        notes.push('\n### Documentation\n');
        notes = notes.concat(messages.docs.map(msg => `* ${msg}`));
    }

    return notes.join('\n');
};

function getVersionCommitRegEx(prerelease) {
    return (
        prerelease
            ? /^chore\(release\):\sversion\s\d+\.\d+\.\d+(\s|\-\w+\.\d+)/
            : /^chore\(release\):\sversion\s\d+\.\d+\.\d+\s/
    );
};

async function filterCommits(commits: GithubCommit[], repo: any, prerelease: boolean): Promise<FilteredCommits[]> {

    let filteredCommits: FilteredCommits[] = [];

    let foundPreviousVersionCommit = false;
    let sha;

    // the list of commits started with the commit for this tag so let's start at index 1
    for (let i = 1; i < commits.length; i++) {
        sha = commits[i].sha;
        const message = commits[i].commit.message;
        log.debug('\nRaw Commit Message\n', message);

        // continue gathering commit messages until the previous version commit is found
        if (message.match(getVersionCommitRegEx(prerelease))) {
            foundPreviousVersionCommit = true;
            break;
        }

        // skip over system-generated commits
        if (message.match(/\[ci skip\]$/)) {
            continue;
        }

        let prMatch = message.match(/\(\#\d+\)/);
        if (prMatch) {
            prMatch = prMatch[0].match(/\d+/);
        }

        filteredCommits.push({
            sha: sha,
            url: commits[i].html_url,
            message: message,
            prNumber: (prMatch ? parseInt(prMatch[0], 10) : null)
        });
    }

    // if the number of commits is 0 or 1, we have exhausted ALL commits
    // so it's time to return regardless of whether we found a match or not
    if (!foundPreviousVersionCommit && commits.length > 1) {
        log.debug('Making recursive call - filtered commits count:', filteredCommits.length);
        let moreCommits = await getCommitsFromGithub(repo, sha, prerelease)
        return filteredCommits.concat(moreCommits)
    }

    return filteredCommits;
}

async function getCommitsFromGithub(repo: any, tag: string, prerelease: boolean): Promise<FilteredCommits[]> {
    const resp: { data: GithubCommit[] } = (await repo.listCommits({ sha: tag }))
    const commits = resp.data;
    return await filterCommits(commits, repo, prerelease);
}

async function getPullRequest(repo, prNumber): Promise<Hash> {
    const pr: { data: Pr } = await repo.getPullRequest(prNumber)
    return { [`pr_${pr.data.number}`]: pr.data.html_url }
}

async function getPrsInHash(repo: any, commits: FilteredCommits[]): Promise<Hash> {
    return (await Promise
        .all(commits.filter(commit => !!commit.prNumber)
            .map(commit =>
                getPullRequest(repo, commit.prNumber)
            )))
        .reduce((hash, current) => Object.assign(hash, current), {});
}

export default async function releaseNotes(repo: any, { tag = '', prerelease = false, hideDocs = false, debug = false }: any): Promise<string> {
    const commits: FilteredCommits[] = await getCommitsFromGithub(repo, tag, prerelease);
    const prs = await getPrsInHash(repo, commits);
    const messages = buildMessages(commits, prs, hideDocs);
    return buildReleaseNotes(messages);
};
