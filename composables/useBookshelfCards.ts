import { createApp, type Component } from 'vue'
import { createPinia } from 'pinia'

// Dynamic imports for card components (resolved at runtime in Phase 2+)
// These components will be created in Task 2.x — for now we use dynamic imports
async function getComponentClass(entityName: string, showBookshelfListView: boolean): Promise<Component> {
  if (entityName === 'series') {
    const { default: LazySeriesCard } = await import('~/components/cards/LazySeriesCard.vue').catch(() => ({ default: {} as Component }))
    return LazySeriesCard
  }
  if (entityName === 'collections') {
    const { default: LazyCollectionCard } = await import('~/components/cards/LazyCollectionCard.vue').catch(() => ({ default: {} as Component }))
    return LazyCollectionCard
  }
  if (entityName === 'playlists') {
    const { default: LazyPlaylistCard } = await import('~/components/cards/LazyPlaylistCard.vue').catch(() => ({ default: {} as Component }))
    return LazyPlaylistCard
  }
  if (showBookshelfListView) {
    const { default: LazyListBookCard } = await import('~/components/cards/LazyListBookCard.vue').catch(() => ({ default: {} as Component }))
    return LazyListBookCard
  }
  const { default: LazyBookCard } = await import('~/components/cards/LazyBookCard.vue').catch(() => ({ default: {} as Component }))
  return LazyBookCard
}

export interface BookshelfCardsOptions {
  entityName: { value: string }
  entitiesPerShelf: { value: number }
  entityWidth: { value: number }
  entityHeight: { value: number }
  totalEntityCardWidth: { value: number }
  bookshelfMarginLeft: { value: number }
  bookCoverAspectRatio: { value: number }
  altViewEnabled: { value: boolean | undefined }
  showBookshelfListView: { value: boolean }
  isBookEntity: { value: boolean }
  entities: { value: Record<string, unknown>[] }
  localLibraryItems: { value: Record<string, unknown>[] }
  localLibraryItemMap: { value: Map<string, Record<string, unknown>> | null }
  filterBy: { value: string | null | unknown }
  orderBy: { value: string | null | unknown }
  sortingIgnorePrefix: { value: boolean | null | unknown }
}

export function useBookshelfCards(options: BookshelfCardsOptions) {
  const entityIndexesMounted: number[] = []
  const entityComponentRefs: Record<number, { $el: HTMLElement; setSelectionMode: (v: boolean) => void; isHovering: boolean; setEntity: (e: unknown) => void; setLocalLibraryItem: (e: unknown) => void; unmount: () => void }> = {}

  const mountEntityCard = async (index: number): Promise<void> => {
    const shelf = Math.floor(index / options.entitiesPerShelf.value)
    const shelfEl = document.getElementById(`shelf-${shelf}`)
    if (!shelfEl) {
      console.error('mount entity card invalid shelf', shelf, 'book index', index)
      return
    }

    entityIndexesMounted.push(index)

    if (entityComponentRefs[index]) {
      const bookComponent = entityComponentRefs[index]
      shelfEl.appendChild(bookComponent.$el)
      bookComponent.setSelectionMode(false)
      bookComponent.isHovering = false
      return
    }

    const shelfOffsetY = options.showBookshelfListView.value ? 8 : options.isBookEntity.value ? 24 : 16
    const row = index % options.entitiesPerShelf.value
    const marginShiftLeft = options.showBookshelfListView.value ? 0 : 12
    const shelfOffsetX = row * options.totalEntityCardWidth.value + options.bookshelfMarginLeft.value + marginShiftLeft

    const ComponentClass = await getComponentClass(options.entityName.value, options.showBookshelfListView.value)

    const props: Record<string, unknown> = {
      index,
      width: options.entityWidth.value,
      height: options.entityHeight.value,
      bookCoverAspectRatio: options.bookCoverAspectRatio.value,
      isAltViewEnabled: options.altViewEnabled.value
    }
    if (options.entityName.value === 'series-books') props.showSequence = true
    if (options.entityName.value === 'books') {
      props.filterBy = options.filterBy.value
      props.orderBy = options.orderBy.value
      props.sortingIgnorePrefix = options.sortingIgnorePrefix.value
    }

    // Vue 3: imperative mount using createApp + Pinia
    const nuxtApp = useNuxtApp()
    const container = document.createElement('div')
    const app = createApp(ComponentClass, props)
    // Share the same Pinia instance so stores are shared
    app.use(nuxtApp.$pinia as ReturnType<typeof createPinia>)
    const instance = app.mount(container) as unknown as {
      $el: HTMLElement
      setSelectionMode: (v: boolean) => void
      isHovering: boolean
      setEntity: (e: unknown) => void
      setLocalLibraryItem: (e: unknown) => void
    }

    const componentRef = {
      $el: container.firstElementChild as HTMLElement | null | undefined || container,
      setSelectionMode: instance.setSelectionMode?.bind(instance) || (() => {}),
      get isHovering() { return instance.isHovering },
      set isHovering(v: boolean) { instance.isHovering = v },
      setEntity: instance.setEntity?.bind(instance) || (() => {}),
      setLocalLibraryItem: instance.setLocalLibraryItem?.bind(instance) || (() => {}),
      unmount: () => app.unmount()
    }

    entityComponentRefs[index] = componentRef
    componentRef.$el.style.transform = `translate3d(${shelfOffsetX}px, ${shelfOffsetY}px, 0px)`
    componentRef.$el.classList.add('absolute', 'top-0', 'left-0')
    shelfEl.appendChild(componentRef.$el)

    if (options.entities.value[index]) {
      const entity = options.entities.value[index]
      componentRef.setEntity(entity)

      if (options.isBookEntity.value && !(entity as Record<string, unknown>).isLocal) {
        const localLibraryItemMap = options.localLibraryItemMap.value
        const localLibraryItems = options.localLibraryItems.value
        const localLibraryItem =
          (localLibraryItemMap && typeof localLibraryItemMap.get === 'function'
            ? localLibraryItemMap.get((entity as Record<string, unknown>).id as string)
            : localLibraryItems.find((lli) => (lli as Record<string, unknown>).libraryItemId == (entity as Record<string, unknown>).id)) || null
        if (localLibraryItem) componentRef.setLocalLibraryItem(localLibraryItem)
      }
    }
  }

  return {
    entityIndexesMounted,
    entityComponentRefs,
    mountEntityCard,
    cardsHelpers: { mountEntityCard }
  }
}
