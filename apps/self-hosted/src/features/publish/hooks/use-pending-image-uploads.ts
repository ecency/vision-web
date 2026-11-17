import { useSyncExternalStore } from 'react';
import {
  pendingImageUploads,
  subscribePendingImageUploads,
} from '../utils/image-upload-extension';

/**
 * Image uploads still running in any editor. Publish and Update wait for zero:
 * a post submitted mid-upload would go out without those images (#1462).
 */
export function usePendingImageUploads(): number {
  return useSyncExternalStore(subscribePendingImageUploads, pendingImageUploads, () => 0);
}
