import { captureElementPng, HTML_CAPTURE_PIXEL_RATIO } from './htmlCapture'

export const DASHBOARD_EXPORT_WIDTH = 1600
export const DASHBOARD_EXPORT_PIXEL_RATIO = HTML_CAPTURE_PIXEL_RATIO

export async function captureDashboardPng(element: HTMLElement): Promise<Blob> {
  return captureElementPng(element)
}

export function dashboardPngFilename(projectId: number): string {
  return `project-${projectId}-dashboard.png`
}
