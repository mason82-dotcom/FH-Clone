import { useEffect, useState } from "react";

import { subscribeFh2Event } from "./events.js";
import { useFh2 } from "./Fh2Provider.js";

export function useFh2CesiumViewer(viewerKey = "global") {
  const { state } = useFh2();
  const [viewer, setViewer] = useState<unknown>(undefined);

  useEffect(() => {
    if (state !== "ready") {
      setViewer(undefined);
      return;
    }

    const sync = () => {
      setViewer(window.FH2.cesiumViewer?.[viewerKey]);
    };

    sync();
    return subscribeFh2Event("cesium-viewer-change", sync);
  }, [state, viewerKey]);

  return viewer;
}
