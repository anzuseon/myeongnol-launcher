const { DistributionAPI } = require('helios-core/common')
const semver = require('semver')

// Keep the normal remote server list, adding the separately versioned test profile
// bundled in this installer. A newer published copy takes precedence.
function mergeTestServer(distribution, testServer){
    if(distribution == null) return null
    const index = distribution.servers.findIndex(server => server.id === testServer.id)
    if(index >= 0){
        const published = distribution.servers[index]
        if(semver.valid(published.version) && semver.valid(testServer.version) && semver.gt(published.version, testServer.version)) return distribution
        // Equal published versions keep operator-customized metadata. Cached loopback
        // artifact URLs are rebound to this launcher session's token and port.
        if(semver.valid(published.version) && published.version === testServer.version){
            const hasSessionAssets = (published.modules || []).some(module => JSON.stringify(module).includes('http://127.0.0.1:'))
            const servers = [...distribution.servers]
            servers[index] = { ...published, ...(hasSessionAssets ? { modules: structuredClone(testServer.modules) } : {}) }
            if(published.icon?.startsWith('http://127.0.0.1:')) servers[index].icon = testServer.icon
            return { ...distribution, servers }
        }
        const servers = [...distribution.servers]
        servers[index] = structuredClone(testServer)
        return { ...distribution, servers }
    }
    return { ...distribution, servers: [...distribution.servers, structuredClone(testServer)] }
}

class TestDistributionAPI extends DistributionAPI {
    constructor(testServer, ...args){
        super(...args)
        this.testServer = testServer
    }

    async _loadDistributionNullable(){
        let merged = mergeTestServer(await super._loadDistributionNullable(), this.testServer)
        if(this.managedServer){
            const base = merged || { version: '1.0.0', servers: [] }
            const servers = base.servers.filter(server => server.id !== this.managedServer.id)
            const index = base.servers.findIndex(server => server.id === this.managedServer.id)
            servers.splice(index < 0 ? servers.length : index, 0, structuredClone(this.managedServer))
            merged = { ...base, servers }
        }
        // Asset validation workers load this cache directly; persist the complete
        // list and this session's loopback URL before any worker is started.
        if(merged != null && !this.isDevMode()) await this.writeDistributionToDisk(merged)
        return merged
    }
}

module.exports = { TestDistributionAPI, mergeTestServer }
