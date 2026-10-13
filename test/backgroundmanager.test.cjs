const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { fileURLToPath } = require('node:url')
const { BackgroundManager } = require('../app/assets/js/backgroundmanager')

const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5d8AAAAASUVORK5CYII=', 'base64')
const digest = data => crypto.createHash('sha256').update(data).digest('hex')
async function fixture(t){
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'myeongnol-appearance-'))
    t.after(async () => {
        assert.ok(path.resolve(directory).startsWith(path.join(os.tmpdir(), 'myeongnol-appearance-')))
        await fs.rm(directory, { recursive: true, force: true })
    })
    let bytes = image
    let manifest = { schemaVersion: 1, background: { url: 'https://example.com/background.png', sha256: digest(bytes) } }
    let offline = false
    let imageRequests = 0
    let decodeError = false
    const options = {
        cacheDirectory: directory,
        download: async url => {
            if(offline) throw Error('Offline')
            if(url.includes('appearance.json')) return Buffer.from(JSON.stringify(manifest))
            imageRequests++
            return bytes
        },
        validateImage: async () => {
            if(decodeError) throw Error('Image decode failed')
        }
    }
    return {
        directory, options,
        manager: new BackgroundManager(options),
        setOffline: value => { offline = value },
        setManifest: value => { manifest = value },
        setDecodeError: value => { decodeError = value },
        changeImage: value => {
            bytes = value
            manifest.background.sha256 = digest(value)
        },
        imageRequests: () => imageRequests
    }
}
test('loads a new background, avoids repeated image downloads, and survives offline restarts', async t => {
    const f = await fixture(t)
    assert.equal(await f.manager.getCachedBackground(), null)
    const first = await f.manager.refresh()
    assert.deepEqual(await fs.readFile(fileURLToPath(first.url)), image)
    assert.equal((await f.manager.refresh()).url, first.url)
    assert.equal(f.imageRequests(), 1)
    f.setOffline(true)
    const restarted = new BackgroundManager(f.options)
    assert.equal((await restarted.getCachedBackground()).url, first.url)
    await assert.rejects(restarted.refresh(), /Offline/)
    assert.equal((await restarted.getCachedBackground()).url, first.url)
})
test('refreshes changed server images and preserves the last good background after bad updates', async t => {
    const f = await fixture(t)
    const first = await f.manager.refresh()
    const next = Buffer.concat([image, Buffer.from('new revision')])
    f.changeImage(next)
    const updated = await f.manager.refresh()
    assert.notEqual(updated.url, first.url)
    assert.deepEqual(await fs.readFile(fileURLToPath(updated.url)), next)
    f.setManifest({ schemaVersion: 1, background: { url: 'https://example.com/bad.png', sha256: '0'.repeat(64) } })
    await assert.rejects(f.manager.refresh(), /checksum/)
    assert.equal((await f.manager.getCachedBackground()).url, updated.url)
})
test('rejects invalid manifests and insecure image URLs without writing a cache', async t => {
    const f = await fixture(t)
    for(const manifest of [
        { schemaVersion: 2, background: { sha256: digest(image) } },
        { schemaVersion: 1, background: { url: 'http://example.com/art.png', sha256: digest(image) } },
        { schemaVersion: 1, background: { url: 'https://user:password@example.com/art.png', sha256: digest(image) } },
        { schemaVersion: 1, background: { url: 'file:///tmp/art.png', sha256: digest(image) } }
    ]){
        f.setManifest(manifest)
        await assert.rejects(f.manager.refresh())
        assert.equal(await f.manager.getCachedBackground(), null)
    }
})
test('rejects images that fail decoding and recovers a damaged cached file', async t => {
    const f = await fixture(t)
    f.setDecodeError(true)
    await assert.rejects(f.manager.refresh(), /decode/)
    f.setDecodeError(false)
    const good = await f.manager.refresh()
    await fs.writeFile(fileURLToPath(good.url), 'corrupt')
    assert.equal(await f.manager.getCachedBackground(), null)
    assert.equal((await f.manager.refresh()).url, good.url)
    assert.deepEqual(await fs.readFile(fileURLToPath(good.url)), image)
})
test('rejects non-raster content and shares concurrent refresh requests', async t => {
    const f = await fixture(t)
    const first = f.manager.refresh()
    assert.equal(f.manager.refresh(), first)
    await first
    assert.equal(f.imageRequests(), 1)
    f.changeImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))
    await assert.rejects(f.manager.refresh(), /PNG, JPEG or WebP/)
    assert.ok(await f.manager.getCachedBackground())
})

