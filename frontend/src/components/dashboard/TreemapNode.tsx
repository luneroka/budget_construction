import { chartColors } from './utils'

type TreemapNodeProps = {
  x?: number
  y?: number
  width?: number
  height?: number
  category_name?: string
  fill?: string
}

export function CategoryTreemapNode(props: unknown) {
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    category_name: categoryName = '',
    fill = chartColors.primary,
  } = props as TreemapNodeProps
  const canShowLabel = width >= 90 && height >= 36

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="hsl(var(--card))"
        strokeWidth={2}
      />
      {canShowLabel ? (
        <text
          x={x + 10}
          y={y + 22}
          fill="hsl(var(--primary-foreground))"
          fontSize={12}
          fontWeight={600}
        >
          {categoryName}
        </text>
      ) : null}
    </g>
  )
}
