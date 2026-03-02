export interface ItemInstance {
  itemId: string;
  defId: string;
  createdAt: string;
  durability?: number;
  mods?: Record<string, unknown>;
}

export interface PlayerInventory {
  playerId: string;
  instances: Record<string, ItemInstance>;
  stacks: Record<string, number>;
}
