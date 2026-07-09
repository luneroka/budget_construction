import type { Area } from 'react-easy-crop'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("L'image n'a pas pu être chargée."))
    image.src = src
  })
}

export async function cropImageToBlob(
  imageUrl: string,
  crop: Area,
): Promise<Blob> {
  const image = await loadImage(imageUrl)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error("La capture n'a pas pu être recadrée.")
  }

  canvas.width = crop.width
  canvas.height = crop.height
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error("La capture n'a pas pu être recadrée."))
      }
    }, 'image/png')
  })
}
