const { test } = require('node:test')
const assert = require('node:assert/strict')
const { bindSlider } = require('../app/assets/js/rangeslider')

class Target {
    constructor(){ this.listeners = new Map() }
    addEventListener(type, listener){
        if(!this.listeners.has(type)) this.listeners.set(type, new Set())
        this.listeners.get(type).add(listener)
    }
    removeEventListener(type, listener){ this.listeners.get(type)?.delete(listener) }
    emit(type, values = {}){
        const event = { type, preventDefault(){}, ...values }
        for(const listener of [...this.listeners.get(type) || []]) listener(event)
    }
}
function fixture(max = 12){
    const window = new Target(), document = new Target(), element = new Target()
    document.defaultView = window
    element.ownerDocument = document
    const attributes = { min: '6', max: String(max), step: '0.5', value: '6' }
    element.getAttribute = key => attributes[key] ?? null
    element.setAttribute = (key, value) => { attributes[key] = String(value) }
    element.removeAttribute = key => { delete attributes[key] }
    element.rect = { left: 455, width: 400 }
    element.getBoundingClientRect = () => element.rect
    element.focus = () => { element.focused = true }
    element.setPointerCapture = id => { element.capture = id }
    element.hasPointerCapture = id => element.capture === id
    element.releasePointerCapture = () => { element.capture = null }
    const values = []
    const update = value => { attributes.value = String(value); values.push(value) }
    const cleanup = bindSlider(element, update)
    const down = (x, extra = {}) => element.emit('pointerdown', { clientX: x, pointerId: 1, button: 0, isPrimary: true, ...extra })
    const move = x => document.emit('pointermove', { clientX: x, pointerId: 1 })
    return { element, document, window, attributes, values, update, cleanup, down, move }
}
test('nested slider coordinates use the visible rectangle and snap to half-gigabyte steps', () => {
    const f = fixture()
    f.down(755)
    assert.equal(f.attributes.value, '10.5')
    f.move(655)
    assert.equal(f.attributes.value, '9')
})
test('dragging beyond both ends clamps values, and releasing stops further movement', () => {
    const f = fixture()
    f.down(600)
    f.move(2000)
    assert.equal(f.attributes.value, '12')
    f.move(-100)
    assert.equal(f.attributes.value, '6')
    f.document.emit('pointerup', { pointerId: 1, clientX: 655 })
    assert.equal(f.attributes.value, '9')
    f.move(855)
    assert.equal(f.attributes.value, '9')
    assert.equal(f.element.capture, null)
})
test('resize and scroll offsets are measured again during the same drag', () => {
    const f = fixture()
    f.down(455)
    f.element.rect = { left: 100, width: 200 }
    f.move(250)
    assert.equal(f.attributes.value, '10.5')
})
test('keyboard controls select steps and endpoints without crossing bounds', () => {
    const f = fixture()
    f.element.emit('keydown', { key: 'ArrowRight' })
    assert.equal(f.attributes.value, '6.5')
    f.element.emit('keydown', { key: 'End' })
    assert.equal(f.attributes.value, '12')
    f.element.emit('keydown', { key: 'ArrowUp' })
    assert.equal(f.attributes.value, '12')
    f.element.emit('keydown', { key: 'Home' })
    assert.equal(f.attributes.value, '6')
    f.element.emit('keydown', { key: 'PageUp' })
    assert.equal(f.attributes.value, '11')
})
test('fixed ranges are marked disabled, with an explanation and no interaction changes', () => {
    const f = fixture(6)
    f.down(755)
    f.element.emit('keydown', { key: 'End' })
    assert.equal(f.attributes.value, '6')
    assert.equal(f.values.length, 0)
    assert.equal(f.attributes['aria-disabled'], 'true')
    assert.match(f.attributes.title, /6GB/)
})
test('rebinding removes previous listeners and cleanup stops all input', () => {
    const f = fixture()
    bindSlider(f.element, f.update)
    f.down(755)
    assert.equal(f.values.length, 1)
    const cleanup = bindSlider(f.element, f.update)
    cleanup()
    f.down(655)
    assert.equal(f.values.length, 1)
})
test('window blur and cancellation stop capture; secondary input is ignored', () => {
    const f = fixture()
    f.down(755, { button: 2 })
    f.down(755, { isPrimary: false })
    assert.equal(f.values.length, 0)
    f.down(755)
    f.window.emit('blur')
    f.move(455)
    assert.equal(f.attributes.value, '10.5')
    f.down(655)
    f.document.emit('pointercancel', { pointerId: 1 })
    f.move(455)
    assert.equal(f.attributes.value, '9')
})

