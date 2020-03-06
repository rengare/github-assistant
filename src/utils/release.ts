import { Release } from "./data.types";

async function createRelease(repo, argv, notes: string, tag: string): Promise<void> {
    console.info(notes);

    const response = await repo.createRelease({
        'tag_name': tag,
        'target_commitish': argv.branch,
        'name': `Release ${tag}`,
        'body': notes,
        'draft': false,
        'prerelease': argv.prerelease
    })

    console.info('\nCreated release:', response.data.id, response.data.name, '\n\n');
}

function onReleaseExist(): void {
    console.error('release exist')
}

export async function release(repo, argv, notes: string): Promise<void> {
    const tag: string = (argv.tag as string).includes('v') ? argv.tag : `v${argv.tag}`;
    const tagWithoutV = tag.replace('v', '');

    const response: { data: Release[] } = await repo.listReleases();
    
    const isReleaseExist = response.data
    .some(release => release.tag_name.includes(tagWithoutV))
    
    // if release exist and code tries to create same release 
    // then github api throws error code 422: unprocessable entity
    isReleaseExist ? onReleaseExist() : createRelease(repo, argv, notes, tag);
}
