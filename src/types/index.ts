/**
 * Core type definitions for VPS Guardian.
 *
 * Every module, result, and config shape is defined here
 * to ensure strict typing across the entire codebase.
 */

// ---------------------------------------------------------------------------
// Module result types
// ---------------------------------------------------------------------------

/** The overall outcome of a module run. */
export type ModuleStatus = 'healthy' | 'warning' | 'critical' | 'skipped';

/** The severity level attached to a module result. */
export type Severity = 'info' | 'warning' | 'critical';

/**
 * The standardized result object returned by every module.
 */
export interface ModuleResult {
  /** Unique module identifier (e.g. "aide", "clamav") */
  readonly module: string;

  /** Human-readable module name */
  readonly name: string;

  /** Overall status of the module run */
  readonly status: ModuleStatus;

  /** Severity level for notification routing */
  readonly severity: Severity;

  /** Short summary suitable for a notification title */
  readonly summary: string;

  /** Detailed findings as lines of text */
  readonly details: string[];

  /** Execution duration in milliseconds */
  readonly duration: number;

  /** ISO timestamp of when the run completed */
  readonly timestamp: string;
}

// ---------------------------------------------------------------------------
// Module interface
// ---------------------------------------------------------------------------

/**
 * Interface that every Guardian module must implement.
 */
export interface IModule {
  /** Unique identifier (snake_case) */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Short description of what the module monitors */
  readonly description: string;

  /**
   * Check whether the required tool is installed on this system.
   * Modules that are not installed must return `skipped` from `run()`.
   */
  isInstalled(): Promise<boolean>;

  /**
   * Execute the module's checks and return a standardized result.
   * Must never throw — all errors should be captured in the result.
   */
  run(): Promise<ModuleResult>;
}

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

/** Discord-specific notification settings. */
export interface DiscordConfig {
  /** Discord webhook URL */
  readonly webhook: string;

  /** When to send notifications: 'always' | 'warning' | 'critical' */
  readonly notify_on: 'always' | 'warning' | 'critical';

  /** Username to display in Discord */
  readonly username: string;

  /** Optional avatar URL */
  readonly avatar_url?: string;
}

/** Notification behaviour preferences. */
export interface NotificationConfig {
  /** Send a notification even when everything is healthy */
  readonly always_notify: boolean;

  /** Include detailed findings in notifications */
  readonly include_details: boolean;
}

/**
 * Full Guardian configuration, typically loaded from `guardian.yml`.
 */
export interface GuardianConfig {
  /** Server hostname shown in notifications */
  readonly hostname: string;

  /** Discord notification settings */
  readonly discord: DiscordConfig;

  /** List of module IDs that are enabled */
  readonly modules: string[];

  /** File/directory paths for malware scanners */
  readonly scan_paths: string[];

  /** Directory where Guardian writes its logs */
  readonly log_dir: string;

  /** Notification behaviour */
  readonly notifications: NotificationConfig;

  /** Maldet-specific configuration */
  readonly maldet?: {
    readonly scan_recent?: boolean;
    readonly recent_days?: number;
  };
}

// ---------------------------------------------------------------------------
// Exec utility types
// ---------------------------------------------------------------------------

/** Output from a shell command execution. */
export interface CommandOutput {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly timedOut: boolean;
}

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

/** Summary entry used in the weekly report. */
export interface ReportEntry {
  readonly module: string;
  readonly name: string;
  readonly status: ModuleStatus;
  readonly severity: Severity;
  readonly summary: string;
}

/** The aggregated weekly security report. */
export interface WeeklyReport {
  readonly hostname: string;
  readonly generatedAt: string;
  readonly overallStatus: ModuleStatus;
  readonly securityScore: number;
  readonly entries: ReportEntry[];
}
