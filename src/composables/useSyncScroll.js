export function useSyncScroll() {
  function onScroll(e, groupKey) {
    const scrollLeft = e.currentTarget.scrollLeft
    document.querySelectorAll(`[data-sync-scroll="${groupKey}"]`).forEach((el) => {
      if (el !== e.currentTarget && el.scrollLeft !== scrollLeft) el.scrollLeft = scrollLeft
    })
  }

  return { onScroll }
}
