const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const RAW_PREFIX = 'https://raw.githubusercontent.com/anzuseon/myeongnol-distribution/main/'

// Explicit opt-in for the administrator's PC. Normal launcher users never read a
// deployment directory, and cannot receive this local preview setting remotely.
function loadManagedPreview(configPath){
    if(!fs.existsSync(configPath)) return null
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''))
    if(config.schemaVersion !== 1 || typeof config.distributionRoot !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/.test(config.serverId)) throw new Error('Invalid manager preview setting')
    // Use the native Windows canonicalization for both registration and serving.
    // Runner/user TEMP paths may contain 8.3 aliases such as RUNNER~1.
    const root = fs.realpathSync.native(config.distributionRoot)
    const within = value => {
        const file = fs.realpathSync.native(value)
        const relative = path.relative(root, file)
        if(relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative) || !fs.statSync(file).isFile()) throw new Error('Preview artifact escapes distribution root')
        return file
    }
    const distribution = JSON.parse(fs.readFileSync(within(path.join(root, 'distribution.json')), 'utf8').replace(/^\uFEFF/, ''))
    const source = distribution.servers.find(server => server.id === config.serverId)
    if(!source) throw new Error('Managed preview server does not exist')
    const server = structuredClone(source)
    const fileMap = {}
    let next = 0
    const register = file => {
        file = within(file)
        const extension = path.extname(file).toLowerCase()
        if(!/^\.[a-z0-9]{1,12}$/.test(extension)) throw new Error('Unsupported preview artifact extension')
        const name = `managed-${next++}${extension}`
        fileMap[name] = file
        return `myeongnol-test-asset://${name}`
    }
    const rawFile = url => {
        if(typeof url !== 'string' || !url.startsWith(RAW_PREFIX)) return null
        return within(path.join(root, decodeURIComponent(url.slice(RAW_PREFIX.length).split('?')[0])))
    }
    const serverRoot = path.join(root, 'servers', config.serverId)
    const visit = module => {
        if(module.artifact){
            let file
            if(module.type === 'FabricMod'){
                const name = decodeURIComponent(new URL(module.artifact.url).pathname.split('/').pop())
                if(name !== path.basename(name) || /[\\/]/.test(name)) throw new Error('Invalid preview mod filename')
                file = within(path.join(serverRoot, 'fabricmods', 'required', name))
            } else if(module.type === 'File'){
                const relative = module.artifact.path
                if(typeof relative !== 'string' || path.isAbsolute(relative) || /(^|[\\/])\.\.([\\/]|$)/.test(relative) || relative.includes(':')) throw new Error('Invalid preview file path')
                file = within(path.join(serverRoot, 'files', relative))
            } else {
                file = rawFile(module.artifact.url)
            }
            if(file) module.artifact.url = register(file)
        }
        for(const child of module.subModules || []) visit(child)
    }
    for(const module of server.modules) visit(module)
    const icon = rawFile(server.icon)
    if(icon) server.icon = register(icon)
    let backgroundUrl = null
    const appearance = path.join(root, 'launcher', 'appearance.json')
    if(fs.existsSync(appearance)){
        const manifest = JSON.parse(fs.readFileSync(within(appearance), 'utf8').replace(/^\uFEFF/, ''))
        const image = rawFile(manifest.background?.url)
        if(image) backgroundUrl = pathToFileURL(image).href
    }
    return { server, fileMap, backgroundUrl }
}

module.exports = { loadManagedPreview }
