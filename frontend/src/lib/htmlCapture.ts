import { toBlob } from 'html-to-image'

export const HTML_CAPTURE_PIXEL_RATIO = 2

export function captureBackgroundColor() {
  const background = getComputedStyle(document.documentElement)
    .getPropertyValue('--background')
    .trim()

  return background ? `hsl(${background})` : '#ffffff'
}

export async function captureElementPng(element: HTMLElement): Promise<Blob> {
  await document.fonts.ready

  const blob = await toBlob(element, {
    backgroundColor: captureBackgroundColor(),
    cacheBust: true,
    filter: (node) =>
      !(node instanceof HTMLElement && node.dataset.captureIgnore === 'true'),
    pixelRatio: HTML_CAPTURE_PIXEL_RATIO,
    width: element.scrollWidth,
    height: element.scrollHeight,
    style: {
      width: `${element.scrollWidth}px`,
      height: `${element.scrollHeight}px`,
    },
  })

  if (!blob) {
    throw new Error('La capture a échoué.')
  }

  return blob
}
