export const ORDER_EVENTS = {
  CREATED: 'order.created',
  STATUS_CHANGED: 'order.status_changed',
  CANCELLED: 'order.cancelled',
} as const;

export const INVENTORY_EVENTS = {
  RESERVED: 'inventory.reserved',
  CONFIRMED: 'inventory.confirmed',
  RELEASED: 'inventory.released',
  LOW_STOCK: 'inventory.low_stock',
} as const;
