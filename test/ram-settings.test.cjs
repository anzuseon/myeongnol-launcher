const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const sourcePath = path.resolve(__dirname, '../app/assets/js/configmanager.js')
const realRequire = createRequire(sourcePath)
const source = fs.readFileSync(sourcePath, 'utf8')

function manager(t, { memory = 16, existing } = {}){
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'myeongnol-ram-'))
    const userData = path.join(directory, 'user-data')
    fs.mkdirSync(userData)
    if(existing) fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify(existing))
    t.after(() => {
        assert.ok(path.resolve(directory).startsWith(path.join(os.tmpdir(), 'myeongnol-ram-')))
        fs.rmSync(directory, { recursive: true, force: true })
    })
    const api = {}
    const context = {
        exports: api,
        require: name => {
            if(name === '@electron/remote') return { app: { getPath: () => userData } }
            if(name === 'helios-core') return { LoggerUtil: { getLogger: () => ({ info(){}, error(){}, warn(){}, debug(){} }) } }
            if(name === 'os') return { ...os, totalmem: () => memory * 1073741824 }
            return realRequire(name)
        },
        process: { platform: process.platform, env: { APPDATA: directory } }
    }
    vm.runInNewContext(source, context, { filename: sourcePath })
    api.load()
    return { api, saved: () => JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8')) }
}
const java = { suggestedMajor: 25 }

test('new profiles use a 6G minimum and maximum, including 8 GiB machines', t => {
    for(const memory of [4, 8, 16, 32]){
        const { api } = manager(t, { memory })
        api.ensureJavaConfig('main', java)
        assert.equal(api.getMinRAM('main'), '6G')
        assert.equal(api.getMaxRAM('main'), '6G')
        assert.equal(api.getAbsoluteMinRAM(), 6)
        assert.ok(api.getAbsoluteMaxRAM() >= api.getAbsoluteMinRAM())
    }
})
test('server minimums and larger recommendations are respected', t => {
    const { api } = manager(t)
    api.ensureJavaConfig('higherMinimum', java, { minimum: 8192, recommended: 4096 })
    assert.equal(api.getMinRAM('higherMinimum'), '8G')
    assert.equal(api.getMaxRAM('higherMinimum'), '8G')
    api.ensureJavaConfig('recommended', java, { minimum: 2048, recommended: 12288 })
    assert.equal(api.getMinRAM('recommended'), '6G')
    assert.equal(api.getMaxRAM('recommended'), '12288M')
    api.ensureJavaConfig('java8', { suggestedMajor: 8 })
    assert.equal(api.getMinRAM('java8'), '6G')
})
test('existing lower allocations migrate while Java paths, account data, and higher RAM remain intact', t => {
    const account = { uuid: 'existing-account', displayName: 'Existing User' }
    const { api, saved } = manager(t, { existing: {
        selectedAccount: 'existing-account', authenticationDatabase: { 'existing-account': account },
        javaConfig: {
            lower: { minRAM: '3G', maxRAM: '4096M', executable: 'C:/Java/bin/javaw.exe', jvmOptions: ['-XX:+UseG1GC'] },
            higher: { minRAM: '8192M', maxRAM: '12288M', executable: 'C:/Custom/javaw.exe', jvmOptions: ['-Dcustom=true'] },
            mixed: { minRAM: '2G', maxRAM: '10G', executable: null, jvmOptions: [] }
        }
    } })
    assert.equal(api.getMinRAM('lower'), '6G')
    assert.equal(api.getMaxRAM('lower'), '6G')
    assert.equal(api.getJavaExecutable('lower'), 'C:/Java/bin/javaw.exe')
    assert.equal(api.getMinRAM('higher'), '8192M')
    assert.equal(api.getMaxRAM('higher'), '12288M')
    assert.equal(api.getMinRAM('mixed'), '6G')
    assert.equal(api.getMaxRAM('mixed'), '10G')
    const stored = saved()
    assert.deepEqual(stored.authenticationDatabase['existing-account'], account)
    assert.deepEqual(stored.javaConfig.higher.jvmOptions, ['-Dcustom=true'])
    assert.equal(stored.javaConfig.lower.minRAM, '6G')
    assert.equal(stored.javaConfig.lower.maxRAM, '6G')
})
test('refreshing an existing server applies a stricter minimum without reducing its maximum', t => {
    const { api } = manager(t)
    api.ensureJavaConfig('main', java)
    api.setMaxRAM('main', '12G')
    api.ensureJavaConfig('main', java, { minimum: 8192 })
    assert.equal(api.getMinRAM('main'), '8G')
    assert.equal(api.getMaxRAM('main'), '12G')
})
test('setters cannot save less than 6G or leave maximum below minimum', t => {
    const { api, saved } = manager(t)
    api.ensureJavaConfig('main', java)
    api.setMinRAM('main', '2G')
    assert.equal(api.getMinRAM('main'), '6G')
    api.setMinRAM('main', '8G')
    assert.equal(api.getMaxRAM('main'), '8G')
    api.setMaxRAM('main', '4096M')
    assert.equal(api.getMinRAM('main'), '6G')
    assert.equal(api.getMaxRAM('main'), '6G')
    api.setMaxRAM('main', '10240M')
    api.save()
    assert.equal(saved().javaConfig.main.maxRAM, '10240M')
})
test('a fixed 6-to-6 slider range has finite metadata', () => {
    const settings = fs.readFileSync(path.resolve(__dirname, '../app/assets/js/scripts/settings.js'), 'utf8')
    const start = settings.indexOf('function calculateRangeSliderMeta(v){')
    const end = settings.indexOf('\n}', start) + 2
    const context = {}
    vm.createContext(context)
    vm.runInContext(settings.slice(start, end), context)
    const slider = (min, max) => ({ getAttribute: key => ({ min, max, step: .5 })[key] })
    const fixed = context.calculateRangeSliderMeta(slider(6, 6))
    assert.equal(fixed.inc, 0)
    assert.ok(Number.isFinite(fixed.inc))
    assert.equal(context.calculateRangeSliderMeta(slider(6, 8)).inc, 25)
})

