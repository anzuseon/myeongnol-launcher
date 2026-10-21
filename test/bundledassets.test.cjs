const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { prepareAssets } = require('../tools/prepare-bundled-assets.cjs')

async function fixture(){
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'myeongnol-bundled-assets-'))
    const directory = path.join(root, 'libraries/test-mods')
    await fs.mkdir(directory, { recursive: true })
    const content = Buffer.from('verified-bundled-mod')
    const asset = { filename: 'voice.jar', size: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex'), url: 'https://github.com/anzuseon/myeongnol-launcher/releases/download/v1.0.22/voice.jar' }
    const save = () => fs.writeFile(path.join(directory, 'bundled-assets.json'), JSON.stringify({ schemaVersion: 1, assets: [asset] }))
    await save()
    return { root, directory, content, asset, save }
}

test('cold builds download pinned assets once and subsequent builds reuse verified bytes', async () => {
    const { root, directory, content } = await fixture()
    let requests = 0
    const download = async () => { requests++; return new Response(content) }
    await prepareAssets(root, { download, log: () => {} })
    assert.deepEqual(await fs.readFile(path.join(directory, 'voice.jar')), content)
    await prepareAssets(root, { download, log: () => {} })
    assert.equal(requests, 1)
})

test('invalid downloads never replace an existing asset', async () => {
    const { root, directory } = await fixture()
    const existing = Buffer.from('existing-invalid-mod')
    await fs.writeFile(path.join(directory, 'voice.jar'), existing)
    await assert.rejects(prepareAssets(root, { download: async () => new Response('bad'), log: () => {} }), /checksum/)
    assert.deepEqual(await fs.readFile(path.join(directory, 'voice.jar')), existing)
    assert.equal((await fs.readdir(directory)).some(name => name.includes('.download-')), false)
})

test('asset manifests cannot escape their directory or request another host', async () => {
    const { root, asset, save } = await fixture()
    asset.filename = '../outside.jar'
    await save()
    await assert.rejects(prepareAssets(root), /Invalid bundled asset/)
    asset.filename = 'voice.jar'
    asset.url = 'https://example.invalid/mod.jar'
    await save()
    await assert.rejects(prepareAssets(root), /URL/)
})
