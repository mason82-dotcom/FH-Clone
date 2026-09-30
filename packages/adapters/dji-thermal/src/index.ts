import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export const DJI_THERMAL_SDK_VERSION = "1.8";
export const DJI_THERMAL_SDK_RELEASE_DATE = "2025-12-11";

export type DjiThermalMeasureFormat = "int16" | "float32";

export interface DjiThermalSdkOptions {
  sdkHome?: string;
  irpBin?: string;
  libDir?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  timeoutMs?: number;
}

export interface DjiThermalSdkStatus {
  version: string;
  releaseDate: string;
  platform: NodeJS.Platform;
  arch: string;
  ready: boolean;
  source: "explicit" | "sdk-home" | "none";
  irpPath?: string;
  libDir?: string;
  reason?: string;
}

export interface DjiThermalCommandResult {
  stdout: string;
  stderr: string;
}

interface ResolvedLayout {
  source: "explicit" | "sdk-home";
  irpPath: string;
  libDir?: string;
}

export class DjiThermalSdkCli {
  private readonly platform: NodeJS.Platform;
  private readonly arch: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: DjiThermalSdkOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.arch = options.arch ?? process.arch;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async status(): Promise<DjiThermalSdkStatus> {
    const layout = resolveDjiThermalSdkLayout({
      ...this.options,
      platform: this.platform,
      arch: this.arch
    });

    if (!layout) {
      return {
        version: DJI_THERMAL_SDK_VERSION,
        releaseDate: DJI_THERMAL_SDK_RELEASE_DATE,
        platform: this.platform,
        arch: this.arch,
        ready: false,
        source: "none",
        reason: unsupportedReason(this.options, this.platform, this.arch)
      };
    }

    const executable = await isExecutable(layout.irpPath);
    if (!executable) {
      return {
        version: DJI_THERMAL_SDK_VERSION,
        releaseDate: DJI_THERMAL_SDK_RELEASE_DATE,
        platform: this.platform,
        arch: this.arch,
        ready: false,
        source: layout.source,
        irpPath: layout.irpPath,
        ...(layout.libDir ? { libDir: layout.libDir } : {}),
        reason: "dji_irp_not_executable"
      };
    }

    return {
      version: DJI_THERMAL_SDK_VERSION,
      releaseDate: DJI_THERMAL_SDK_RELEASE_DATE,
      platform: this.platform,
      arch: this.arch,
      ready: true,
      source: layout.source,
      irpPath: layout.irpPath,
      ...(layout.libDir ? { libDir: layout.libDir } : {})
    };
  }

  async probe(): Promise<DjiThermalCommandResult> {
    return this.run(["--help"], 10_000);
  }

  async measureRjpeg(
    sourcePath: string,
    outputPath: string,
    format: DjiThermalMeasureFormat = "float32"
  ): Promise<DjiThermalCommandResult> {
    return this.run([
      "-s",
      path.resolve(sourcePath),
      "-a",
      "measure",
      "-o",
      path.resolve(outputPath),
      "--measurefmt",
      format
    ]);
  }

  async extractRaw16(
    sourcePath: string,
    outputPath: string
  ): Promise<DjiThermalCommandResult> {
    return this.run([
      "-s",
      path.resolve(sourcePath),
      "-a",
      "extract",
      "-o",
      path.resolve(outputPath)
    ]);
  }

  async renderPseudoColor(
    sourcePath: string,
    outputPath: string,
    palette: string
  ): Promise<DjiThermalCommandResult> {
    if (!/^[A-Za-z0-9_-]+$/.test(palette)) {
      throw new Error("invalid_thermal_palette");
    }

    return this.run([
      "-s",
      path.resolve(sourcePath),
      "-a",
      "process",
      "-o",
      path.resolve(outputPath),
      "-p",
      palette
    ]);
  }

  private async run(
    args: string[],
    timeoutMs = this.timeoutMs
  ): Promise<DjiThermalCommandResult> {
    const layout = resolveDjiThermalSdkLayout({
      ...this.options,
      platform: this.platform,
      arch: this.arch
    });
    if (!layout) {
      throw new Error(
        unsupportedReason(this.options, this.platform, this.arch)
      );
    }
    if (!(await isExecutable(layout.irpPath))) {
      throw new Error("dji_irp_not_executable");
    }

    return runProcess(
      layout.irpPath,
      args,
      buildEnvironment(process.env, this.platform, layout.libDir),
      timeoutMs
    );
  }
}

export function resolveDjiThermalSdkLayout(
  options: DjiThermalSdkOptions = {}
): ResolvedLayout | undefined {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;

  if (options.irpBin) {
    return {
      source: "explicit",
      irpPath: path.resolve(options.irpBin),
      ...(options.libDir ? { libDir: path.resolve(options.libDir) } : {})
    };
  }

  if (!options.sdkHome) return undefined;

  const home = path.resolve(options.sdkHome);
  const suffix = platformLayout(platform, arch);
  if (!suffix) return undefined;

  const executable = platform === "win32" ? "dji_irp.exe" : "dji_irp";
  return {
    source: "sdk-home",
    irpPath: path.join(
      home,
      "utility",
      "bin",
      suffix.platformDir,
      suffix.releaseDir,
      executable
    ),
    libDir: path.join(
      home,
      "tsdk-core",
      "lib",
      suffix.platformDir,
      suffix.releaseDir
    )
  };
}

export function createDjiThermalSdkFromEnv(
  env: NodeJS.ProcessEnv = process.env
): DjiThermalSdkCli {
  return new DjiThermalSdkCli({
    ...(env.DJI_TSDK_HOME ? { sdkHome: env.DJI_TSDK_HOME } : {}),
    ...(env.DJI_TSDK_IRP_BIN ? { irpBin: env.DJI_TSDK_IRP_BIN } : {}),
    ...(env.DJI_TSDK_LIB_DIR ? { libDir: env.DJI_TSDK_LIB_DIR } : {})
  });
}

function platformLayout(
  platform: NodeJS.Platform,
  arch: string
): { platformDir: string; releaseDir: string } | undefined {
  if (platform === "linux") {
    if (arch === "x64") {
      return { platformDir: "linux", releaseDir: "release_x64" };
    }
    if (arch === "ia32") {
      return { platformDir: "linux", releaseDir: "release_x86" };
    }
    return undefined;
  }

  if (platform === "win32") {
    if (arch === "x64") {
      return { platformDir: "windows", releaseDir: "release_x64" };
    }
    if (arch === "ia32") {
      return { platformDir: "windows", releaseDir: "release_x86" };
    }
  }

  return undefined;
}

function unsupportedReason(
  options: DjiThermalSdkOptions,
  platform: NodeJS.Platform,
  arch: string
): string {
  if (!options.sdkHome && !options.irpBin) return "dji_tsdk_not_configured";
  if (platform === "linux" && arch === "arm64" && !options.irpBin) {
    return "official_v1_8_has_no_known_linux_arm64_layout";
  }
  return "unsupported_dji_tsdk_platform_arch";
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function buildEnvironment(
  base: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  libDir: string | undefined
): NodeJS.ProcessEnv {
  if (!libDir) return { ...base };

  if (platform === "linux") {
    return {
      ...base,
      LD_LIBRARY_PATH: [libDir, base.LD_LIBRARY_PATH]
        .filter(Boolean)
        .join(":")
    };
  }

  if (platform === "win32") {
    return {
      ...base,
      PATH: [libDir, base.PATH].filter(Boolean).join(";")
    };
  }

  return { ...base };
}

function runProcess(
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number
): Promise<DjiThermalCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("dji_tsdk_timeout"));
    }, timeoutMs);
    timer.unref();

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.once("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`dji_tsdk_spawn_failed: ${error.message}`));
    });

    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            `dji_tsdk_command_failed: code=${code ?? "null"} signal=${signal ?? "none"}`
          )
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}
