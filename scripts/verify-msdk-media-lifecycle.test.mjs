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


const bridgeClientPath =
  "android/fh2-rc-bridge/app/src/main/java/com/fh2/rcbridge/Fh2BridgeClient.kt";
const mediaActivityPath =
  "android/fh2-rc-bridge/app/src/main/java/com/fh2/rcbridge/MediaActivity.kt";

const bridgeSource = fs.readFileSync(bridgeClientPath, "utf8");
const activitySource = fs.readFileSync(mediaActivityPath, "utf8");

test("media upload remains an explicit user action after local download", () => {
  assert.match(source, /fun uploadLastDownload\(\)/);
  assert.match(source, /Fh2BridgeClient\.uploadMedia\(/);
  assert.match(
    activitySource,
    /Letzten Download zu FH2 hochladen/
  );
  assert.doesNotMatch(
    source.slice(
      source.indexOf("override fun onFinish()"),
      source.indexOf("override fun onFailure", source.indexOf("override fun onFinish()"))
    ),
    /uploadMedia\(/
  );
});

test("large media upload uses a dedicated executor and the paired agent token", () => {
  assert.match(
    bridgeSource,
    /private val mediaExecutor\s*=\s*Executors\.newSingleThreadExecutor\(\)/
  );
  assert.match(
    bridgeSource,
    /val token = agentToken[\s\S]*api\/msdk\/media\/upload-url/
  );
  assert.doesNotMatch(bridgeSource, /MEDIA_INGEST_TOKEN/);
});

test("generic MSDK upload does not invent historical capture metadata", () => {
  const start = bridgeSource.indexOf("fun uploadMedia(");
  const end = bridgeSource.indexOf("\n    fun addListener(", start);
  assert.notEqual(start, -1, "uploadMedia block missing");
  assert.notEqual(end, -1, "uploadMedia boundary missing");
  const block = bridgeSource.slice(start, end);

  assert.match(block, /put\("profile", "GENERIC"\)/);
  assert.match(block, /put\("kind", "unknown"\)/);
  assert.match(block, /put\("confidence", "unavailable"\)/);
  assert.match(block, /put\("deviceId", aircraftSn\)/);
  assert.doesNotMatch(block, /latitudeDeg|longitudeDeg|capturedAt|rtkFixed/);
});
