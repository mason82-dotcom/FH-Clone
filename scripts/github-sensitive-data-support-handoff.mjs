import fs from "node:fs";
import path from "node:path";

const includePrivate = process.argv.includes("--include-private");
const metadataDir =
  process.env.FH2_FILTER_REPO_DIR ??
  path.join(".git", "filter-repo");

const changedRefsPath = path.join(metadataDir, "changed-refs");
const firstChangedPath = path.join(
  metadataDir,
  "first-changed-commits"
);
const orphanedLfsPath = path.join(
  metadataDir,
  "orphaned_lfs_objects"
);

function readLines(filePath, required = true) {
  if (!fs.existsSync(filePath)) {
    if (required) {
      throw new Error(
        `filter-repo metadata missing: ${filePath}`
      );
    }
    return [];
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function countByPrefix(refs, prefix) {
  return refs.filter((ref) => ref.startsWith(prefix)).length;
}

try {
  const changedRefs = readLines(changedRefsPath);
  const firstChangedCommits = readLines(firstChangedPath);
  const orphanedLfsObjects = readLines(
    orphanedLfsPath,
    false
  );

  const pullRefs = changedRefs.filter((ref) =>
    /^refs\/pull\/\d+\/head$/.test(ref)
  );
  const branchRefs = countByPrefix(
    changedRefs,
    "refs/heads/"
  );
  const tagRefs = countByPrefix(
    changedRefs,
    "refs/tags/"
  );
  const otherRefs =
    changedRefs.length -
    pullRefs.length -
    branchRefs -
    tagRefs;

  console.log("FH2 GitHub Sensitive-Data Support Handoff");
  console.log("========================================");
  console.log(
    "PRIVATE SUPPORT DATA: nicht in öffentliche Issues, PRs oder Logs kopieren."
  );
  console.log("");
  console.log(`changed refs: ${changedRefs.length}`);
  console.log(`affected pull-request refs: ${pullRefs.length}`);
  console.log(`changed branch refs: ${branchRefs}`);
  console.log(`changed tag refs: ${tagRefs}`);
  console.log(`changed other refs: ${otherRefs}`);
  console.log(
    `first changed commits: ${firstChangedCommits.length}`
  );
  console.log(
    `orphaned LFS objects: ${orphanedLfsObjects.length}`
  );

  if (!includePrivate) {
    console.log("");
    console.log(
      "Private IDs ausgeblendet. Für das private GitHub-Supportticket erneut mit --include-private ausführen."
    );
    process.exit(0);
  }

  console.log("");
  console.log("PRIVATE DETAILS");
  console.log("---------------");

  console.log("Affected PR refs:");
  if (pullRefs.length === 0) {
    console.log("(none)");
  } else {
    pullRefs.forEach((ref) => console.log(ref));
  }

  console.log("");
  console.log("First Changed Commit(s):");
  firstChangedCommits.forEach((sha) =>
    console.log(sha)
  );

  if (orphanedLfsObjects.length > 0) {
    console.log("");
    console.log(
      `Orphaned LFS metadata file: ${orphanedLfsPath}`
    );
    console.log(
      "Diese Datei nur über das private GitHub-Supportticket übertragen."
    );
  }
} catch (error) {
  console.error(
    "FH2_SUPPORT_HANDOFF_ERROR:",
    error instanceof Error ? error.message : String(error)
  );
  console.error(
    "Verwende den lokalen Clone, in dem git-filter-repo --sensitive-data-removal ausgeführt wurde. Nicht blind erneut filtern."
  );
  process.exitCode = 2;
}
