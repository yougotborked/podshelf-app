<template>
  <div class="mobi-ebook-viewer w-full relative">
    <div class="absolute overflow-hidden left-0 top-0 w-screen max-w-screen m-auto z-10 border border-black/20 shadow-md bg-white">
      <iframe title="html-viewer" class="w-full overflow-hidden"> Loading </iframe>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import MobiParser from '@/assets/ebooks/mobi.js'
import HtmlParser from '@/assets/ebooks/htmlParser.js'
import defaultCss from '@/assets/ebooks/basic.js'

const props = defineProps<{
  url: string
  libraryItem: Record<string, unknown>
}>()

const userStore = useUserStore()

function handleIFrameHeight(iFrame: HTMLIFrameElement) {
  const isElement = (obj: unknown) => !!(obj && (obj as Node).nodeType === 1)

  const body = iFrame.contentWindow!.document.body
  const html = iFrame.contentWindow!.document.documentElement
  iFrame.height = String(Math.max(body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight) * 2)

  setTimeout(() => {
    const lastchild = body.lastElementChild
    const lastEle = body.lastChild

    const itemAs = body.querySelectorAll('a')
    const itemPs = body.querySelectorAll('p')
    const lastItemA = itemAs[itemAs.length - 1]
    const lastItemP = itemPs[itemPs.length - 1]
    let lastItem: Element | null = null
    if (lastItemA && lastItemP && isElement(lastItemA) && isElement(lastItemP)) {
      if (lastItemA.clientHeight + lastItemA.offsetTop > lastItemP.clientHeight + lastItemP.offsetTop) {
        lastItem = lastItemA
      } else {
        lastItem = lastItemP
      }
    }

    if (!lastchild && !lastItem && !lastEle) return
    if (lastEle && (lastEle as Node).nodeType === 3 && !lastchild && !lastItem) return

    let nodeHeight = 0
    if (lastEle && (lastEle as Node).nodeType === 3 && document.createRange) {
      const range = document.createRange()
      range.selectNodeContents(lastEle)
      if (range.getBoundingClientRect) {
        const rect = range.getBoundingClientRect()
        if (rect) {
          nodeHeight = rect.bottom - rect.top
        }
      }
    }
    const lastChildHeight = isElement(lastchild) ? (lastchild as Element).clientHeight + (lastchild as HTMLElement).offsetTop : 0
    const lastEleHeight = isElement(lastEle) ? (lastEle as HTMLElement).clientHeight + (lastEle as HTMLElement).offsetTop : 0
    const lastItemHeight = isElement(lastItem) ? (lastItem as HTMLElement).clientHeight + (lastItem as HTMLElement).offsetTop : 0
    iFrame.height = String(Math.max(lastChildHeight, lastEleHeight, lastItemHeight) + 100 + nodeHeight)
  }, 500)
}

async function initMobi() {
  // Fetch mobi file as blob
  // TODO: Handle JWT auth refresh
  const response = await fetch(props.url, {
    headers: {
      Authorization: `Bearer ${userStore.getToken}`
    }
  })
  const buff = await response.blob()
  const reader = new FileReader()
  reader.onload = async (event) => {
    const file_content = (event.target as FileReader).result

    const mobiFile = new MobiParser(file_content)

    const content = await mobiFile.render()
    const htmlParser = new HtmlParser(new DOMParser().parseFromString(content.outerHTML, 'text/html'))
    const anchoredDoc = htmlParser.getAnchoredDoc()

    const iFrame = document.getElementsByTagName('iframe')[0]
    if (!iFrame) throw new Error('The reader frame is not in the page')
    iFrame.contentDocument!.body.innerHTML = anchoredDoc.documentElement.outerHTML

    // Add css
    const style = iFrame.contentDocument!.createElement('style')
    style.id = 'default-style'
    style.textContent = defaultCss
    iFrame.contentDocument!.head.appendChild(style)

    handleIFrameHeight(iFrame)
  }
  reader.readAsArrayBuffer(buff)
}

onMounted(() => {
  void initMobi()
})
</script>

<style>
.mobi-ebook-viewer {
  height: calc(100% - 32px);
  max-height: calc(100% - 32px);
  overflow-x: hidden;
  overflow-y: auto;
}
.reader-player-open .mobi-ebook-viewer {
  height: calc(100% - 132px);
  max-height: calc(100% - 132px);
  overflow-x: hidden;
  overflow-y: auto;
}
</style>
