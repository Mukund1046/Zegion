const { app, BrowserWindow, dialog, shell } = require("electron");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const isDevelopment = !app.isPackaged;
app.setName("Zegion");
let serverProcess;
let mainWindow;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => mainWindow?.focus());
  app.whenReady().then(startApplication).catch(showStartupFailure);
}

async function startApplication() {
  const port = await getFreeLoopbackPort();
  const runtimeDir = isDevelopment
    ? path.join(__dirname, "..", ".desktop", "app-runtime")
    : path.join(process.resourcesPath, "app-runtime");
  const nodeBinary = isDevelopment
    ? path.join(__dirname, "..", ".desktop", "node.exe")
    : path.join(process.resourcesPath, "node.exe");

  if (isDevelopment) {
    const appRoot = path.resolve(__dirname, "..");
    serverProcess = spawn(
      nodeBinary,
      [path.join(appRoot, "node_modules", "next", "dist", "bin", "next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)],
      { cwd: appRoot, env: createServerEnv(port), stdio: "ignore", windowsHide: true }
    );
  } else {
    serverProcess = spawn(nodeBinary, [path.join(runtimeDir, "server.js")], {
      cwd: runtimeDir,
      env: createServerEnv(port),
      stdio: "ignore",
      windowsHide: true,
    });
  }

  serverProcess.once("error", (error) => {
    if (!quitting) showStartupFailure(error);
  });
  serverProcess.once("exit", (code) => {
    if (!quitting && code !== 0) {
      showStartupFailure(new Error(`The local app server stopped (exit code ${code ?? "unknown"}).`));
    }
  });

  const appUrl = `http://127.0.0.1:${port}/`;
  await waitForServer(appUrl);
  createMainWindow(appUrl);
}

function createServerEnv(port) {
  const userData = app.getPath("userData");
  const env = {
    ...process.env,
    NODE_ENV: isDevelopment ? "development" : "production",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    FT_DATA_DIR: process.env.FT_DATA_DIR || path.join(userData, "ft-bookmarks"),
    X_OUTPUT_DIR: process.env.X_OUTPUT_DIR || path.join(userData, "data", "output"),
    ZEGION_DESKTOP: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  return env;
}

function createMainWindow(appUrl) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 640,
    // Windows draws a bright separator below its native menu bar and does not
    // expose a styling hook for that system-owned border. Auto-hide removes
    // the strip at rest while retaining keyboard access through Alt.
    autoHideMenuBar: true,
    show: false,
    backgroundColor: "#f5f5f5",
    icon: isDevelopment
      ? path.join(__dirname, "..", "assets", "Logo", "app-icon.png")
      : path.join(process.resourcesPath, "app-icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const origin = new URL(appUrl).origin;
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin !== origin) {
        event.preventDefault();
        openExternalUrl(url);
      }
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.webContents.on("will-redirect", (event, url) => {
    try {
      if (new URL(url).origin !== origin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadURL(appUrl);
}

function openExternalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "https:" || url.protocol === "http:") {
      void shell.openExternal(url.toString());
    }
  } catch {
    // Invalid and non-web URLs are intentionally ignored.
  }
}

function getFreeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a local app port."));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function waitForServer(appUrl) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (!serverProcess || serverProcess.exitCode !== null) {
      throw new Error("The local app server exited before it became ready.");
    }
    try {
      const response = await fetch(new URL("api/status", appUrl));
      if (response.ok) return;
    } catch {
      // The Next server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error("The local app server did not become ready within 90 seconds.");
}

function stopServer() {
  if (!serverProcess?.pid || serverProcess.killed) return;
  if (process.platform === "win32") {
    spawn("taskkill.exe", ["/pid", String(serverProcess.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    serverProcess.kill("SIGTERM");
  }
}

function showStartupFailure(error) {
  if (quitting || !app.isReady()) return;
  quitting = true;
  dialog.showErrorBox(
    "Zegion could not start",
    `${error instanceof Error ? error.message : String(error)}\n\nYour bookmark data has not been changed.`
  );
  stopServer();
  app.quit();
}

app.on("before-quit", () => {
  quitting = true;
  stopServer();
});

app.on("window-all-closed", () => app.quit());
