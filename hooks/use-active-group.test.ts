import { describe, expect, it, vi } from 'vitest'

import {
  getActiveGroupRootMargin,
  observeActiveGroups,
  resolveStickyAnchorTop,
} from './use-active-group'

const ROOT_MARGIN = '-112px 0px -724px 0px'

function createElement(id: string, getTop: () => number = () => 0): Element {
  return {
    id,
    getBoundingClientRect: () => ({ top: getTop() }),
  } as Element
}

function createEntry(
  target: Element,
  top: number,
  isIntersecting: boolean
): IntersectionObserverEntry {
  return {
    target,
    boundingClientRect: { top },
    isIntersecting,
  } as IntersectionObserverEntry
}

function createObserverHarness() {
  let callback: IntersectionObserverCallback | null = null
  const observer: Pick<IntersectionObserver, 'observe' | 'disconnect'> = {
    observe: vi.fn(),
    disconnect: vi.fn(),
  }
  const createObserver = vi.fn((
    nextCallback: IntersectionObserverCallback
  ) => {
    callback = nextCallback
    return observer
  })

  return {
    createObserver,
    observer,
    emit(entries: IntersectionObserverEntry[]) {
      if (callback === null) throw new Error('observer was not created')
      callback(entries, observer as IntersectionObserver)
    },
  }
}

describe('getActiveGroupRootMargin', () => {
  it('builds a 64px activation band below the sticky header', () => {
    expect(getActiveGroupRootMargin(900)).toBe('-112px 0px -724px 0px')
    expect(getActiveGroupRootMargin(844)).toBe('-112px 0px -668px 0px')
  })

  it('clamps the bottom inset for a very short viewport', () => {
    expect(getActiveGroupRootMargin(160)).toBe('-112px 0px -0px 0px')
  })

  it('accounts for an expanded sticky quick-access row', () => {
    expect(getActiveGroupRootMargin(900, 176)).toBe('-176px 0px -660px 0px')
  })
})

describe('resolveStickyAnchorTop', () => {
  it('keeps the legacy minimum while honoring taller sticky content', () => {
    expect(resolveStickyAnchorTop([56, 104])).toBe(112)
    expect(resolveStickyAnchorTop([56, 144])).toBe(144)
  })

  it('ignores invalid measurements and falls back to the minimum', () => {
    expect(resolveStickyAnchorTop([Number.NaN, 0])).toBe(112)
  })
})

describe('observeActiveGroups', () => {
  it('observes existing group elements and ignores missing elements', () => {
    const vps = createElement('group-vps')
    const getElementById = vi.fn((id: string) =>
      id === 'group-vps' ? vps : null
    )
    const harness = createObserverHarness()

    observeActiveGroups(['vps', 'missing'], vi.fn(), ROOT_MARGIN, {
      getElementById,
      createObserver: harness.createObserver,
    })

    expect(getElementById).toHaveBeenCalledWith('group-vps')
    expect(getElementById).toHaveBeenCalledWith('group-missing')
    expect(harness.observer.observe).toHaveBeenCalledTimes(1)
    expect(harness.observer.observe).toHaveBeenCalledWith(vps)
    expect(harness.createObserver).toHaveBeenCalledWith(
      expect.any(Function),
      { rootMargin: ROOT_MARGIN }
    )
  })

  it('activates the closest intersecting entry in the current batch', () => {
    const vps = createElement('group-vps', () => -180)
    const docs = createElement('group-docs', () => 118)
    const onActive = vi.fn()
    const harness = createObserverHarness()

    observeActiveGroups(['vps', 'docs'], onActive, ROOT_MARGIN, {
      getElementById: (id) => id === 'group-vps' ? vps : docs,
      createObserver: harness.createObserver,
    })
    harness.emit([
      createEntry(vps, -180, true),
      createEntry(docs, 118, true),
    ])

    expect(onActive).toHaveBeenCalledTimes(1)
    expect(onActive).toHaveBeenCalledWith('docs')
  })

  it('uses the measured sticky anchor when choosing the active entry', () => {
    const vps = createElement('group-vps', () => 112)
    const docs = createElement('group-docs', () => 170)
    const onActive = vi.fn()
    const harness = createObserverHarness()

    observeActiveGroups(['vps', 'docs'], onActive, ROOT_MARGIN, {
      getElementById: (id) => id === 'group-vps' ? vps : docs,
      createObserver: harness.createObserver,
    }, 176)
    harness.emit([
      createEntry(vps, 112, true),
      createEntry(docs, 170, true),
    ])

    expect(onActive).toHaveBeenCalledWith('docs')
  })

  it('keeps intersecting state across incremental observer callbacks', () => {
    let vpsTop = -300
    let docsTop = 118
    const vps = createElement('group-vps', () => vpsTop)
    const docs = createElement('group-docs', () => docsTop)
    const onActive = vi.fn()
    const harness = createObserverHarness()

    observeActiveGroups(['vps', 'docs'], onActive, ROOT_MARGIN, {
      getElementById: (id) => id === 'group-vps' ? vps : docs,
      createObserver: harness.createObserver,
    })

    harness.emit([createEntry(docs, docsTop, true)])
    expect(onActive).toHaveBeenLastCalledWith('docs')

    onActive.mockClear()
    harness.emit([createEntry(vps, vpsTop, true)])
    expect(onActive).not.toHaveBeenCalled()

    onActive.mockClear()
    vpsTop = 112
    docsTop = 300
    harness.emit([createEntry(docs, docsTop, false)])
    expect(onActive).toHaveBeenLastCalledWith('vps')
  })

  it('preserves the active group for an all-nonintersecting batch', () => {
    const vps = createElement('group-vps')
    const docs = createElement('group-docs')
    const onActive = vi.fn()
    const harness = createObserverHarness()

    observeActiveGroups(['vps', 'docs'], onActive, ROOT_MARGIN, {
      getElementById: (id) => id === 'group-vps' ? vps : docs,
      createObserver: harness.createObserver,
    })
    harness.emit([createEntry(vps, 112, true)])
    onActive.mockClear()

    harness.emit([createEntry(docs, 400, false)])

    expect(onActive).not.toHaveBeenCalled()
  })

  it('activates the last group when a scrollable page reaches the bottom', () => {
    let scrollListener: () => void = () => {
      throw new Error('scroll listener was not registered')
    }
    const addEventListener = vi.fn((type: string, listener: () => void) => {
      if (type === 'scroll') scrollListener = listener
    })
    const removeEventListener = vi.fn()
    const testWindow = {
      innerHeight: 844,
      scrollY: 0,
      addEventListener,
      removeEventListener,
    }
    vi.stubGlobal('window', testWindow)
    vi.stubGlobal('document', {
      documentElement: { scrollHeight: 1050 },
    })

    const vps = createElement('group-vps', () => -68)
    const docs = createElement('group-docs', () => 588)
    const onActive = vi.fn()
    const harness = createObserverHarness()
    const cleanup = observeActiveGroups(
      ['vps', 'docs'],
      onActive,
      ROOT_MARGIN,
      {
        getElementById: (id) => id === 'group-vps' ? vps : docs,
        createObserver: harness.createObserver,
      }
    )

    harness.emit([createEntry(vps, -68, true)])
    expect(onActive).toHaveBeenLastCalledWith('vps')

    onActive.mockClear()
    testWindow.scrollY = 206
    scrollListener()

    expect(onActive).toHaveBeenCalledWith('docs')

    cleanup()
    expect(removeEventListener).toHaveBeenCalledWith(
      'scroll',
      scrollListener
    )
    vi.unstubAllGlobals()
  })

  it('disconnects the observer during cleanup', () => {
    const harness = createObserverHarness()
    const cleanup = observeActiveGroups(['vps'], vi.fn(), ROOT_MARGIN, {
      getElementById: () => createElement('group-vps'),
      createObserver: harness.createObserver,
    })

    cleanup()

    expect(harness.observer.disconnect).toHaveBeenCalledTimes(1)
  })

  it('ignores observer callbacks queued before cleanup', () => {
    const vps = createElement('group-vps')
    const onActive = vi.fn()
    const harness = createObserverHarness()
    const cleanup = observeActiveGroups(['vps'], onActive, ROOT_MARGIN, {
      getElementById: () => vps,
      createObserver: harness.createObserver,
    })

    cleanup()
    harness.emit([createEntry(vps, 112, true)])

    expect(onActive).not.toHaveBeenCalled()
  })

  it('returns a no-op cleanup when observers are unsupported', () => {
    const getElementById = vi.fn()
    const cleanup = observeActiveGroups(['vps'], vi.fn(), ROOT_MARGIN, {
      getElementById,
    })

    expect(() => cleanup()).not.toThrow()
    expect(getElementById).not.toHaveBeenCalled()
  })

  it('supports re-observation through separate lifecycle invocations', () => {
    const vps = createElement('group-vps')
    const docs = createElement('group-docs')
    const firstHarness = createObserverHarness()
    const secondHarness = createObserverHarness()

    const cleanupFirst = observeActiveGroups(['vps'], vi.fn(), ROOT_MARGIN, {
      getElementById: () => vps,
      createObserver: firstHarness.createObserver,
    })
    cleanupFirst()
    observeActiveGroups(['docs'], vi.fn(), ROOT_MARGIN, {
      getElementById: () => docs,
      createObserver: secondHarness.createObserver,
    })

    expect(firstHarness.observer.observe).toHaveBeenCalledWith(vps)
    expect(firstHarness.observer.disconnect).toHaveBeenCalledTimes(1)
    expect(secondHarness.observer.observe).toHaveBeenCalledWith(docs)
  })
})
