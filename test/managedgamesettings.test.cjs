const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { applyManagedGameSettings, validatePolicy, POLICY_PATH } = require('../app/assets/js/managedgamesettings')
const { seedInitialGameSettings } = require('../app/assets/js/initialgamesettings')

function fixture(mode = 'new', options = { lang: 'ko_kr', maxFps: '60' }){
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myeongnol-game-defaults-'))
    const writePolicy = (updates = {}) => {
        const policy = { schemaVersion: 1, enabled: true, mode, options, ...updates }
        fs.mkdirSync(path.dirname(path.join(dir, POLICY_PATH)), { recursive: true })
        fs.writeFileSync(path.join(dir, POLICY_PATH), JSON.stringify(policy))
    }
    writePolicy()
    return { dir, writePolicy, file: path.join(dir, 'options.txt') }
}

test('new instances receive selected defaults after the existing shader bootstrap', () => {
    const { dir, file } = fixture('new', { lang: 'ko_kr', maxFps: '60', soundCategory_master: '0.4' })
    seedInitialGameSettings(dir)
    const iris = fs.readFileSync(path.join(dir, 'config/iris.properties'))
    const result = applyManagedGameSettings(dir, { isNewInstance: true })
    assert.equal(result.changed, true)
    const options = fs.readFileSync(file, 'utf8')
    assert.match(options, /^lang:ko_kr$/m)
    assert.match(options, /^maxFps:60$/m)
    assert.match(options, /^soundCategory_master:0.4$/m)
    assert.match(options, /^guiScale:2$/m)
    assert.deepEqual(fs.readFileSync(path.join(dir, 'config/iris.properties')), iris)
})

test('first-run defaults leave existing options byte-identical', () => {
    const { dir, file } = fixture()
    const original = Buffer.from('maxFps:240\r\nlang:en_us\r\nresourcePacks:["file/private:pack.zip"]\r\n')
    fs.writeFileSync(file, original)
    assert.equal(applyManagedGameSettings(dir).status, 'existing-preserved')
    assert.deepEqual(fs.readFileSync(file), original)
    assert.equal(fs.existsSync(path.join(dir, '.myeongnol/game-defaults-state.json')), false)
})

test('once-per-revision backs up options and preserves later player edits', () => {
    const { dir, file, writePolicy } = fixture('once')
    const original = 'maxFps:240\r\nlang:en_us\r\nkey_key.jump:key.keyboard.j\r\nresourcePacks:["file/a:b.zip"]\r\nmod_option:abc:def\r\n'
    fs.writeFileSync(file, original)
    const applied = applyManagedGameSettings(dir)
    assert.equal(fs.readFileSync(applied.backup, 'utf8'), original)
    assert.match(fs.readFileSync(file, 'utf8'), /mod_option:abc:def\r\n/)
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('maxFps:60', 'maxFps:180'))
    assert.equal(applyManagedGameSettings(dir).status, 'already-applied')
    assert.match(fs.readFileSync(file, 'utf8'), /maxFps:180/)
    writePolicy({ options: { maxFps: '90', lang: 'ko_kr' } })
    assert.equal(applyManagedGameSettings(dir).changed, true)
    assert.match(fs.readFileSync(file, 'utf8'), /maxFps:90/)
    assert.match(fs.readFileSync(file, 'utf8'), /key_key.jump:key.keyboard.j/)
})

test('reordered policy fields do not reset once-applied preferences', () => {
    const { dir, file, writePolicy } = fixture('once')
    fs.writeFileSync(file, 'maxFps:200\n')
    applyManagedGameSettings(dir)
    fs.writeFileSync(file, 'maxFps:180\n')
    writePolicy({ options: { maxFps: '60', lang: 'ko_kr' } })
    assert.equal(applyManagedGameSettings(dir).status, 'already-applied')
    assert.equal(fs.readFileSync(file, 'utf8'), 'maxFps:180\n')
})

test('always mode overrides selected values while retaining all other settings', () => {
    const { dir, file } = fixture('always', { maxFps: '60' })
    fs.writeFileSync(file, 'maxFps:120\nmaxFps:240\nlang:en_us\nkey_mod.toggle:key.keyboard.v\n')
    applyManagedGameSettings(dir)
    assert.equal(fs.readFileSync(file, 'utf8'), 'maxFps:60\nlang:en_us\nkey_mod.toggle:key.keyboard.v\n')
    fs.writeFileSync(file, 'maxFps:180\nlang:en_us\n')
    applyManagedGameSettings(dir)
    assert.match(fs.readFileSync(file, 'utf8'), /maxFps:60/)
})

test('disabled tombstones stop an earlier always policy', () => {
    const { dir, file, writePolicy } = fixture('always')
    fs.writeFileSync(file, 'maxFps:240\n')
    applyManagedGameSettings(dir)
    writePolicy({ enabled: false })
    fs.writeFileSync(file, 'maxFps:180\n')
    assert.equal(applyManagedGameSettings(dir).status, 'disabled')
    assert.equal(fs.readFileSync(file, 'utf8'), 'maxFps:180\n')
})

test('private keys, invalid ranges and newline injection are rejected before writes', () => {
    const { dir, file, writePolicy } = fixture('once')
    const original = 'maxFps:180\n'
    fs.writeFileSync(file, original)
    for(const options of [{ lastServer: 'private' }, { resourcePacks: '[]' }, { constructor: '1' }, { maxFps: '9999' }, { guiScale: '1.5' }, { lang: 'ko_kr\nmaxFps:2' }]){
        writePolicy({ options })
        assert.throws(() => applyManagedGameSettings(dir))
        assert.equal(fs.readFileSync(file, 'utf8'), original)
    }
})

test('explicit key binding defaults do not touch other bindings', () => {
    const { dir, file } = fixture('once', { 'key_key.jump': 'key.keyboard.space' })
    fs.writeFileSync(file, 'key_key.jump:key.keyboard.j\nkey_mod.party:key.keyboard.p\n')
    applyManagedGameSettings(dir)
    assert.match(fs.readFileSync(file, 'utf8'), /key_key.jump:key.keyboard.space/)
    assert.match(fs.readFileSync(file, 'utf8'), /key_mod.party:key.keyboard.p/)
})

test('corrupt once-only state preserves current settings rather than reapplying', () => {
    const { dir, file } = fixture('once')
    fs.writeFileSync(file, 'maxFps:180\n')
    fs.writeFileSync(path.join(dir, '.myeongnol/game-defaults-state.json'), '{bad')
    assert.throws(() => applyManagedGameSettings(dir), /state is damaged/)
    assert.equal(fs.readFileSync(file, 'utf8'), 'maxFps:180\n')
})

test('missing policy and invalid schema never create game options', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myeongnol-no-game-defaults-'))
    assert.equal(applyManagedGameSettings(dir).status, 'no-policy')
    assert.equal(fs.existsSync(path.join(dir, 'options.txt')), false)
    assert.throws(() => validatePolicy({ schemaVersion: 99, enabled: true, mode: 'new', options: {} }))
})
