import { describe, expect, it, vi } from 'vitest'

import { observeActiveGroups } from './use-active-group'

function createElement(id: string): Element {
  return { id } as Element
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

describe('observeActiveGroups', () => {
  it('observes existing group elements and ignores missing elements', () => {
    const vps = createElement('group-vps')
    const getElementById = vi.fn((id: string) =>
      id === 'group-vps' ? vps : null
    )
    const harness = createObserverHarness()

    observeActiveGroups(['vps', 'missing'], vi.fn(), {
      getElementById,
      createObserver: harness.createObserver,
    })

    expect(getElementById).toHaveBeenCalledWith('group-vps')
    expect(getElementById).toHaveBeenCalledWith('group-missing')
    expect(harness.observer.observe).toHaveBeenCalledTimes(1)
    expect(harness.observer.observe).toHaveBeenCalledWith(vps)
    expect(harness.createObserver).toHaveBeenCalledWith(
      expect.any(Function),
      { rootMargin: '-112px 0px -75% 0px' }
    )
  })

  it('activates the closest intersecting entry in the current batch', () => {
    const vps = createElement('group-vps')
    const docs = createElement('group-docs')
    const onActive = vi.fn()
    const harness = createObserverHarness()

    observeActiveGroups(['vps', 'docs'], onActive, {
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

  it('preserves the active group for an all-nonintersecting batch', () => {
    const vps = createElement('group-vps')
    const docs = createElement('group-docs')
    const onActive = vi.fn()
    const harness = createObserverHarness()

    observeActiveGroups(['vps', 'docs'], onActive, {
      getElementById: (id) => id === 'group-vps' ? vps : docs,
      createObserver: harness.createObserver,
    })
    harness.emit([createEntry(vps, 112, true)])
    onActive.mockClear()

    harness.emit([createEntry(docs, 400, false)])

    expect(onActive).not.toHaveBeenCalled()
  })

  it('disconnects the observer during cleanup', () => {
    const harness = createObserverHarness()
    const cleanup = observeActiveGroups(['vps'], vi.fn(), {
      getElementById: () => createElement('group-vps'),
      createObserver: harness.createObserver,
    })

    cleanup()

    expect(harness.observer.disconnect).toHaveBeenCalledTimes(1)
  })

  it('returns a no-op cleanup when observers are unsupported', () => {
    const getElementById = vi.fn()
    const cleanup = observeActiveGroups(['vps'], vi.fn(), {
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

    const cleanupFirst = observeActiveGroups(['vps'], vi.fn(), {
      getElementById: () => vps,
      createObserver: firstHarness.createObserver,
    })
    cleanupFirst()
    observeActiveGroups(['docs'], vi.fn(), {
      getElementById: () => docs,
      createObserver: secondHarness.createObserver,
    })

    expect(firstHarness.observer.observe).toHaveBeenCalledWith(vps)
    expect(firstHarness.observer.disconnect).toHaveBeenCalledTimes(1)
    expect(secondHarness.observer.observe).toHaveBeenCalledWith(docs)
  })
})
