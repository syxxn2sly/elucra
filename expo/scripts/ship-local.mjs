#!/usr/bin/env node
/**
 * One command to build a TestFlight-ready .ipa on this machine, without EAS.
 *
 *   npm run ship:local              bump the build number, commit it, archive, export
 *   npm run ship:local -- --no-bump archive and export at the current build number
 *
 * The last step is manual on purpose: the .ipa goes to App Store Connect by
 * dragging it into Transporter. Uploading from the command line means putting an
 * app-specific password on disk, and Transporter signs in on its own.
 *
 * Two things here are not obvious, and both cost a build cycle when forgotten:
 *
 *   - The archive must land OUTSIDE ios/build. Expo's codegen writes generated
 *     sources into ios/build/generated, and archiving into that same tree wipes
 *     them mid-build ("Build input file cannot be found: ...-generated.cpp").
 *
 *   - ~/Library/Developer/Xcode/DerivedData is a symlink to the BuildCache
 *     external drive, because a full archive needs more room than the internal
 *     disk has. No drive, no build — so check for it before spending ten minutes.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appJsonPath = resolve(projectDir, "app.json");
const iosDir = resolve(projectDir, "ios");
const archiveDir = resolve(projectDir, "ios-archive");
const archivePath = resolve(archiveDir, "Clairity.xcarchive");
const exportPath = resolve(archiveDir, "export");
const exportOptions = resolve(archiveDir, "ExportOptions.plist");

const TEAM_ID = "NTY73DX976";
const CACHE_VOLUME = "/Volumes/BuildCache";

const bump = !process.argv.includes("--no-bump");

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: projectDir, encoding: "utf8", ...opts });

const step = (msg) => console.log(`\n\x1b[1m› ${msg}\x1b[0m`);

// 1. The caches live on the external drive. Without it, DerivedData is a broken
//    symlink and xcodebuild fails in a way that does not mention the drive.
if (!existsSync(CACHE_VOLUME)) {
  console.error(
    `\n${CACHE_VOLUME} is not mounted.\n\n` +
      `Xcode's DerivedData and the CocoaPods cache are symlinked there. Plug the\n` +
      `BuildCache drive in and run again.\n`,
  );
  process.exit(1);
}

// 2. A dirty tree is not fatal here the way it is for EAS — xcodebuild archives
//    the working tree, not a commit — but shipping something you cannot point at
//    a commit is still worth a word.
const status = run("git", ["status", "--porcelain"]).trim();
const dirty = status
  .split("\n")
  .filter(Boolean)
  .filter((line) => !line.endsWith(".DS_Store"));

if (dirty.length > 0 && bump) {
  console.error("\nUncommitted changes — the bump commit would sweep them in:\n");
  console.error(dirty.map((l) => `  ${l}`).join("\n"));
  console.error("\nCommit or stash them, then run again (or pass --no-bump).\n");
  process.exit(1);
}

// 3. Bump. App Store Connect rejects a build number it has already seen.
const app = JSON.parse(readFileSync(appJsonPath, "utf8"));
const current = app.expo.ios.buildNumber;

if (bump) {
  if (!Number.isFinite(Number(current))) {
    console.error(`\nios.buildNumber is "${current}", which is not a number. Fix it in app.json first.\n`);
    process.exit(1);
  }

  const next = String(Number(current) + 1);
  app.expo.ios.buildNumber = next;
  if (app.expo.android?.versionCode !== undefined) {
    app.expo.android.versionCode = Number(next);
  }
  writeFileSync(appJsonPath, `${JSON.stringify(app, null, 2)}\n`);
  step(`Build number ${current} → ${next}`);

  run("git", ["add", "app.json"]);
  run("git", [
    "-c",
    "user.name=Syaan Merchant",
    "-c",
    "user.email=syaanmerchant09@icloud.com",
    "commit",
    "--author=Syaan Merchant <syaanmerchant09@icloud.com>",
    "-m",
    `Bump iOS build number to ${next}`,
  ]);
  step("Committed the bump");
} else {
  step(`Building at build number ${current} (no bump)`);
}

const building = app.expo.ios.buildNumber;

// 4. Archive. Stale output would otherwise be exported and look like a success.
rmSync(archivePath, { recursive: true, force: true });
rmSync(exportPath, { recursive: true, force: true });

step("Archiving — this takes a while");
console.log("");

try {
  run(
    "xcodebuild",
    [
      "-workspace", "Clairity.xcworkspace",
      "-scheme", "Clairity",
      "-configuration", "Release",
      "-archivePath", archivePath,
      "-allowProvisioningUpdates",
      `DEVELOPMENT_TEAM=${TEAM_ID}`,
      "CODE_SIGN_STYLE=Automatic",
      "archive",
    ],
    { cwd: iosDir, stdio: "inherit" },
  );
} catch {
  console.error(
    `\nArchive failed.${bump ? ` The bump to ${building} is already committed — fix the problem and run again;` +
      ` the next run moves to ${Number(building) + 1}, which is fine. Build numbers only have to increase.` : ""}\n`,
  );
  process.exit(1);
}

// 5. Export a signed .ipa for App Store distribution.
step("Exporting .ipa");
console.log("");

try {
  run(
    "xcodebuild",
    [
      "-exportArchive",
      "-archivePath", archivePath,
      "-exportPath", exportPath,
      "-exportOptionsPlist", exportOptions,
      "-allowProvisioningUpdates",
    ],
    { stdio: "inherit" },
  );
} catch {
  console.error("\nExport failed. The archive is still at:\n  " + archivePath + "\n");
  process.exit(1);
}

console.log(
  `\n\x1b[1m✓ Build ${building} ready\x1b[0m\n\n` +
    `  ${exportPath}/Clairity.ipa\n\n` +
    `Open Transporter, sign in, drag the .ipa in, and hit Deliver. It shows up in\n` +
    `TestFlight once App Store Connect finishes processing — usually 10-30 minutes.\n`,
);
