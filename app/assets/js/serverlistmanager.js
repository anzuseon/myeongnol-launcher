const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const TAG = Object.freeze({
    End: 0,
    Byte: 1,
    Short: 2,
    Int: 3,
    Long: 4,
    Float: 5,
    Double: 6,
    ByteArray: 7,
    String: 8,
    List: 9,
    Compound: 10,
    IntArray: 11,
    LongArray: 12
})

class NBTReader {

    constructor(buffer){
        this.buffer = buffer
        this.offset = 0
    }

    readByte(){
        const value = this.buffer.readInt8(this.offset)
        this.offset += 1
        return value
    }

    readUnsignedByte(){
        const value = this.buffer.readUInt8(this.offset)
        this.offset += 1
        return value
    }

    readShort(){
        const value = this.buffer.readInt16BE(this.offset)
        this.offset += 2
        return value
    }

    readUnsignedShort(){
        const value = this.buffer.readUInt16BE(this.offset)
        this.offset += 2
        return value
    }

    readInt(){
        const value = this.buffer.readInt32BE(this.offset)
        this.offset += 4
        return value
    }

    readLong(){
        const value = this.buffer.readBigInt64BE(this.offset)
        this.offset += 8
        return value
    }

    readFloat(){
        const value = this.buffer.readFloatBE(this.offset)
        this.offset += 4
        return value
    }

    readDouble(){
        const value = this.buffer.readDoubleBE(this.offset)
        this.offset += 8
        return value
    }

    readString(){
        const length = this.readUnsignedShort()
        const value = this.buffer.toString('utf8', this.offset, this.offset + length)
        this.offset += length
        return value
    }

    readLength(){
        const length = this.readInt()
        if(length < 0){
            throw new Error(`Invalid NBT array length: ${length}`)
        }
        return length
    }

    readPayload(type){
        switch(type){
            case TAG.Byte:
                return this.readByte()
            case TAG.Short:
                return this.readShort()
            case TAG.Int:
                return this.readInt()
            case TAG.Long:
                return this.readLong()
            case TAG.Float:
                return this.readFloat()
            case TAG.Double:
                return this.readDouble()
            case TAG.ByteArray: {
                const length = this.readLength()
                const value = Buffer.from(this.buffer.subarray(this.offset, this.offset + length))
                this.offset += length
                return value
            }
            case TAG.String:
                return this.readString()
            case TAG.List: {
                const elementType = this.readUnsignedByte()
                const length = this.readLength()
                const value = []
                for(let i=0; i<length; i++){
                    value.push(this.readPayload(elementType))
                }
                return { type: elementType, value }
            }
            case TAG.Compound: {
                const value = {}
                while(true){
                    const childType = this.readUnsignedByte()
                    if(childType === TAG.End){
                        break
                    }
                    const childName = this.readString()
                    value[childName] = {
                        type: childType,
                        value: this.readPayload(childType)
                    }
                }
                return value
            }
            case TAG.IntArray: {
                const length = this.readLength()
                const value = []
                for(let i=0; i<length; i++){
                    value.push(this.readInt())
                }
                return value
            }
            case TAG.LongArray: {
                const length = this.readLength()
                const value = []
                for(let i=0; i<length; i++){
                    value.push(this.readLong())
                }
                return value
            }
            default:
                throw new Error(`Unsupported NBT tag type: ${type}`)
        }
    }

    readRoot(){
        const type = this.readUnsignedByte()
        if(type !== TAG.Compound){
            throw new Error(`servers.dat root must be a compound tag, received ${type}`)
        }
        return {
            type,
            name: this.readString(),
            value: this.readPayload(type)
        }
    }
}

class NBTWriter {

    constructor(){
        this.chunks = []
    }

    pushNumber(size, writer, value){
        const buffer = Buffer.alloc(size)
        buffer[writer](value, 0)
        this.chunks.push(buffer)
    }

    writeByte(value){
        this.pushNumber(1, 'writeInt8', value)
    }

    writeUnsignedByte(value){
        this.pushNumber(1, 'writeUInt8', value)
    }

    writeShort(value){
        this.pushNumber(2, 'writeInt16BE', value)
    }

    writeUnsignedShort(value){
        this.pushNumber(2, 'writeUInt16BE', value)
    }

    writeInt(value){
        this.pushNumber(4, 'writeInt32BE', value)
    }

    writeLong(value){
        this.pushNumber(8, 'writeBigInt64BE', BigInt(value))
    }

    writeFloat(value){
        this.pushNumber(4, 'writeFloatBE', value)
    }

    writeDouble(value){
        this.pushNumber(8, 'writeDoubleBE', value)
    }

    writeString(value){
        const buffer = Buffer.from(value, 'utf8')
        if(buffer.length > 65535){
            throw new Error('NBT string is too long')
        }
        this.writeUnsignedShort(buffer.length)
        this.chunks.push(buffer)
    }

    writePayload(type, value){
        switch(type){
            case TAG.Byte:
                this.writeByte(value)
                break
            case TAG.Short:
                this.writeShort(value)
                break
            case TAG.Int:
                this.writeInt(value)
                break
            case TAG.Long:
                this.writeLong(value)
                break
            case TAG.Float:
                this.writeFloat(value)
                break
            case TAG.Double:
                this.writeDouble(value)
                break
            case TAG.ByteArray:
                this.writeInt(value.length)
                this.chunks.push(Buffer.from(value))
                break
            case TAG.String:
                this.writeString(value)
                break
            case TAG.List:
                this.writeUnsignedByte(value.type)
                this.writeInt(value.value.length)
                value.value.forEach(entry => this.writePayload(value.type, entry))
                break
            case TAG.Compound:
                Object.entries(value).forEach(([name, tag]) => {
                    this.writeUnsignedByte(tag.type)
                    this.writeString(name)
                    this.writePayload(tag.type, tag.value)
                })
                this.writeUnsignedByte(TAG.End)
                break
            case TAG.IntArray:
                this.writeInt(value.length)
                value.forEach(entry => this.writeInt(entry))
                break
            case TAG.LongArray:
                this.writeInt(value.length)
                value.forEach(entry => this.writeLong(entry))
                break
            default:
                throw new Error(`Unsupported NBT tag type: ${type}`)
        }
    }

    writeRoot(root){
        this.writeUnsignedByte(root.type)
        this.writeString(root.name)
        this.writePayload(root.type, root.value)
        return Buffer.concat(this.chunks)
    }
}

function decodeServerList(buffer){
    const compressed = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b
    const payload = compressed ? zlib.gunzipSync(buffer) : buffer
    return {
        compressed,
        root: new NBTReader(payload).readRoot()
    }
}

function encodeServerList(root, compressed = false){
    const payload = new NBTWriter().writeRoot(root)
    return compressed ? zlib.gzipSync(payload) : payload
}

function createEmptyServerList(){
    return {
        type: TAG.Compound,
        name: '',
        value: {
            servers: {
                type: TAG.List,
                value: {
                    type: TAG.Compound,
                    value: []
                }
            }
        }
    }
}

function ensureServerInList(gameDirectory, serverName, serverAddress){
    if(!serverAddress){
        return false
    }

    fs.mkdirSync(gameDirectory, { recursive: true })
    const serverListPath = path.join(gameDirectory, 'servers.dat')
    let root = createEmptyServerList()
    let compressed = false

    if(fs.existsSync(serverListPath)){
        const decoded = decodeServerList(fs.readFileSync(serverListPath))
        root = decoded.root
        compressed = decoded.compressed
    }

    const serverList = root.value.servers
    if(serverList?.type !== TAG.List || serverList.value?.type !== TAG.Compound || !Array.isArray(serverList.value.value)){
        throw new Error('servers.dat does not contain a valid server list')
    }

    const normalizedAddress = serverAddress.trim().toLowerCase()
    const existing = serverList.value.value.find(entry =>
        entry.ip?.type === TAG.String
        && entry.ip.value.trim().toLowerCase() === normalizedAddress
    )

    if(existing){
        if(existing.name?.type === TAG.String && existing.name.value !== serverName){
            existing.name.value = serverName
        } else {
            return false
        }
    } else {
        serverList.value.value.push({
            name: { type: TAG.String, value: serverName },
            ip: { type: TAG.String, value: serverAddress.trim() },
            hidden: { type: TAG.Byte, value: 0 }
        })
    }

    fs.writeFileSync(serverListPath, encodeServerList(root, compressed))
    return true
}

module.exports = {
    TAG,
    decodeServerList,
    encodeServerList,
    ensureServerInList
}
