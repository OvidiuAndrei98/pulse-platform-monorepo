const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test } = require('node:test');

// Validate the actual native configuration with Capacitor's own tooling.
// These checks do not replace building Swift and launching on an iPhone.
const cliRequire = createRequire(require.resolve('@capacitor/cli/package.json'));
const plist = cliRequire('plist');
const xcode = cliRequire('xcode');
const semver = cliRequire('semver');
const appDir = path.resolve(__dirname, '..');
const info = plist.parse(fs.readFileSync(path.join(appDir, 'ios/App/App/Info.plist'), 'utf8'));

test('iOS declares one programmatic application scene without a second storyboard window', () => {
  const manifest = info.UIApplicationSceneManifest;
  assert.ok(manifest, 'An iOS 27 SDK build needs a scene manifest to launch');
  assert.equal(manifest.UIApplicationSupportsMultipleScenes, false);
  const scenes = manifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication;
  assert.equal(scenes.length, 1);
  assert.ok(scenes[0].UISceneConfigurationName);
  assert.ok(scenes[0].UISceneDelegateClassName);
  assert.equal(info.UIMainStoryboardFile, undefined);
  assert.equal(scenes[0].UISceneStoryboardFile, undefined);
  assert.equal(info.UILaunchStoryboardName, 'LaunchScreen');
});

test('the configured scene delegate is included in the App target and exists on disk', () => {
  const project = xcode.project(path.join(appDir, 'ios/App/App.xcodeproj/project.pbxproj')).parseSync();
  const objects = project.hash.project.objects;
  const target = project.getFirstTarget().firstTarget;
  const sourceFiles = target.buildPhases.flatMap(({ value }) =>
    objects.PBXSourcesBuildPhase[value]?.files ?? []
  ).map(({ value }) => objects.PBXFileReference[objects.PBXBuildFile[value].fileRef]);
  const appGroup = Object.values(objects.PBXGroup).find(group => group.path === 'App');
  const groupedFiles = appGroup.children.map(({ value }) => objects.PBXFileReference[value]?.path);
  const scenes = info.UIApplicationSceneManifest?.UISceneConfigurations.UIWindowSceneSessionRoleApplication;
  assert.ok(scenes?.length, 'The scene configuration must be present');
  for (const scene of scenes) {
    const prefix = '$(PRODUCT_MODULE_NAME).';
    assert.ok(scene.UISceneDelegateClassName.startsWith(prefix));
    const filename = scene.UISceneDelegateClassName.slice(prefix.length) + '.swift';
    assert.equal(sourceFiles.filter(file => file.path === filename).length, 1, `${filename} must compile exactly once`);
    assert.ok(groupedFiles.includes(filename), `${filename} must resolve inside the App group`);
    assert.ok(fs.existsSync(path.join(appDir, 'ios/App/App', filename)));
  }
  assert.ok(sourceFiles.some(file => file.path === 'AppViewController.swift'), 'Keep the custom native plugins in the build');
});

test('installed Capacitor bridge and platform packages use the same scene-capable release', () => {
  const version = require('@capacitor/core/package.json').version;
  assert.ok(semver.satisfies(version, '>=8.5.2 <9'));
  for (const name of ['cli', 'ios', 'android']) {
    assert.equal(require(`@capacitor/${name}/package.json`).version, version);
  }
  const storageRequire = createRequire(require.resolve('@aparajita/capacitor-secure-storage/package.json'));
  assert.equal(storageRequire('@capacitor/core/package.json').version, version, 'Secure storage must use the same bridge release');
});
