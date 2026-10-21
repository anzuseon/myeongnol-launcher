const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mergeTestServer, TestDistributionAPI } = require('../app/assets/js/testdistribution')

test('test profile preserves production server, defaults and modules', () => {
    const production = { id: 'Myeongnol-26.2', mainServer: true, modules: [{ id: 'unchanged' }] }
    const original = { version: '1', servers: [production] }
    const profile = { id: 'Myeongnol-Test-26.3', mainServer: false, autoconnect: false }
    const merged = mergeTestServer(original, profile)
    assert.equal(merged.servers[0], production)
    assert.deepEqual(original.servers, [production])
    assert.deepEqual(merged.servers[1], profile)
    assert.notEqual(merged.servers[1], profile)
})

test('published test profile wins and refreshes never duplicate it', () => {
    const profile = { id: 'Myeongnol-Test-26.3', version: '1.0.0' }
    const published = { ...profile, version: '1.0.1' }
    const original = { servers: [published] }
    assert.equal(mergeTestServer(original, profile), original)
    const initial = mergeTestServer({ servers: [] }, profile)
    assert.equal(mergeTestServer(initial, profile).servers.length, 1)
    assert.equal(mergeTestServer(null, profile), null)
})

test('cached profiles receive the new session asset URL without duplicating the server', () => {
    const old = { id: 'Myeongnol-Test-26.3', version: '1.0.0', modules: [{ artifact: { url: 'http://127.0.0.1:1/old/client.jar' } }] }
    const current = { ...old, modules: [{ artifact: { url: 'http://127.0.0.1:2/new/client.jar' } }] }
    const merged = mergeTestServer({ servers: [old] }, current)
    assert.equal(merged.servers.length, 1)
    assert.equal(merged.servers[0].modules[0].artifact.url, current.modules[0].artifact.url)
})

test('remote refresh persists the test server before local-only asset workers load the cache', async () => {
    const profile = { id: 'Myeongnol-Test-26.3', version: '1.0.0', modules: [] }
    const api = new TestDistributionAPI(profile, process.cwd(), process.cwd(), process.cwd(), 'https://example.invalid/distribution.json', false)
    let cached
    api.pullRemote = async () => ({ data: { servers: [{ id: 'Myeongnol-26.2' }] } })
    api.writeDistributionToDisk = async value => { cached = value }
    await api.loadDistribution()
    assert.deepEqual(cached.servers.map(server => server.id), ['Myeongnol-26.2', profile.id])
    api.pullLocal = async () => cached
    const workers = await api.pullLocal()
    assert.equal(workers.servers[1].id, profile.id)
})
