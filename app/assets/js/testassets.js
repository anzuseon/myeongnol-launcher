const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

function startTestAssetServer(directory, fileMap = {}){
    const token = crypto.randomBytes(24).toString('hex')
    const server = http.createServer(async (request, response) => {
        const prefix = `/${token}/`
        const requestPath = request.url.split('?')[0]
        if(!requestPath.startsWith(prefix) || !['GET', 'HEAD'].includes(request.method)){
            response.writeHead(404).end()
            return
        }
        let name
        try { name = decodeURIComponent(requestPath.slice(prefix.length)) } catch { response.writeHead(400).end(); return }
        if(!/^[a-zA-Z0-9_.+-]+\.[a-zA-Z0-9]{1,12}$/.test(name)){
            response.writeHead(404).end()
            return
        }
        // Preview maps are built from validated artifacts, never from request paths.
        const mapped = Object.hasOwn(fileMap, name)
        if(!mapped && !/\.(jar|json|png|jpg|jpeg|webp)$/.test(name)){
            response.writeHead(404).end()
            return
        }
        const file = mapped ? fileMap[name] : path.join(directory, name)
        try {
            const canonical = await fs.promises.realpath(file)
            if(mapped ? canonical !== file : path.dirname(canonical) !== await fs.promises.realpath(directory)) throw new Error('Asset path changed')
            const stat = await fs.promises.stat(canonical)
            if(!stat.isFile()) throw new Error('Not an asset file')
            const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' }
            response.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': types[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
            if(request.method === 'HEAD') response.end()
            else fs.createReadStream(canonical).on('error', () => response.destroy()).pipe(response)
        } catch { response.writeHead(404).end() }
    })
    return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}/${token}/` }))
    })
}

function resolveTestAssets(profile, baseUrl){
    const result = structuredClone(profile)
    const resolve = value => value?.startsWith('myeongnol-test-asset://') ? baseUrl + encodeURIComponent(value.slice('myeongnol-test-asset://'.length)) : value
    if(result.icon) result.icon = resolve(result.icon)
    const visit = module => {
        if(module.artifact?.url) module.artifact.url = resolve(module.artifact.url)
        for(const child of module.subModules || []) visit(child)
    }
    for(const module of result.modules) visit(module)
    return result
}

module.exports = { startTestAssetServer, resolveTestAssets }
