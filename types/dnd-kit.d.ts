declare module '@dnd-kit/core' {
  export const DndContext: any;
  export const closestCenter: any;
  export const KeyboardSensor: any;
  export const PointerSensor: any;
  export function useSensor(sensor: any, options?: any): any;
  export function useSensors(...sensors: any[]): any;
  export type DragEndEvent = any;
}

declare module '@dnd-kit/sortable' {
  export function arrayMove(items: any[], oldIndex: number, newIndex: number): any[];
  export const SortableContext: any;
  export const sortableKeyboardCoordinates: any;
  export const verticalListSortingStrategy: any;
  export function useSortable(options: any): any;
}

declare module '@dnd-kit/utilities' {
  export const CSS: any;
}
