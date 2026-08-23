const fs = require('fs-extra')
const path = require('path')

const DEFAULT_SHADERPACK = 'ComplementaryUnbound_r5.8.1.zip'

const MINECRAFT_OPTIONS = [
    'fullscreen:false',
    'exclusiveFullscreen:false',
    'guiScale:2',
    'graphicsPreset:"custom"',
    'enableVsync:true',
    'maxFps:120',
    'renderDistance:16',
    'simulationDistance:10',
    'entityDistanceScaling:1.0',
    'mipmapLevels:2',
    'particles:1',
    'renderClouds:"fast"'
].join('\n') + '\n'

const IRIS_OPTIONS = [
    'allowUnknownShaders=false',
    'disableUpdateMessage=false',
    'enableDebugOptions=false',
    'enableShaders=true',
    'maxShadowRenderDistance=16',
    `shaderPack=${DEFAULT_SHADERPACK}`
].join('\n') + '\n'

const COMPLEMENTARY_MEDIUM_OPTIONS = [
    'SHADOW_QUALITY=1',
    'shadowDistance=128.0',
    'WATER_REFLECT_QUALITY=2',
    'BLOCK_REFLECT_QUALITY=1',
    'LIGHTSHAFT_QUALI_DEFINE=1',
    'SSAO_QUALI_DEFINE=2',
    'FXAA_DEFINE=1',
    'DETAIL_QUALITY=2',
    'CLOUD_QUALITY=2',
    'ANISOTROPIC_FILTER=0',
    'COLORED_LIGHTING=0',
    'WORLD_SPACE_REFLECTIONS=-1',
    'ENTITY_SHADOW=-1'
].join('\n') + '\n'

/**
 * Seed recommended settings for a newly-created game instance.
 * Existing instances are intentionally left untouched so player preferences persist.
 *
 * @param {string} gameDir Minecraft instance directory.
 * @returns {boolean} True when defaults were created.
 */
exports.seedInitialGameSettings = function(gameDir) {
    const minecraftOptions = path.join(gameDir, 'options.txt')
    if(fs.existsSync(minecraftOptions)) {
        return false
    }

    const irisConfigDir = path.join(gameDir, 'config')
    const shaderpackDir = path.join(gameDir, 'shaderpacks')
    fs.ensureDirSync(irisConfigDir)
    fs.ensureDirSync(shaderpackDir)

    fs.writeFileSync(minecraftOptions, MINECRAFT_OPTIONS, { encoding: 'utf-8' })
    fs.writeFileSync(path.join(gameDir, 'optionsshaders.txt'),
        `shaderPack=${DEFAULT_SHADERPACK}\nenableShaders=true\n`, { encoding: 'utf-8' })
    fs.writeFileSync(path.join(irisConfigDir, 'iris.properties'), IRIS_OPTIONS, { encoding: 'utf-8' })
    fs.writeFileSync(path.join(shaderpackDir, `${DEFAULT_SHADERPACK}.txt`),
        COMPLEMENTARY_MEDIUM_OPTIONS, { encoding: 'utf-8' })
    return true
}

exports.DEFAULT_SHADERPACK = DEFAULT_SHADERPACK
