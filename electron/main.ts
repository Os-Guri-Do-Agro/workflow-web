import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const _dirname = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url))

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

process.env.APP_ROOT = join(_dirname, '..')

// Define the public path for icons and static files based on dev / prod
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function createWindow() {
  const iconPath = join(process.env.VITE_PUBLIC || '', 'icone.png')
  
  win = new BrowserWindow({
    icon: iconPath,
    width: 1200,
    height: 800,
    show: false, // Don't show immediately as the user requested it minimized to tray at start
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false, // Helpful when loading local assets in some frameworks, but should be enabled in prod securely
    },
  })

  win.setMenuBarVisibility(false)
  Menu.setApplicationMenu(null)

  // Optionally, if the user actually wants to see the window at start:
  // win.once('ready-to-show', () => {
  //   win?.show()
  // })

  win.on('close', (event) => {
    // When the user clicks the X button, we don't quit, we just hide the window to tray
    if (!isQuitting) {
      event.preventDefault()
      win?.hide()
    }
    return false
  })

  // Load the web app
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(join(RENDERER_DIST, 'index.html'))
  }
}

function createTray() {
  const iconPath = join(process.env.VITE_PUBLIC || '', 'icone.png')
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon)
  
  const contextMenu = Menu.buildFromTemplate([
    { label: '📌 Dashboard', click: () => {
      if (win) {
        win.show()
        win.focus()
        win.webContents.executeJavaScript('window.location.hash = "#/"').catch(() => {})
      }
    } },
    { label: '✅ Minhas Tarefas em Andamento', click: () => {
      if (win) {
        win.show()
        win.focus()
        win.webContents.executeJavaScript(`window.location.hash = "#/tasks/" + new Date().toISOString().slice(0, 7)`).catch(() => {})
      }
    } },
    { label: '🎫 Tickets', click: () => {
      if (win) {
        win.show()
        win.focus()
        win.webContents.executeJavaScript('window.location.hash = "#/tickets"').catch(() => {})
      }
    } },
    { label: '⚙️ Configurações', click: () => {
      if (win) {
        win.show()
        win.focus()
        win.webContents.executeJavaScript('window.location.hash = "#/settings"').catch(() => {})
      }
    } },
    { type: 'separator' },
    { label: '🔄 Sincronizar (Recarregar)', click: () => {
      if (win) {
        win.reload()
      }
    } },
    { type: 'separator' },
    { label: 'Sair e Encerrar', click: () => {
      isQuitting = true
      app.quit()
    } }
  ])
  
  tray.setToolTip('Work Flow Desktop')
  tray.setContextMenu(contextMenu)
  
  tray.on('click', () => {
    if (win) {
      if (win.isVisible()) {
        if (win.isMinimized()) {
          win.restore()
          win.focus()
        } else {
          win.hide()
        }
      } else {
        win.show()
        win.focus()
      }
    }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.whenReady().then(() => {
  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
