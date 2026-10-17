const { FuseV1Options, FuseVersion } = require("@electron/fuses");
const { FusesPlugin } = require("@electron-forge/plugin-fuses");

module.exports = {
  packagerConfig: {
    asar: true,
    icon: "assets/Logo/Zegion.ico",
    // The main process uses only Electron and built-in Node modules. The web
    // runtime is staged separately under extraResource, so copying the full
    // Next/React dependency tree into app.asar would be redundant.
    prune: false,
    // Keep only the Electron shell and its manifest in app.asar. The Next
    // standalone runtime and its Node executable are added as extra resources.
    ignore: [/^\/(?!package\.json$|electron(?:\/|$))/],
    extraResource: [
      ".desktop/app-runtime",
      ".desktop/node.exe",
      ".desktop/node-runtime.json",
      "assets/Logo/app-icon.png",
    ],
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: { name: "zegion", setupIcon: "assets/Logo/Zegion.ico" },
    },
    { name: "@electron-forge/maker-zip", platforms: ["win32"] },
  ],
  plugins: [
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    }),
  ],
};
