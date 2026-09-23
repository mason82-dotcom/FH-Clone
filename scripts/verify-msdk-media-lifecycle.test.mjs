import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const mediaControllerPath =
  "android/fh2-rc-bridge/app/src/main/java/com/fh2/rcbridge/MediaLibraryController.kt";

const source = fs.readFileSync(mediaControllerPath, "utf8");

function enableLifecycleBlock() {
  const start = source.indexOf("manager.enable(");
  const end = source.indexOf("\n    fun refresh(", start);

  assert.notEqual(start, -1, "manager.enable block missing");
  assert.notEqual(end, -1, "refresh boundary missing");

  return source.slice(start, end);
}

test("media enable failure removes registered DJI media listeners", () => {
  const block = enableLifecycleBlock();

  assert.match(
    block,
    /override fun onFailure\(error: IDJIError\)[\s\S]*removeAllMediaFileListStateListener\(\)/
  );
});

test("media enable failure clears cached files and returns controller inactive", () => {
  const block = enableLifecycleBlock();

  assert.match(block, /filesByIndex\.clear\(\)/);
  assert.match(block, /active\.set\(false\)/);

  assert.ok(
    block.indexOf("filesByIndex.clear()") <
      block.indexOf("active.set(false)"),
    "cache cleanup must happen before the controller is made restartable"
  );
});
