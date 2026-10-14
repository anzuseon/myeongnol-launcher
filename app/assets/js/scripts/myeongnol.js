function syncMyeongnolNavigation(next){
    document.querySelectorAll('.mn-nav-item').forEach(button => button.removeAttribute('aria-current'))
    if(next === VIEWS.landing){
        document.getElementById(newsActive ? 'newsButton' : 'mn-nav-home').setAttribute('aria-current', 'page')
    } else if(next === VIEWS.settings){
        const selected = document.querySelector('.settingsNavItem[selected]')
        const target = selected?.getAttribute('rSc') || 'settingsTabAccount'
        document.querySelector('[data-settings-tab="' + target + '"]')?.setAttribute('aria-current', 'page')
    }
}

function closeMyeongnolNews(){
    if(!newsActive) return
    newsActive = false
    slide_(false)
    $('#landingContainer *').removeAttr('tabindex')
    $('#newsContainer *').attr('tabindex', '-1')
}

async function openMyeongnolSettings(tab){
    closeMyeongnolNews()
    if(getCurrentView() !== VIEWS.settings){
        await prepareSettings()
        switchView(getCurrentView(), VIEWS.settings, 180, 180)
    }
    const item = document.querySelector('.settingsNavItem[rSc="' + tab + '"]')
    if(item) settingsNavItemListener(item, false)
    syncMyeongnolNavigation(VIEWS.settings)
}

function leaveMyeongnolSettings(){
    if(getCurrentView() !== VIEWS.settings) return true
    if(settingsState.invalid.size){
        document.querySelector('#settingsContainer [error]')?.focus()
        return false
    }
    fullSettingsSave()
    return true
}

document.getElementById('mn-launcher-version').textContent = 'v' + remote.app.getVersion()
document.getElementById('mn-nav-home').onclick = () => {
    if(!leaveMyeongnolSettings()) return
    closeMyeongnolNews()
    if(getCurrentView() !== VIEWS.landing) switchView(getCurrentView(), VIEWS.landing, 180, 180)
    syncMyeongnolNavigation(VIEWS.landing)
}
document.querySelectorAll('[data-settings-tab]').forEach(button => {
    button.onclick = () => openMyeongnolSettings(button.dataset.settingsTab)
})
document.getElementById('mn-account-manage').onclick = () => openMyeongnolSettings('settingsTabAccount')
document.getElementById('user_text').onclick = () => openMyeongnolSettings('settingsTabAccount')
document.getElementById('mn-game-version-button').onclick = () => openMyeongnolSettings('settingsTabMinecraft')
document.getElementById('mn-skin-manage').onclick = () => shell.openExternal('https://www.minecraft.net/msaprofile')
document.getElementById('mn-close-news').onclick = () => document.getElementById('newsButton').click()
document.getElementById('mn-refresh-status').onclick = () => refreshServerStatus()
document.getElementById('mn-open-game-folder').onclick = async () => {
    const selectedServer = ConfigManager.getSelectedServer()
    if(!selectedServer) return
    const directory = path.join(ConfigManager.getInstanceDirectory(), selectedServer)
    try {
        await require('fs-extra').ensureDir(directory)
        const error = await shell.openPath(directory)
        if(error) throw new Error(error)
    } catch(error) {
        loggerUICore.warn('Unable to open game folder.', error)
        setOverlayContent('게임 폴더를 열 수 없습니다', '설정에서 게임 설치 경로를 확인해 주세요.', '확인')
        setOverlayHandler(() => toggleOverlay(false))
        toggleOverlay(true)
    }
}
document.getElementById('mn-avatar-image').addEventListener('error', event => {
    if(event.target.getAttribute('src') !== 'assets/images/SealCircle.png'){
        event.target.src = 'assets/images/SealCircle.png'
    }
})

