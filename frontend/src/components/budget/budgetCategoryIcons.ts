import {
  DoorOpen,
  Droplets,
  HardHat,
  Paintbrush,
  PaintRoller,
  Shovel,
  Trees,
  type LucideIcon,
} from 'lucide-react'

export const categoryIcons: Record<string, LucideIcon> = {
  'Terrain & Préparation': Shovel,
  Viabilisation: Droplets,
  'Gros œuvre': HardHat,
  Menuiseries: DoorOpen,
  'Second œuvre': PaintRoller,
  Finitions: Paintbrush,
  Extérieurs: Trees,
}
