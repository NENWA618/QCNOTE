declare module '@dnd-kit/core' {
  export const DndContext: any;
  export const closestCenter: any;
  export const KeyboardSensor: any;
  export const PointerSensor: any;
  export function useSensor(sensor: any, options?: any): any;
  export function useSensors(...sensors: any[]): any;
  export type DragEndEvent = any;
}
