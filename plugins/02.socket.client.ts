import { io, type Socket } from 'socket.io-client'
import EventEmitter from 'events'
import { setSocket } from '~/composables/useSocket'

class ServerSocket extends EventEmitter {
  socket: Socket | null = null
  connected = false
  serverAddress: string | null = null
  isAuthenticated = false
  lastReconnectAttemptTime = 0

  $on(evt: string, callback: (...args: unknown[]) => void): void {
    if (this.socket) this.socket.on(evt, callback)
    else console.error('$on Socket not initialized')
  }

  $off(evt: string, callback: (...args: unknown[]) => void): void {
    if (this.socket) this.socket.off(evt, callback)
    else console.error('$off Socket not initialized')
  }

  connect(serverAddress: string, _token: string): void {
    this.serverAddress = serverAddress
    const serverUrl = new URL(serverAddress)
    const serverHost = `${serverUrl.protocol}//${serverUrl.host}`
    const serverPath = serverUrl.pathname === '/' ? '' : serverUrl.pathname
    console.log(`[SOCKET] Connecting to ${serverHost} with path ${serverPath}/socket.io`)
    this.socket = io(serverHost, {
      transports: ['websocket'],
      upgrade: false,
      path: `${serverPath}/socket.io`,
      reconnectionDelayMax: 15000
    })
    this.setSocketListeners()
  }

  logout(): void {
    if (this.socket) this.socket.disconnect()
    this.removeListeners()
  }

  /**
   * Deliberate offline mode. Unlike logout() this keeps the socket and its listeners, so coming
   * back online is just a reconnect - no need to rebuild the connection or re-register handlers.
   */
  goOffline(): void {
    if (this.socket) this.socket.disconnect()
  }

  goOnline(): void {
    if (this.socket) this.socket.connect()
  }

  hasSocket(): boolean {
    return !!this.socket
  }

  setSocketListeners(): void {
    if (!this.socket) return
    this.socket.on('connect', this.onConnect.bind(this))
    this.socket.on('connect_error', this.onConnectError.bind(this))
    this.socket.on('disconnect', this.onDisconnect.bind(this))
    this.socket.on('init', this.onInit.bind(this))
    this.socket.on('auth_failed', this.onAuthFailed.bind(this))
    this.socket.on('user_updated', this.onUserUpdated.bind(this))
    this.socket.on('user_item_progress_updated', this.onUserItemProgressUpdated.bind(this))
    this.socket.on('playlist_added', this.onPlaylistAdded.bind(this))
    this.socket.io.on('reconnect_attempt', this.onReconnectAttempt.bind(this))
    this.socket.io.on('reconnect_error', this.onReconnectError.bind(this))
    this.socket.io.on('reconnect_failed', this.onReconnectFailed.bind(this))
  }

  sendAuthenticate(): void {
    const userStore = useUserStore()
    this.socket?.emit('auth', userStore.accessToken)
  }

  removeListeners(): void {
    if (!this.socket) return
    this.socket.removeAllListeners()
    this.socket.io.removeAllListeners()
  }

  onConnect(): void {
    console.log('[SOCKET] Socket Connected ' + this.socket?.id)
    this.connected = true
    const appStore = useAppStore()
    appStore.socketConnected = true
    appStore.serverReachable = true
    this.emit('connection-update', true)
    this.sendAuthenticate()
  }

  onConnectError(error: Error): void {
    console.log('[SOCKET] Connect error', error)
    this.connected = false
    const appStore = useAppStore()
    appStore.socketConnected = false
    appStore.serverReachable = false
  }

  onReconnectAttempt(attemptNumber: number): void {
    const timeSince = this.lastReconnectAttemptTime ? Date.now() - this.lastReconnectAttemptTime : 0
    this.lastReconnectAttemptTime = Date.now()
    console.log(`[SOCKET] Reconnect attempt ${attemptNumber} ${timeSince > 0 ? `after ${timeSince}ms` : ''}`)
  }

  onReconnectError(error: Error): void {
    console.log('[SOCKET] Reconnect error', error)
    useAppStore().serverReachable = false
  }

  onReconnectFailed(): void {
    console.log('[SOCKET] Reconnect failed')
    useAppStore().serverReachable = false
  }

  onDisconnect(reason: string): void {
    console.log('[SOCKET] Socket Disconnected: ' + reason)
    this.connected = false
    const appStore = useAppStore()
    appStore.socketConnected = false
    appStore.serverReachable = false
    this.emit('connection-update', false)
  }

  onInit(data: unknown): void {
    console.log('[SOCKET] Initial socket data received', data)
    this.emit('initialized', true)
    this.isAuthenticated = true
  }

  onAuthFailed(data: unknown): void {
    console.log('[SOCKET] Auth failed', data)
    this.isAuthenticated = false
  }

  onUserUpdated(data: unknown): void {
    console.log('[SOCKET] User updated', data)
    this.emit('user_updated', data)
  }

  onUserItemProgressUpdated(payload: { data: Record<string, unknown> }): void {
    console.log('[SOCKET] User Item Progress Updated', JSON.stringify(payload))
    useUserStore().updateUserMediaProgress(payload.data)
    this.emit('user_media_progress_updated', payload)
  }

  onPlaylistAdded(): void {
    const librariesStore = useLibrariesStore()
    if (!librariesStore.numUserPlaylists) {
      librariesStore.numUserPlaylists = 1
    }
  }
}

export default defineNuxtPlugin(() => {
  const socket = new ServerSocket()
  setSocket(socket)
  return { provide: { socket } }
})
