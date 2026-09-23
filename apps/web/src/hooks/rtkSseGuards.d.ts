import type {
  RtkDeviceSnapshot,
  RtkStatusEvent,
  RtkTransitionEvent
} from "../types/rtk.js";

export function parseSseJsonEvent(event: Event): unknown | undefined;
export function asRtkSnapshotPayload(
  value: unknown
): RtkDeviceSnapshot[] | undefined;
export function isRtkStatusEvent(value: unknown): value is RtkStatusEvent;
export function isRtkTransitionEvent(
  value: unknown
): value is RtkTransitionEvent;
