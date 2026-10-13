const crypto = require('crypto')
const fs = require('fs/promises')
const https = require('https')
const path = require('path')
const { pathToFileURL } = require('url')

const MANIFEST_URL = 'https://raw.githubusercontent.com/anzuseon/myeongnol-distribution/main/launcher/appearance.json'
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_MANIFEST_BYTES = 32 * 1024

function secureUrl(value){
    const url = new URL(value)
    if(url.protocol !== 'https:' || url.username || url.password){
        throw new Error('Appearance URLs must use HTTPS without credentials')
    }
    return url
}

function downloadHttps(value, maxBytes, redirects = 0){
    return new Promise((resolve, reject) => {
        const url = secureUrl(value)
        const request = https.get(url, {
            headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Myeongnol-Launcher' }
        }, response => {
            if([301, 302, 303, 307, 308].includes(response.statusCode)){
                response.resume()
                clearTimeout(timer)
                if(redirects >= 3 || !response.headers.location){
                    reject(new Error('Too many appearance redirects'))
                    return
                }
                try {
                    const next = secureUrl(new URL(response.headers.location, url).href)
                    downloadHttps(next.href, maxBytes, redirects + 1).then(resolve, reject)
                } catch(error) {
                    reject(error)
                }
                return
            }
            if(response.statusCode !== 200){
                response.resume()
                reject(new Error('Appearance HTTP status ' + response.statusCode))
                return
            }
            let size = 0
            const chunks = []
            response.on('data', chunk => {
                size += chunk.length
                if(size > maxBytes){
                    request.destroy(new Error('Appearance response exceeds size limit'))
                } else {
                    chunks.push(chunk)
                }
            })
            response.on('end', () => resolve(Buffer.concat(chunks)))
            response.on('error', reject)
            response.on('aborted', () => reject(new Error('Appearance response interrupted')))
        })
        const timer = setTimeout(() => request.destroy(new Error('Appearance request timed out')), 8000)
        request.on('error', reject)
        request.on('close', () => clearTimeout(timer))
    })
}

function imageFormat(data){
    if(data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png'
    if(data.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return 'jpg'
    if(data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'webp'
    throw new Error('Appearance background must be PNG, JPEG or WebP')
}

function sha256(data){
    return crypto.createHash('sha256').update(data).digest('hex')
}

class BackgroundManager {
    constructor({ cacheDirectory, manifestUrl = MANIFEST_URL, download = downloadHttps, validateImage }){
        this.cacheDirectory = cacheDirectory
        this.manifestUrl = secureUrl(manifestUrl).href
        this.download = download
        this.validateImage = validateImage
        this.inFlight = null
    }

    async getCachedBackground(){
        try {
            const metadata = JSON.parse(await fs.readFile(path.join(this.cacheDirectory, 'current.json'), 'utf8'))
            if(!/^[a-f0-9]{64}$/.test(metadata.sha256) || !['png', 'jpg', 'webp'].includes(metadata.format)) return null
            const filename = path.join(this.cacheDirectory, metadata.sha256 + '.' + metadata.format)
            if((await fs.stat(filename)).size > MAX_IMAGE_BYTES) return null
            const data = await fs.readFile(filename)
            if(sha256(data) !== metadata.sha256 || imageFormat(data) !== metadata.format) return null
            await this.validateImage(data, metadata.format)
            return { url: pathToFileURL(filename).href, sha256: metadata.sha256 }
        } catch(_error) {
            return null
        }
    }

    refresh(){
        if(!this.inFlight){
            this.inFlight = this.fetchBackground().finally(() => { this.inFlight = null })
        }
        return this.inFlight
    }

    async fetchBackground(){
        // Bust intermediary caches so editing the manifest can update an open launcher.
        const endpoint = new URL(this.manifestUrl)
        endpoint.searchParams.set('_', Date.now().toString())
        const raw = await this.download(endpoint.href, MAX_MANIFEST_BYTES)
        if(raw.length > MAX_MANIFEST_BYTES) throw new Error('Appearance manifest exceeds size limit')
        const manifest = JSON.parse(raw.toString('utf8'))
        if(manifest.schemaVersion !== 1 || !manifest.background || !/^[a-f0-9]{64}$/.test(manifest.background.sha256)){
            throw new Error('Invalid appearance manifest')
        }
        const imageUrl = secureUrl(manifest.background.url).href
        const cached = await this.getCachedBackground()
        if(cached && cached.sha256 === manifest.background.sha256) return cached

        const data = await this.download(imageUrl, MAX_IMAGE_BYTES)
        if(data.length > MAX_IMAGE_BYTES || sha256(data) !== manifest.background.sha256){
            throw new Error('Appearance background checksum or size mismatch')
        }
        const format = imageFormat(data)
        await this.validateImage(data, format)
        await fs.mkdir(this.cacheDirectory, { recursive: true })
        const filename = path.join(this.cacheDirectory, manifest.background.sha256 + '.' + format)
        await fs.writeFile(filename + '.tmp', data)
        await fs.rename(filename + '.tmp', filename)
        const current = path.join(this.cacheDirectory, 'current.json')
        await fs.writeFile(current + '.tmp', JSON.stringify({ sha256: manifest.background.sha256, format }))
        await fs.rename(current + '.tmp', current)
        return { url: pathToFileURL(filename).href, sha256: manifest.background.sha256 }
    }
}

module.exports = { BackgroundManager, MANIFEST_URL }

