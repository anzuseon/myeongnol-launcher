const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { loadManagedPreview } = require('../app/assets/js/managedpreview')
const { startTestAssetServer, resolveTestAssets } = require('../app/assets/js/testassets')
const { mergeTestServer, TestDistributionAPI } = require('../app/assets/js/testdistribution')
const { escapeServerText } = require('../app/assets/js/servertext')

async function fixture(){
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'myeongnol-manager-preview-'))
    const prefix = 'https://raw.githubusercontent.com/anzuseon/myeongnol-distribution/main/'
    const write = async (relative, data) => { await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true }); await fs.writeFile(path.join(root, relative), data) }
    await write('servers/Test-26.3/fabricmods/required/party.jar', 'party-voice-contents')
    await write('servers/Test-26.3/files/config/custom.json', '{"setting":true}')
    await write('servers/Test-26.3/logo.png', 'logo-content')
    await write('launcher/backgrounds/bg.png', 'background-content')
    await write('launcher/appearance.json', JSON.stringify({ schemaVersion: 1, background: { url: prefix + 'launcher/backgrounds/bg.png' } }))
    const server = { id: 'Test-26.3', name: '사용자 이름 <&>', description: '사용자 설명', icon: prefix + 'servers/Test-26.3/logo.png', version: '1.0.1', modules: [
        { type: 'FabricMod', artifact: { url: prefix + 'servers/Test-26.3/fabricmods/required/party.jar' } },
        { type: 'File', artifact: { url: prefix + 'servers/Test-26.3/files/config/custom.json', path: 'config/custom.json' } }
    ] }
    await write('distribution.json', JSON.stringify({ servers: [server] }))
    const config = path.join(root, 'preview.json')
    await fs.writeFile(config, JSON.stringify({ schemaVersion: 1, distributionRoot: root, serverId: server.id }))
    return { root, config, server, write }
}

test('manager preview serves selected mods, config and logo without publishing', async t => {
    const { root, config } = await fixture()
    const preview = loadManagedPreview(config)
    const bundled = path.join(root, 'bundled-test-assets')
    await fs.mkdir(bundled)
    const { server, baseUrl } = await startTestAssetServer(bundled, preview.fileMap)
    t.after(() => new Promise(resolve => server.close(resolve)))
    const profile = resolveTestAssets(preview.server, baseUrl)
    assert.equal(profile.name, '사용자 이름 <&>')
    const modResponse = await fetch(profile.modules[0].artifact.url)
    assert.equal(modResponse.status, 200, JSON.stringify(await Promise.all(Object.entries(preview.fileMap).map(async ([name, file]) => ({ name, registered: file, canonical: await fs.realpath(file) })))) )
    assert.equal(await modResponse.text(), 'party-voice-contents')
    assert.equal(await (await fetch(profile.modules[1].artifact.url)).text(), '{"setting":true}')
    assert.equal(await (await fetch(profile.icon)).text(), 'logo-content')
    assert.ok(preview.backgroundUrl.startsWith('file:///'))
    assert.equal((await fetch(baseUrl + 'preview.json')).status, 404)
    assert.equal((await fetch(baseUrl + '%2e%2e%2fpreview.json')).status, 404)
})

test('preview is opt-in and rejects absent servers and escaped paths', async () => {
    const { config, server, write } = await fixture()
    assert.equal(loadManagedPreview(config + '.absent'), null)
    server.modules[1].artifact.path = '../escape.json'
    await write('distribution.json', JSON.stringify({ servers: [server] }))
    assert.throws(() => loadManagedPreview(config), /Invalid preview file path/)
    server.modules = []
    server.id = 'Other'
    await write('distribution.json', JSON.stringify({ servers: [server] }))
    assert.throws(() => loadManagedPreview(config), /does not exist/)
})

test('published equal-version customization wins over bundled metadata', () => {
    const bundled = { id: 'Test-26.3', version: '1.0.1', name: 'old', description: 'old', icon: 'old.png', modules: [] }
    const published = { ...bundled, name: 'custom', description: 'custom description', icon: 'latest.png' }
    const value = mergeTestServer({ servers: [published] }, bundled)
    assert.equal(value.servers[0].name, 'custom')
    assert.equal(value.servers[0].description, 'custom description')
    assert.equal(value.servers[0].icon, 'latest.png')
})

test('manager preview overrides only the selected server and persists for workers', async () => {
    const production = { id: 'Production', version: '9.0.0', mainServer: true }
    const bundled = { id: 'Test-26.3', version: '1.0.0', modules: [] }
    const local = { ...bundled, name: 'my draft', version: '1.0.1' }
    const api = new TestDistributionAPI(bundled, os.tmpdir(), os.tmpdir(), os.tmpdir(), 'https://example.invalid', false)
    api.managedServer = local
    api.pullRemote = async () => ({ data: { servers: [production, { ...bundled, version: '9.0.0' }] } })
    let cached
    api.writeDistributionToDisk = async value => { cached = value }
    await api.loadDistribution()
    assert.deepEqual(cached.servers[0], production)
    assert.equal(cached.servers[1].name, 'my draft')
    assert.equal(cached.servers.length, 2)
})

test('custom server text renders literal HTML characters', () => {
    assert.equal(escapeServerText('<b>"name"</b> & \'text\''), '&lt;b&gt;&quot;name&quot;&lt;/b&gt; &amp; &#39;text&#39;')
})
