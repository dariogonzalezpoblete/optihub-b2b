import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EnrichedMarco } from '@/lib/catalog/types';

interface RecentState {
  recentItems: EnrichedMarco[];
  addRecentItem: (item: EnrichedMarco) => void;
  clearRecent: () => void;
}

export const useRecentStore = create<RecentState>()(
  persist(
    (set, get) => ({
      recentItems: [],
      addRecentItem: (item) => {
        const current = get().recentItems;
        // Check if it already exists (by ID or group key)
        const existsIndex = current.findIndex((m) => m.id_ext === item.id_ext);
        
        let newItems = [...current];
        if (existsIndex >= 0) {
          // Remove it from current position
          newItems.splice(existsIndex, 1);
        }
        
        // Add to the beginning
        newItems.unshift(item);
        
        // Keep only top 5
        if (newItems.length > 5) {
          newItems = newItems.slice(0, 5);
        }
        
        set({ recentItems: newItems });
      },
      clearRecent: () => set({ recentItems: [] })
    }),
    {
      name: 'optihub-b2b-recent',
    }
  )
);
