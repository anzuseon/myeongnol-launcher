const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { createReadStream, createWriteStream } = require('node:fs')
const { Readable } = require('node:stream')
const { pipeline } = require('node:stream/promises')

async function digest(file){
    const hash = crypto.createHash('sha256')
    for await(const chunk of createReadStream(file)) hash.update(chunk)
    return hash.digest('hex')
}

async function prepareAssets(root, { download = fetch, log = console.log } = {}){
    const directory = path.join(root, 'libraries', 'test-mods')
    const manifest = JSON.parse(await fs.readFile(path.join(directory, 'bundled-assets.json'), 'utf8'))
    if(manifest.schemaVersion !== 1 || !Array.isArray(manifest.assets)) throw new Error('Invalid bundled assets manifest')
    for(const asset of manifest.assets){
        if(!/^[a-zA-Z0-9_.+-]+\.jar$/.test(asset.filename) || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.size) || asset.size <= 0) throw new Error('Invalid bundled asset')
        const url = new URL(asset.url)
        if(url.protocol !== 'https:' || url.host !== 'github.com' || url.username || url.password || !url.pathname.startsWith('/anzuseon/myeongnol-launcher/releases/download/')) throw new Error('Invalid bundled asset URL')
        const target = path.join(directory, asset.filename)
        const stat = await fs.stat(target).catch(() => null)
        if(stat?.isFile() && stat.size === asset.size && await digest(target) === asset.sha256){ log(`Verified ${asset.filename}`); continue }
        const temporary = target + `.download-${process.pid}`
        try {
            log(`Downloading ${asset.filename}`)
            const response = await download(url.href)
            if(!response.ok || !response.body) throw new Error(`Bundled asset download failed: ${response.status}`)
            await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: 'wx' }))
            if((await fs.stat(temporary)).size !== asset.size || await digest(temporary) !== asset.sha256) throw new Error('Bundled asset checksum mismatch')
            await fs.rename(temporary, target)
        } finally {
            await fs.unlink(temporary).catch(error => { if(error.code !== 'ENOENT') throw error })
        }
    }
}

if(require.main === module) prepareAssets(path.join(__dirname, '..')).catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { prepareAssets }
