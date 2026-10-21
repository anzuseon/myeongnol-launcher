const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const POLICY_PATH = path.join('.myeongnol', 'game-defaults.json')
const booleanKeys = new Set(['fullscreen', 'enableVsync', 'entityShadows', 'bobView', 'autoJump', 'toggleSprint', 'toggleCrouch', 'invertYMouse', 'showSubtitles', 'advancedItemTooltips', 'pauseOnLostFocus'])
const ranges = { maxFps: [10, 260, true], renderDistance: [2, 64, true], simulationDistance: [5, 32, true], guiScale: [0, 8, true], fov: [-1, 1], gamma: [0, 1], mipmapLevels: [0, 4, true], mouseSensitivity: [0, 1], chatScale: [0, 1], chatOpacity: [0, 1] }
const soundChannels = new Set(['master', 'music', 'record', 'weather', 'block', 'hostile', 'neutral', 'player', 'ambient', 'voice', 'ui'])

function validatePolicy(policy){
    if(policy?.schemaVersion !== 1 || typeof policy.enabled !== 'boolean' || !['new', 'once', 'always'].includes(policy.mode)) throw new Error('Invalid game defaults policy')
    if(!policy.options || typeof policy.options !== 'object' || Array.isArray(policy.options) || Object.keys(policy.options).length > 256) throw new Error('Invalid game defaults options')
    if(policy.enabled && !Object.keys(policy.options).length) throw new Error('No game defaults selected')
    for(const [key, value] of Object.entries(policy.options)){
        if(typeof value !== 'string' || /[\r\n\0]/.test(value)) throw new Error('Invalid game defaults value')
        if(booleanKeys.has(key)){
            if(!['true', 'false'].includes(value)) throw new Error(`Invalid boolean: ${key}`)
        } else if(key === 'lang'){
            if(!/^[a-z]{2}_[a-z]{2}$/.test(value)) throw new Error('Invalid language')
        } else if(key === 'particles'){
            if(!['0', '1', '2'].includes(value)) throw new Error('Invalid particles')
        } else if(key === 'renderClouds'){
            if(!['"false"', '"fast"', '"fancy"'].includes(value)) throw new Error('Invalid clouds')
        } else if(/^key_[a-zA-Z0-9_.-]{1,120}$/.test(key)){
            if(!/^key\.(keyboard|mouse)\.[a-z0-9_.-]+$/.test(value)) throw new Error('Invalid key binding')
        } else {
            const range = key.startsWith('soundCategory_') && soundChannels.has(key.slice(14)) ? [0, 1] : (Object.hasOwn(ranges, key) ? ranges[key] : null)
            const number = Number(value)
            if(!range || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) || !Number.isFinite(number) || number < range[0] || number > range[1] || (range[2] && (!Number.isInteger(number) || !/^[+-]?\d+$/.test(value)))) throw new Error(`Unsupported game option or range: ${key}`)
        }
    }
    return policy
}

function mergeOptions(input, options){
    const newline = input.includes('\r\n') ? '\r\n' : '\n'
    const remaining = new Map(Object.entries(options))
    const lines = input.replace(/^\uFEFF/, '').split(/\r?\n/)
    if(lines.at(-1) === '') lines.pop()
    const output = []
    const seen = new Set()
    for(const line of lines){
        const separator = line.indexOf(':')
        const key = separator < 0 ? null : line.slice(0, separator)
        if(Object.hasOwn(options, key)){
            if(!seen.has(key)) output.push(`${key}:${options[key]}`)
            seen.add(key)
            remaining.delete(key)
        } else output.push(line)
    }
    for(const [key, value] of remaining) output.push(`${key}:${value}`)
    return output.join(newline) + newline
}

function atomicWrite(file, data){
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temporary = file + '.tmp-' + crypto.randomBytes(8).toString('hex')
    try {
        fs.writeFileSync(temporary, data, { flag: 'wx' })
        fs.renameSync(temporary, file)
    } finally {
        if(fs.existsSync(temporary)) fs.unlinkSync(temporary)
    }
}

function applyManagedGameSettings(gameDir, { isNewInstance = !fs.existsSync(path.join(gameDir, 'options.txt')) } = {}){
    const policyFile = path.join(gameDir, POLICY_PATH)
    if(!fs.existsSync(policyFile)) return { status: 'no-policy', changed: false }
    if(fs.statSync(policyFile).size > 65536) throw new Error('Game defaults policy exceeds limit')
    const policy = validatePolicy(JSON.parse(fs.readFileSync(policyFile, 'utf8').replace(/^\uFEFF/, '')))
    if(!policy.enabled) return { status: 'disabled', changed: false }
    if(policy.mode === 'new' && !isNewInstance) return { status: 'existing-preserved', changed: false }
    const canonical = { mode: policy.mode, options: Object.fromEntries(Object.entries(policy.options).sort(([a], [b]) => a.localeCompare(b))) }
    const revision = crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
    const stateFile = path.join(gameDir, '.myeongnol', 'game-defaults-state.json')
    let state
    if(fs.existsSync(stateFile)){
        try {
            state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
            if(state?.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(state.revision)) throw new Error('Invalid state')
        } catch {
            if(policy.mode === 'once') throw new Error('Game defaults application state is damaged; existing options were preserved')
            state = null
        }
    }
    if(policy.mode === 'once' && !isNewInstance && state?.schemaVersion === 1 && state.revision === revision) return { status: 'already-applied', changed: false }
    const optionsFile = path.join(gameDir, 'options.txt')
    const before = fs.existsSync(optionsFile) ? fs.readFileSync(optionsFile) : null
    const after = Buffer.from(mergeOptions(before?.toString('utf8') || '', policy.options), 'utf8')
    const changed = before == null || !before.equals(after)
    let backup = null
    if(changed){
        if(before){
            const hash = crypto.createHash('sha256').update(before).digest('hex')
            backup = path.join(gameDir, '.myeongnol', 'options-backups', hash + '.txt')
            if(fs.existsSync(backup)){
                if(!fs.readFileSync(backup).equals(before)) throw new Error('Options backup checksum mismatch')
            } else atomicWrite(backup, before)
        }
        atomicWrite(optionsFile, after)
    }
    atomicWrite(stateFile, JSON.stringify({ schemaVersion: 1, revision, appliedAt: new Date().toISOString() }) + '\n')
    return { status: 'applied', changed, backup }
}

module.exports = { applyManagedGameSettings, mergeOptions, validatePolicy, POLICY_PATH }
