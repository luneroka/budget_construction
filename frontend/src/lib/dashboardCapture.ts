import { toBlob } from 'html-to-image'

export const DASHBOARD_EXPORT_WIDTH = 1600
export const DASHBOARD_EXPORT_PIXEL_RATIO = 2

export async function captureDashboardPng(element: HTMLElement): Promise<Blob> {
  await document.fonts.ready

  const blob = await toBlob(element, {
    backgroundColor: getComputedStyle(document.documentElement)
      .getPropertyValue('--background')
      .trim()
      ? `hsl(${getComputedStyle(document.documentElement)
          .getPropertyValue('--background')
          .trim()})`
      : '#ffffff',
    cacheBust: true,
    pixelRatio: DASHBOARD_EXPORT_PIXEL_RATIO,
    width: element.scrollWidth,
    height: element.scrollHeight,
    style: {
      width: `${element.scrollWidth}px`,
      height: `${element.scrollHeight}px`,
    },
  })

  if (!blob) {
    throw new Error('La capture du tableau de bord a échoué.')
  }

  return blob
}

export function dashboardPngFilename(projectId: number): string {
  return `project-${projectId}-dashboard.png`
}
