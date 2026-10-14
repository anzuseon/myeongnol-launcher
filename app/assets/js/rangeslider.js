const bindings = new WeakMap()

function bounds(element){
    const min = Number(element.getAttribute('min'))
    const max = Math.max(min, Number(element.getAttribute('max')))
    const step = Number(element.getAttribute('step')) || 1
    return { min, max, step }
}

function bindSlider(element, onValue){
    bindings.get(element)?.()
    const document = element.ownerDocument
    const window = document.defaultView
    let pointerId = null

    const value = () => Number(element.getAttribute('value'))
    const commit = requested => {
        const { min, max, step } = bounds(element)
        const snapped = min + Math.round((requested-min)/step)*step
        onValue(Number(Math.max(min, Math.min(max, snapped)).toFixed(6)))
    }
    const move = event => {
        if(pointerId !== event.pointerId) return
        const rect = element.getBoundingClientRect()
        if(rect.width <= 0) return
        const { min, max } = bounds(element)
        const fraction = Math.max(0, Math.min(1, (event.clientX-rect.left)/rect.width))
        commit(min+(max-min)*fraction)
    }
    const stop = () => {
        const previous = pointerId
        pointerId = null
        if(previous != null && element.hasPointerCapture?.(previous)) element.releasePointerCapture(previous)
    }
    const down = event => {
        if(event.button !== 0 || event.isPrimary === false) return
        event.preventDefault()
        element.focus({ preventScroll: true })
        const { min, max } = bounds(element)
        if(max <= min) return
        pointerId = event.pointerId
        try {
            element.setPointerCapture?.(pointerId)
        } catch(_error) {
            // Document listeners also cover synthetic events and unsupported capture.
        }
        move(event)
    }
    const up = event => {
        if(pointerId !== event.pointerId) return
        if(event.type === 'pointerup') move(event)
        stop()
    }
    const key = event => {
        const { min, max, step } = bounds(element)
        let next
        switch(event.key){
            case 'ArrowRight':
            case 'ArrowUp': next = value()+step; break
            case 'ArrowLeft':
            case 'ArrowDown': next = value()-step; break
            case 'PageUp': next = value()+step*10; break
            case 'PageDown': next = value()-step*10; break
            case 'Home': next = min; break
            case 'End': next = max; break
            default: return
        }
        event.preventDefault()
        if(max > min) commit(next)
    }

    element.setAttribute('role', 'slider')
    element.setAttribute('tabindex', '0')
    element.setAttribute('aria-orientation', 'horizontal')
    const { min, max } = bounds(element)
    element.setAttribute('aria-disabled', String(max <= min))
    if(max <= min) element.setAttribute('title', '이 PC의 RAM 선택 범위는 ' + min + 'GB로 고정되어 있습니다.')
    else element.removeAttribute('title')

    element.addEventListener('pointerdown', down)
    element.addEventListener('lostpointercapture', stop)
    element.addEventListener('keydown', key)
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
    window.addEventListener('blur', stop)
    const cleanup = () => {
        stop()
        element.removeEventListener('pointerdown', down)
        element.removeEventListener('lostpointercapture', stop)
        element.removeEventListener('keydown', key)
        document.removeEventListener('pointermove', move)
        document.removeEventListener('pointerup', up)
        document.removeEventListener('pointercancel', up)
        window.removeEventListener('blur', stop)
        bindings.delete(element)
    }
    bindings.set(element, cleanup)
    return cleanup
}

module.exports = { bindSlider }

