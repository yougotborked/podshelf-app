<template>
  <div class="w-full max-w-md mx-auto px-2 sm:px-4 lg:px-8 z-10">
    <div v-show="!loggedIn" class="bg-md-surface-1 rounded-md-xl elevation-2 px-4 py-6 w-full">
      <!-- list of server connection configs -->
      <template v-if="!showForm">
        <div v-for="config in serverConnectionConfigs" :key="config.id" class="border-b border-md-outline-variant/20 py-4">
          <div class="flex items-center my-1 relative space-x-2" @click="connectToServer(config)">
            <div class="grow inline-flex items-center overflow-hidden">
              <p class="text-base text-md-on-surface truncate">{{ config.name }}</p>
            </div>
            <div class="h-full w-6 flex items-center" @click.stop="editServerConfig(config)">
              <span class="material-symbols text-2xl text-md-on-surface-variant">more_vert</span>
            </div>
            <div class="h-full w-6 flex items-center" @click.stop="removeServerConfigClick(config)">
              <span class="material-symbols fill text-1.5xl text-md-on-surface-variant">delete</span>
            </div>
          </div>
          <!-- warning message if server connection config is using an old user id -->
          <div v-if="!checkIdUuid(config.userId)" class="flex flex-nowrap justify-between items-center space-x-4 pt-4">
            <p class="text-xs text-warning">{{ $strings.MessageOldServerConnectionWarning }}</p>
            <ui-btn class="text-xs whitespace-nowrap" :padding-x="2" :padding-y="1" @click="showOldUserIdWarningDialog">{{ $strings.LabelMoreInfo }}</ui-btn>
          </div>
          <!-- warning message if server connection config is using an old auth method -->
          <div v-if="config.version && checkIsUsingOldAuth(config)" class="flex flex-nowrap justify-between items-center space-x-4 pt-4">
            <p class="text-xs text-warning">{{ $strings.MessageOldServerAuthWarning }}</p>
            <ui-btn class="text-xs whitespace-nowrap" :padding-x="2" :padding-y="1" @click="showOldAuthWarningDialog">{{ $strings.LabelMoreInfo }}</ui-btn>
          </div>
        </div>
        <div class="my-1 py-4 w-full">
          <ui-btn class="w-full" @click="newServerConfigClick">{{ $strings.ButtonAddNewServer }}</ui-btn>
        </div>
      </template>
      <!-- form to add a new server connection config -->
      <div v-else class="w-full">
        <!-- server address input -->
        <form v-if="!showAuth" @submit.prevent="submit(false)" novalidate class="w-full">
          <div v-if="serverConnectionConfigs.length" class="flex items-center mb-4" @click="showServerList">
            <span class="material-symbols text-md-on-surface-variant">arrow_back</span>
          </div>
          <h2 class="text-md-title-m text-md-on-surface mb-3">{{ $strings.LabelServerAddress }}</h2>
          <ui-text-input v-model="serverConfig.address" :disabled="processing || !networkConnected || !!serverConfig.id" placeholder="http://55.55.55.55:13378" type="url" class="w-full h-10" />
          <div class="flex justify-end items-center mt-6">
            <ui-btn :disabled="processing || !networkConnected" type="submit" :padding-x="3" class="h-10">{{ networkConnected ? $strings.ButtonSubmit : $strings.MessageNoNetworkConnection }}</ui-btn>
          </div>
        </form>
        <!-- username/password and auth methods -->
        <template v-else>
          <div v-if="serverConfig.id" class="flex items-center mb-4" @click="showServerList">
            <span class="material-symbols text-md-on-surface-variant">arrow_back</span>
          </div>

          <div class="flex items-center">
            <p class="text-md-on-surface-variant">{{ serverConfig.address }}</p>
            <div class="flex-grow" />
            <span v-if="!serverConfig.id" class="material-symbols" style="font-size: 1.1rem" @click="editServerAddress">edit</span>
          </div>
          <div class="w-full h-px bg-md-outline-variant/20 my-2" />
          <form v-if="isLocalAuthEnabled" @submit.prevent="submitAuth" class="pt-3">
            <ui-text-input v-model="serverConfig.username" :disabled="processing" :placeholder="$strings.LabelUsername" class="w-full mb-2 text-lg" />
            <ui-text-input v-model="password" type="password" :disabled="processing" :placeholder="$strings.LabelPassword" class="w-full mb-2 text-lg" />

            <div class="flex items-center pt-2">
              <ui-icon-btn v-if="serverConfig.id" bg-color="error" icon="delete" type="button" @click="removeServerConfigClick(serverConfig as ServerConnectionConfig)" />
              <div class="flex-grow" />
              <ui-btn :disabled="processing || !networkConnected" type="submit" class="mt-1 h-10">{{ networkConnected ? $strings.ButtonSubmit : $strings.MessageNoNetworkConnection }}</ui-btn>
            </div>
          </form>
          <div v-if="isLocalAuthEnabled && isOpenIDAuthEnabled" class="w-full h-px bg-md-outline-variant/20 my-4" />
          <ui-btn v-if="isOpenIDAuthEnabled" :disabled="processing" class="h-10 w-full" @click="clickLoginWithOpenId">{{ oauth.buttonText }}</ui-btn>
        </template>
      </div>

      <!-- auth error message -->
      <div v-show="error" class="w-full rounded-md-md bg-md-error-container/20 border border-md-error/40 py-3 px-2 flex items-center mt-4">
        <span class="material-symbols mr-2 text-error" style="font-size: 1.1rem">warning</span>
        <p class="text-error">{{ error }}</p>
      </div>
    </div>

    <div :class="processing ? 'opacity-100' : 'opacity-0 pointer-events-none'" class="fixed w-full h-full top-0 left-0 bg-black/75 flex items-center justify-center z-30 transition-opacity duration-500">
      <widgets-loading-spinner size="la-2x" />
    </div>

    <p v-if="!serverConnectionConfigs.length" class="mt-2 text-center text-error" v-html="$strings.MessageAudiobookshelfServerRequired" />

    <modals-custom-headers-modal v-model="showAddCustomHeaders" v-model:custom-headers="serverConfig.customHeaders" />
  </div>
</template>

<script setup lang="ts">
import type { AuthorizePayload, DeviceData, HttpError, ServerConnectionConfig, ServerConnectionDraft } from '~/types'
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Browser } from '@capacitor/browser'
import { CapacitorHttp } from '@capacitor/core'
import { Dialog } from '@capacitor/dialog'
import { useAppStore } from '~/stores/app'
import { useUserStore } from '~/stores/user'
import { useLibrariesStore } from '~/stores/libraries'
import { useEventBus } from '~/composables/useEventBus'
import { useSocket } from '~/composables/useSocket'
import { useNativeHttp } from '~/composables/useNativeHttp'
import { useDb } from '~/composables/useDb'
import { useLocalStore } from '~/composables/useLocalStore'
import { useHaptics } from '~/composables/useHaptics'
import { usePlatform } from '~/composables/usePlatform'
import { useToast } from '~/composables/useToast'
import { useUtils } from '~/composables/useUtils'
import { useStrings, setServerLanguageCode, setLanguageCode } from '~/composables/useStrings'

// TODO: when backend ready. See validateLoginFormResponse()
//const requiredServerVersion = '2.5.0'

const appStore = useAppStore()
const userStore = useUserStore()
const librariesStore = useLibrariesStore()
const eventBus = useEventBus()
const socket = useSocket()
const nativeHttp = useNativeHttp()
const db = useDb()
const localStore = useLocalStore()
const { hapticsImpact } = useHaptics()
const platform = usePlatform()
const toast = useToast()
const { isValidVersion } = useUtils()
const strings = useStrings()
const router = useRouter()
const route = useRoute()

// State
const loggedIn = ref(false)
const showAuth = ref(false)
const processing = ref(false)
const serverConfig = ref<ServerConnectionDraft>({
  address: null,
  version: null,
  username: null,
  customHeaders: null
})
const password = ref<string | null>(null)
const error = ref<string | null>(null)
const showForm = ref(false)
const showAddCustomHeaders = ref(false)
const authMethods = ref<string[]>([])
const oauth = ref({
  state: null as string | null,
  verifier: null as string | null,
  challenge: null as string | null,
  buttonText: 'Login with OpenID',
  enforceHTTPs: true // RFC 6749, Section 10.9 requires https
})

// Computed
const deviceData = computed(() => appStore.deviceData || {})
const deviceSettings = computed(() => (deviceData.value as DeviceData).deviceSettings || {})
const networkConnected = computed(() => appStore.networkConnected)
const serverConnectionConfigs = computed(() => (deviceData.value as DeviceData | null | undefined)?.serverConnectionConfigs || [])
const lastServerConnectionConfigId = computed(() => (deviceData.value as DeviceData | null | undefined)?.lastServerConnectionConfigId || null)
const lastServerConnectionConfig = computed(() => {
  if (!lastServerConnectionConfigId.value || !serverConnectionConfigs.value.length) return null
  return serverConnectionConfigs.value.find((s) => s.id == lastServerConnectionConfigId.value)
})
const isLocalAuthEnabled = computed(() => authMethods.value.includes('local') || !authMethods.value.length)
const isOpenIDAuthEnabled = computed(() => authMethods.value.includes('openid'))

// Methods
function showOldUserIdWarningDialog() {
  void Dialog.alert({
    title: 'Old Server Connection Warning',
    message: strings.MessageOldServerConnectionWarningHelp,
    buttonTitle: strings.ButtonOk
  })
}

async function showOldAuthWarningDialog() {
  const confirmResult = await Dialog.confirm({
    title: 'Old Server Auth Warning',
    message: strings.MessageOldServerAuthWarningHelp,
    cancelButtonTitle: strings.ButtonReadMore
  })
  if (!confirmResult.value) {
    window.open('https://github.com/advplyr/audiobookshelf/discussions/4460', '_blank')
  }
}

function checkIdUuid(userId: string | undefined): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId ?? '')
}

function checkIsUsingOldAuth(config: ServerConnectionConfig): boolean {
  if (!config.version) return true
  return !isValidVersion(config.version, '2.26.0')
}

/**
 * Initiates the login process using OpenID via OAuth2.0.
 * 1. Verifying the server's address
 * 2. Calling oauthRequest() to obtain the special OpenID redirect URL
 *      including a challenge and specying audiobookshelf://oauth as redirect URL
 * 3. Open this redirect URL in browser (which is a website of the SSO provider)
 *
 * When the browser is open, the following flow is expected:
 * a. The user authenticates and the provider redirects back to custom URL audiobookshelf://oauth
 * b. The app calls appUrlOpen() when `audiobookshelf://oauth` is called
 * b. appUrlOpen() handles the incoming URL and extracts the authorization code from GET parameter
 * c. oauthExchangeCodeForToken() exchanges the authorization code for an access token
 *
 *
 * @async
 * @throws Will log a console error if the browser fails to open the URL and display errors via error.value to the user.
 */
async function clickLoginWithOpenId() {
  // oauth standard requires https explicitly
  if (!(serverConfig.value.address ?? '').startsWith('https') && oauth.value.enforceHTTPs) {
    console.warn(`[SSO] Oauth2 requires HTTPS`)
    toast.error(`SSO: The URL to the server must be https:// secured`)
    return
  }

  // First request that we want to do oauth/openid and get the URL which a browser window should open
  const redirectUrl = await oauthRequest(serverConfig.value.address ?? '')
  if (!redirectUrl) {
    // error message handled by oauthRequest
    return
  }

  // Actually we should be able to use the redirectUrl directly for Browser.open below
  // However it seems that when directly using it there is a malformation and leads to the error
  //    Unhandled Promise Rejection: DataCloneError: The object can not be cloned.
  //    (On calling Browser.open)
  // Which is hard to debug
  // So we simply extract the important elements and build the required URL ourselves
  //  which also has the advantage that we can replace the callbackurl with the app url

  const client_id = redirectUrl.searchParams.get('client_id')
  const scope = redirectUrl.searchParams.get('scope')
  const state = redirectUrl.searchParams.get('state')
  let redirect_uri_param = redirectUrl.searchParams.get('redirect_uri')
  // Backwards compatability with 2.6.0
  if (serverConfig.value.version === '2.6.0') {
    redirect_uri_param = 'audiobookshelf://oauth'
  }

  if (!client_id || !scope || !state || !redirect_uri_param) {
    console.warn(`[SSO] Invalid OpenID URL - client_id scope state or redirect_uri missing: ${redirectUrl}`)
    toast.error(`SSO: Invalid answer`)
    return
  }

  if (redirectUrl.protocol !== 'https:' && oauth.value.enforceHTTPs) {
    console.warn(`[SSO] Insecure Redirection by SSO provider: ${redirectUrl.protocol} is not allowed. Use HTTPS`)
    toast.error(`SSO: The SSO provider must return a HTTPS secured URL`)
    return
  }

  // We need to verify if the state is the same later
  oauth.value.state = state

  const host = `${redirectUrl.protocol}//${redirectUrl.host}`
  const buildUrl = `${host}${redirectUrl.pathname}?response_type=code` + `&client_id=${encodeURIComponent(client_id)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}` + `&redirect_uri=${encodeURIComponent(redirect_uri_param)}` + `&code_challenge=${encodeURIComponent(oauth.value.challenge!)}&code_challenge_method=S256`

  // example url for authentik
  // const authURL = "https://authentik/application/o/authorize/?response_type=code&client_id=41cd96f...&redirect_uri=audiobookshelf%3A%2F%2Foauth&scope=openid%20openid%20email%20profile&state=asdds..."

  // Open the browser. The browser/identity provider in turn will redirect to an in-app link supplementing a code
  try {
    await Browser.open({ url: buildUrl })
  } catch (err) {
    console.error('Error opening browser', err)
  }
}

/**
 * Requests the OAuth/OpenID URL from the backend server to open in browser
 *
 * @async
 * @param {string} url - The base URL of the server to append the OAuth request parameters to.
 * @return {Promise<URL|null>} OAuth URL which should be opened in a browser
 * @throws Logs an error and displays a toast notification if the token exchange fails.
 */
async function oauthRequest(url: string): Promise<URL | null> {
  // Generate oauth2 PKCE challenge
  //  In accordance to RFC 7636 Section 4
  function base64URLEncode(arrayBuffer: ArrayBuffer): string {
    let base64String = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(arrayBuffer))))
    return base64String.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  }

  async function sha256(plain: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder()
    const data = encoder.encode(plain)
    return await window.crypto.subtle.digest('SHA-256', data)
  }

  function generateRandomString(): string {
    var array = new Uint32Array(42)
    window.crypto.getRandomValues(array)
    return Array.from(array, (dec) => ('0' + dec.toString(16)).slice(-2)).join('') // hex
  }

  const verifier = generateRandomString()

  const challenge = base64URLEncode(await sha256(verifier))

  oauth.value.verifier = verifier
  oauth.value.challenge = challenge

  let backendEndpoint = `${url}/auth/openid?code_challenge=${challenge}&code_challenge_method=S256&redirect_uri=${encodeURIComponent('audiobookshelf://oauth')}&client_id=${encodeURIComponent('Audiobookshelf-App')}&response_type=code`
  // Backwards compatability with 2.6.0
  if (serverConfig.value.version === '2.6.0') {
    backendEndpoint += '&isRest=true'
  }

  try {
    const response = await CapacitorHttp.get({
      url: backendEndpoint,
      disableRedirects: true,
      webFetchExtra: {
        redirect: 'manual'
      }
    })

    // Every kind of redirection is allowed [RFC6749 - 1.7]
    if (!(response.status >= 300 && response.status < 400)) {
      throw new Error(`Unexpected response from server: ${response.status}`)
    }

    // Depending on iOS or Android, it can be location or Location...
    const locationHeader = response.headers[Object.keys(response.headers).find((key) => key.toLowerCase() === 'location')!]
    if (!locationHeader) {
      throw new Error(`No location header in SSO answer`)
    }

    const parsedUrl = new URL(locationHeader)
    return parsedUrl
  } catch (err: unknown) {
    const message = (err as Error | null)?.message
    console.error(`[SSO] ${message}`)
    toast.error(`SSO Error: ${message}`)
    return null
  }
}

/**
 * Handles the callback received from the OAuth/OpenID provider.
 *
 * @async
 * @function appUrlOpen
 * @param {string} url - The callback URL received from the OAuth/OpenID provider.
 * @throws Logs a warning and displays a toast notification if the URL is invalid or the state doesn't match.
 */
async function appUrlOpen(url: string) {
  if (!url) return

  // Handle the OAuth callback
  const urlObj = new URL(url)

  // audiobookshelf://oauth?code...
  // urlObj.hostname for iOS and urlObj.pathname for android
  if (url.startsWith('audiobookshelf://oauth')) {
    // Extract possible errors thrown by the SSO provider
    const authError = urlObj.searchParams.get('error')
    if (authError) {
      console.warn(`[SSO] Received the following error: ${authError}`)
      toast.error(`SSO: Received the following error: ${authError}`)
      return
    }

    // Extract oauth2 code to be exchanged for a token
    const authCode = urlObj.searchParams.get('code')
    // Extract the state variable
    const state = urlObj.searchParams.get('state')

    if (oauth.value.state !== state) {
      console.warn(`[SSO] Wrong state returned by SSO Provider`)
      toast.error(`SSO: The response from the SSO Provider was invalid (wrong state)`)
      return
    }

    // Clear the state variable from the component config
    oauth.value.state = null

    if (authCode) {
      await oauthExchangeCodeForToken(authCode, state!)
    } else {
      console.warn(`[SSO] No code received`)
      toast.error(`SSO: The response from the SSO Provider did not include a code (authentication error?)`)
    }
  } else {
    console.warn(`[ServerConnectForm] appUrlOpen: Unknown url: ${url} - host: ${urlObj.hostname} - path: ${urlObj.pathname}`)
  }
}

const appUrlOpenListener = asVoidHandler(appUrlOpen)

/**
 * Exchanges an oauth2 authorization code for a JWT token.
 * And uses that token to finalise the log in process using authenticateToken()
 *
 * @async
 * @function oauthExchangeCodeForToken
 * @param {string} code - The authorization code provided by the OpenID provider.
 * @param {string} state - The state value used to associate a client session with an ID token.
 * @throws Logs an error and displays a toast notification if the token exchange fails.
 */
async function oauthExchangeCodeForToken(code: string, state: string) {
  // We need to read the url directly from serverConfig.value.address as the callback which is called via the external browser does not pass us that info
  const backendEndpoint = `${serverConfig.value.address}/auth/openid/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}&code_verifier=${encodeURIComponent(oauth.value.verifier!)}`

  try {
    // We can close the browser at this point (does not work on Android)
    if (platform === 'ios' || platform === 'web') {
      await Browser.close()
    }
  } catch {
    // Best effort: the browser may already be closed, or the platform cannot close it.
  }

  try {
    // Returns the same user response payload as /login
    const response = await CapacitorHttp.get({
      url: backendEndpoint
    })
    // v2.26.0+ returns accessToken and refreshToken on user object
    if (!response.data?.user?.token && !response.data?.user?.accessToken) {
      throw new Error('Token is missing in response.')
    }

    const user = response.data.user
    serverConfig.value.token = user.accessToken || user.token

    // TODO: Is it necessary to authenticate again?
    const payload = await authenticateToken()

    if (!payload) {
      throw new Error('Authentication failed with the provided token.')
    }

    const _payload = payload as AuthorizePayload
    const duplicateConfig = serverConnectionConfigs.value.find((scc) => scc.address === serverConfig.value.address && scc.username === _payload.user.username && scc.id !== serverConfig.value.id)
    if (duplicateConfig) {
      throw new Error('Config already exists for this address and username.')
    }

    // For v2.26.0+ re-attach accessToken and refreshToken to user object because /authorize does not return them
    if (user.accessToken) {
      _payload.user.accessToken = user.accessToken
      _payload.user.refreshToken = user.refreshToken
    }

    void setUserAndConnection(_payload)
  } catch (err: unknown) {
    console.error('[SSO] Error in exchangeCodeForToken: ', err)
    toast.error(`SSO error: ${(err as Error | null)?.message || err}`)
  } finally {
    // We don't need the oauth verifier any more
    oauth.value.verifier = null
    oauth.value.challenge = null
  }
}

function showServerList() {
  showForm.value = false
  showAuth.value = false
  error.value = null
  serverConfig.value = {
    address: null,
    userId: null,
    username: null
  }
}

async function connectToServer(config: ServerConnectionConfig) {
  await hapticsImpact()
  console.log('[ServerConnectForm] connectToServer', config.address)
  processing.value = true
  serverConfig.value = {
    ...config
  }
  showForm.value = true
  var success = await pingServerAddress(config.address)
  processing.value = false
  console.log(`[ServerConnectForm] pingServer result ${success}`)
  if (!success) {
    showForm.value = false
    showAuth.value = false
    console.log(`[ServerConnectForm] showForm ${showForm.value}`)
    return
  }

  error.value = null
  const payload = await authenticateToken()

  if (payload) {
    // Will NOT include access token and refresh token
    void setUserAndConnection(payload as AuthorizePayload)
  } else {
    let savedError = error.value
    if (await submit(true)) {
      showForm.value = true
      error.value = savedError
    }
  }
}

async function removeServerConfigClick(config: ServerConnectionConfig) {
  if (!config.id) return
  await hapticsImpact()

  const { value } = await Dialog.confirm({
    title: strings.HeaderConfirm,
    message: strings.MessageConfirmDeleteServerConfig,
  })
  if (value) {
    processing.value = true
    await db.removeServerConnectionConfig(config.id)
    const updatedDeviceData = { ...(deviceData.value as DeviceData) }
    updatedDeviceData.serverConnectionConfigs = ((deviceData.value as DeviceData).serverConnectionConfigs ?? []).filter((scc) => scc.id != config.id)
    appStore.setDeviceData(updatedDeviceData as DeviceData)

    serverConfig.value = {
      address: null,
      userId: null,
      username: null
    }
    password.value = null
    processing.value = false
    showAuth.value = false
    showForm.value = !serverConnectionConfigs.value.length
    error.value = null
  }
}

async function editServerConfig(config: ServerConnectionConfig) {
  serverConfig.value = {
    ...config
  }

  if (await submit(true)) {
    showForm.value = true
  }
}

async function newServerConfigClick() {
  await hapticsImpact()
  serverConfig.value = {
    address: '',
    userId: '',
    username: ''
  }
  showForm.value = true
  showAuth.value = false
  error.value = null
}

function editServerAddress() {
  error.value = null
  showAuth.value = false
}

/**
 * Validates a URL and reconstructs it with an optional protocol override.
 * If the URL is invalid, null is returned.
 *
 * @param {string} url - The URL to validate.
 * @param {string|null} [protocolOverride=null] - (Optional) Protocol to override the URL's original protocol.
 * @returns {string|null} The validated URL with the original or overridden protocol, or null if invalid.
 */
function validateServerUrl(url: string, protocolOverride: string | null = null): string | null {
  try {
    var urlObject = new URL(url)
    if (protocolOverride) urlObject.protocol = protocolOverride
    return urlObject.href.replace(/\/$/, '') // Remove trailing slash
  } catch (err) {
    console.error('Invalid URL', err)
    return null
  }
}

/**
 * Sends a GET request to the specified URL with the provided headers and timeout.
 * If the response is successful (HTTP 200), the response object is returned.
 * Otherwise, throws an error object containing code.
 * code can be either a number, which is then a HTTP status code or
 *  a string, which is then a keyword like NSURLErrorBadURL when the TCP connection could not be established.
 * When code is a string, error.message contains the human readable error by the OS or
 *  the http body of the non-200 answer.
 *
 * @async
 * @param {string} url - The URL to which the GET request will be sent.
 * @param {Object} headers - HTTP headers to be included in the request.
 * @param {number} [connectTimeout=6000] - Timeout for the request in milliseconds.
 * @returns {Promise<HttpResponse>} The HTTP response object if the request is successful.
 * @throws {Error} An error with 'code' property set to the HTTP status code if the response is not successful.
 * @throws {Error} An error with 'code' property set to the error code if the request fails.
 */
async function getRequest(url: string, headers?: Record<string, string>, connectTimeout = 6000) {
  const options = {
    url,
    headers,
    connectTimeout
  }
  try {
    const response = await CapacitorHttp.get(options)
    console.log('[ServerConnectForm] GET request response', response)
    if (response.status == 200) {
      return response
    } else {
      // Put the HTTP error code inside the cause
      const errorObj: Error & { code?: unknown } = new Error(response.data)
      errorObj.code = response.status
      throw errorObj
    }
  } catch (err: unknown) {
    // Put the error name inside the cause (a string)
    const caught = err as { message?: string; code?: unknown }
    const errorObj: Error & { code?: unknown } = new Error(caught.message)
    errorObj.code = caught.code
    throw errorObj
  }
}

async function postRequest(url: string, data: unknown, headers?: Record<string, string>, connectTimeout = 6000) {
  if (!headers) headers = {}
  if (!headers['Content-Type'] && data) {
    headers['Content-Type'] = 'application/json'
  }
  const options = {
    url,
    headers,
    data,
    connectTimeout
  }
  const response = await CapacitorHttp.post(options)
  console.log('[ServerConnectForm] POST request response', response)
  if (response.status >= 400) {
    throw new Error(response.data)
  } else {
    return response.data
  }
}

/**
 * Get request to server /status api endpoint
 *
 * @param {string} address
 * @returns {Promise<HttpResponse>}
 *    HttpResponse.data is {isInit:boolean, language:string, authMethods:string[]}>
 */
async function getServerAddressStatus(address: string) {
  return getRequest(`${address}/status`)
}

function pingServerAddress(address: string, customHeaders?: Record<string, string>) {
  return getRequest(`${address}/ping`, customHeaders)
    .then((response) => {
      return response.data.success
    })
    .catch((err) => {
      console.error('Server ping failed', err)
      const errorMsg = err.message || err
      error.value = 'Failed to ping server'
      if (typeof errorMsg === 'string') {
        error.value += ` (${errorMsg})`
      }

      return false
    })
}

function requestServerLogin() {
  const headers: Record<string, string> = {
    // Tells the Abs server to return the refresh token
    'x-return-tokens': 'true',
    ...(serverConfig.value.customHeaders || {})
  }
  return postRequest(`${serverConfig.value.address}/login`, { username: serverConfig.value.username, password: password.value || '' }, headers, 20000)
    .then((data) => {
      if (!data.user) {
        console.error(data.error)
        error.value = data.error || 'Unknown Error'
        return false
      }
      return data
    })
    .catch((err) => {
      console.error('Server auth failed', err)
      const errorMsg = err.message || err
      error.value = 'Failed to login'
      if (typeof errorMsg === 'string') {
        error.value += ` (${errorMsg})`
      }
      return false
    })
}

async function submit(preventAutoLogin = false): Promise<boolean> {
  if (!networkConnected.value || !serverConfig.value.address) return false

  const initialAddress = serverConfig.value.address
  // Did the user specify a protocol?
  const protocolProvided = initialAddress.startsWith('http://') || initialAddress.startsWith('https://')
  // Add https:// if not provided
  serverConfig.value.address = prependProtocolIfNeeded(initialAddress)

  processing.value = true
  error.value = null
  authMethods.value = []

  try {
    console.log('[ServerConnectForm] submit tryServerUrl: ' + serverConfig.value.address)
    // Try the server URL. If it fails and the protocol was not provided, try with http instead of https
    const statusData = await tryServerUrl(serverConfig.value.address, !protocolProvided)
    if (validateLoginFormResponse(statusData, serverConfig.value.address, protocolProvided)) {
      showAuth.value = true
      authMethods.value = statusData.data.authMethods || []
      oauth.value.buttonText = statusData.data.authFormData?.authOpenIDButtonText || 'Login with OpenID'
      serverConfig.value.version = statusData.data.serverVersion

      if (statusData.data.authFormData?.authOpenIDAutoLaunch && !preventAutoLogin) {
        void clickLoginWithOpenId()
      }
      return true
    } else {
      console.log('[ServerConnectForm] submit validateLoginFormResponse failed: ' + serverConfig.value.address)
      return false
    }
  } catch (err) {
    handleLoginFormError(err as { code?: unknown })
    return false
  } finally {
    processing.value = false
  }
}

/** Validates the login form response from the server.
 *
 * Ensure the request has not been redirected to an unexpected hostname and check if it is Audiobookshelf
 *
 * @param {object} statusData - The data received from the server's response, including data and url.
 * @param {string} initialAddressWithProtocol - The initial server address including the protocol used for the request.
 * @param {boolean} protocolProvided - Indicates whether the protocol was explicitly provided in the initial address.
 *
 * @returns {boolean} - Returns `true` if the response is valid, otherwise `false` and sets error.value.
 */
function validateLoginFormResponse(statusData: { url: string; data?: unknown } | null | undefined, initialAddressWithProtocol: string, protocolProvided: boolean): boolean {
  // We have a 200 status code at this point

  // Check if we got redirected to a different hostname, we don't allow this
  if (!statusData) {
    error.value = 'The server did not answer'
    return false
  }
  const initialAddressUrl = new URL(initialAddressWithProtocol)
  const currentAddressUrl = new URL(statusData.url)
  if (initialAddressUrl.hostname !== currentAddressUrl.hostname) {
    error.value = `Server redirected somewhere else (to ${currentAddressUrl.hostname})`
    console.error(`[ServerConnectForm] Server redirected somewhere else (to ${currentAddressUrl.hostname})`)
    return false
  } // We don't allow a redirection back from https to http if the user used https:// explicitly
  else if (protocolProvided && initialAddressWithProtocol.startsWith('https://') && currentAddressUrl.protocol === 'http') {
    error.value = `You specified https:// but the Server redirected back to plain http`
    console.error(`[ServerConnectForm] User specified https:// but server redirected to http`)
    return false
  }

  // Check content of response now
  if (!statusData.data || Object.keys(statusData).length === 0) {
    error.value = 'Response from server was empty' // Usually some kind of config error on server side
    console.error('[ServerConnectForm] Received empty response')
    return false
  } else if (!('isInit' in (statusData.data as Record<string, unknown>)) || !('language' in (statusData.data as Record<string, unknown>))) {
    error.value = 'This does not seem to be a Audiobookshelf server'
    console.error('[ServerConnectForm] Received as response from Server:\n', statusData)
    return false
    //    TODO: delete the if above and comment the ones below out, as soon as the backend is ready to introduce a version check
    //    } else if (!('app' in statusData.data) || statusData.data.app.toLowerCase() !== 'audiobookshelf') {
    //      error.value = 'This does not seem to be a Audiobookshelf server'
    //      console.error('[ServerConnectForm] Received as response from Server:\n', statusData)
    //      return false
    //    } else if (!isValidVersion(statusData.data.serverVersion, requiredServerVersion)) {
    //      error.value = `Server version is below minimum required version of ${requiredServerVersion} (${statusData.data.serverVersion})`
    //      console.error('[ServerConnectForm] Server version is too low: ', statusData.data.serverVersion)
    //      return false
  } else if (!(statusData.data as { isInit?: boolean }).isInit) {
    error.value = 'Server is not initialized'
    return false
  }

  // If we got redirected from http to https, we allow this
  // Also there is the possibility that https was tried (with protocolProvided false) but only http was successfull
  // So set the correct protocol for the config
  const configUrl = new URL(serverConfig.value.address ?? '')
  configUrl.protocol = currentAddressUrl.protocol
  // Remove trailing slash
  serverConfig.value.address = configUrl.toString().replace(/\/$/, '')

  return true
}

/**
 * Handles errors received during the login form process, providing user-friendly error messages.
 *
 * @param {Object} err - The error object received from a failed login attempt.
 */
function handleLoginFormError(err: { code?: unknown }) {
  console.error('[ServerConnectForm] Received invalid status', err)

  if (err.code === 404) {
    error.value = `This does not seem to be an Audiobookshelf server. (Error: 404 querying /status)`
  } else if (typeof err.code === 'number') {
    // Error with HTTP Code
    error.value = `Failed to retrieve status of server: ${err.code}`
  } else {
    // error is usually a meaningful error like "Server timed out"
    error.value = `Failed to contact server. (${err})`
  }
}

/**
 * Attempts to retrieve the server address status for the given URL.
 * If the initial attempt fails, it retries with HTTP if allowed.
 *
 * @param {string} address - The URL address to validate and check.
 * @param {boolean} shouldRetryWithHttp - Flag to indicate if the function should retry with HTTP on failure.
 * @returns {Promise<HttpResponse>}
 *    HttpResponse.data is {isInit:boolean, language:string, authMethods:string[]}>
 * @throws Will throw an error if the URL has a wrong format or if both HTTPS and HTTP (if retried) requests fail.
 */
async function tryServerUrl(address: string, shouldRetryWithHttp: boolean) {
  const validatedUrl = validateServerUrl(address)
  if (!validatedUrl) {
    throw new Error('URL has wrong format')
  }

  try {
    return await getServerAddressStatus(validatedUrl)
  } catch (err: unknown) {
    // We only retry when the user did not specify a protocol
    // Also for security reasons, we only retry when the https request did not
    //      return a http status code (so only retry when the TCP connection could not be established)
    if (shouldRetryWithHttp && typeof (err as { code?: unknown }).code !== 'number') {
      console.log('[ServerConnectForm] https failed, trying to connect with http...')
      const validatedHttpUrl = validateServerUrl(address, 'http:')
      if (validatedHttpUrl) {
        return await getServerAddressStatus(validatedHttpUrl)
      }
      // else if validatedHttpUrl is false return the original error below
    }
    // rethrow original error
    throw err
  }
}

/**
 * Ensures that a protocol is prepended to the given address if it does not already start with http:// or https://.
 *
 * @param {string} address - The server address that may or may not have a protocol.
 * @returns {string} The address with a protocol prepended if it was missing.
 */
function prependProtocolIfNeeded(address: string): string {
  return address.startsWith('http://') || address.startsWith('https://') ? address : `https://${address}`
}

async function submitAuth() {
  if (!networkConnected.value) return
  if (!serverConfig.value.username) {
    error.value = 'Invalid username'
    return
  }

  const duplicateConfig = serverConnectionConfigs.value.find((scc) => scc.address === serverConfig.value.address && scc.username === serverConfig.value.username && serverConfig.value.id !== scc.id)
  if (duplicateConfig) {
    error.value = 'Config already exists for this address and username'
    return
  }

  error.value = null
  processing.value = true

  const payload = await requestServerLogin()
  processing.value = false
  if (payload) {
    // Will include access token and refresh token
    void setUserAndConnection(payload)
  }
}

async function setUserAndConnection({ user, userDefaultLibraryId, serverSettings, ereaderDevices }: AuthorizePayload) {

  console.log('Successfully logged in', JSON.stringify(user))

  appStore.setServerSettings(serverSettings)
  librariesStore.ereaderDevices = ereaderDevices || []
  setServerLanguageCode(serverSettings.language ?? '')

  serverConfig.value.userId = user.id
  serverConfig.value.username = user.username

  if (isValidVersion(serverSettings.version ?? '', '2.26.0')) {
    // Tokens only returned from /login endpoint
    if (user.accessToken) {
      serverConfig.value.token = user.accessToken
      serverConfig.value.refreshToken = user.refreshToken
    } else {
      // Detect if the connection config is using the old token. If so, force re-login
      if (serverConfig.value.token === user.token || user.isOldToken) {
        void setForceRelogin('oldAuthToken')
        return
      }

      // If the token was updated during a refresh (in nativeHttp.js) it gets updated in the store, so refetch
      serverConfig.value.token = userStore.getToken || serverConfig.value.token
    }
  } else {
    // Server version before new JWT auth, use old user.token
    serverConfig.value.token = user.token
  }

  serverConfig.value.version = serverSettings.version ?? null

  var serverConnectionConfig = await db.setServerConnectionConfig(serverConfig.value)

  // Set the device language to match the servers if this is the first server connection
  if (!serverConnectionConfigs.value.length && serverSettings.language !== 'en-us') {
    const updatedDeviceSettings = {
      ...deviceSettings.value,
      languageCode: serverSettings.language
    }
    const updatedDeviceData = await db.updateDeviceSettings(updatedDeviceSettings as Record<string, unknown>)
    if (updatedDeviceData) {
      appStore.setDeviceData(updatedDeviceData as DeviceData)
      void setLanguageCode((updatedDeviceData as DeviceData).deviceSettings?.languageCode || 'en-us')
    }
  }

  // Set library - Use last library if set and available fallback to default user library
  const lastLibraryId = await localStore.getLastLibraryId()
  if (lastLibraryId && (!user.librariesAccessible?.length || user.librariesAccessible.includes(lastLibraryId))) {
    librariesStore.currentLibraryId = lastLibraryId
  } else if (userDefaultLibraryId) {
    librariesStore.currentLibraryId = userDefaultLibraryId
  }

  userStore.user = user
  userStore.accessToken = (serverConnectionConfig as ServerConnectionConfig).token
  userStore.serverConnectionConfig = serverConnectionConfig as ServerConnectionConfig

  useLocalStore().setUserId(user.id)
  await userStore.loadUserSettings()

  socket.connect(serverConfig.value.address ?? '', serverConfig.value.token ?? '')
  void router.replace('/bookshelf')
}

async function authenticateToken() {
  if (!networkConnected.value) return
  if (!serverConfig.value.token) {
    error.value = 'No token'
    return
  }

  error.value = null
  processing.value = true

  const nativeHttpOptions = {
    headers: {
      Authorization: `Bearer ${serverConfig.value.token}`
    },
    serverConnectionConfig: serverConfig.value as { id: string; address: string; token?: string; refreshToken?: string }
  }
  const authRes = await nativeHttp.post(`${serverConfig.value.address}/api/authorize`, null, { ...nativeHttpOptions, connectTimeout: 10000 }).catch((err: HttpError) => {
    console.error('[ServerConnectForm] Server auth failed', err)
    const errorMsg = err.message || err
    error.value = 'Failed to authorize'
    if (typeof errorMsg === 'string') {
      error.value += ` (${errorMsg})`
    }
    return false
  })
  console.log('[ServerConnectForm] authRes=', authRes)

  processing.value = false
  return authRes
}

async function setForceRelogin(err: string) {
  console.log('[ServerConnectForm] setForceRelogin', err, serverConfig.value.address)
  // This calls /status on the server and sets the auth methods
  const result = await submit(true)
  if (result) {
    showForm.value = true

    if (err === 'oldAuthToken') {
      error.value = strings.MessageOldServerAuthReLoginRequired
    } else if (err === 'refreshTokenFailed') {
      error.value = strings.MessageFailedToRefreshToken
    }
  }
}

function init() {
  if (route.query.serverConnectionConfigId) {
    // Handle force re-login for servers using new JWT auth but still using an old token OR refresh token failed
    const _serverConfig = serverConnectionConfigs.value.find((scc) => scc.id === route.query.serverConnectionConfigId)
    if (_serverConfig) {
      serverConfig.value = { ..._serverConfig }
      void setForceRelogin(route.query.error as string)
      return
    } else {
      console.error('[ServerConnectForm] init with serverConnectionConfigId but no serverConfig found', route.query.serverConnectionConfigId)
    }
  }

  if (lastServerConnectionConfig.value) {
    console.log('[ServerConnectForm] init with lastServerConnectionConfig', lastServerConnectionConfig.value)
    void connectToServer(lastServerConnectionConfig.value)
  } else {
    showForm.value = !serverConnectionConfigs.value.length
  }
}

// Lifecycle
onMounted(() => {
  eventBus.on('url-open', appUrlOpenListener)
  init()
})

onBeforeUnmount(() => {
  eventBus.off('url-open', appUrlOpenListener)
})
</script>
