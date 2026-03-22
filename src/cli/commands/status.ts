import type { Command } from "commander";
import chalk from "chalk";
import { loadConfig, resolveConfigPath, getConfigDir } from "../../core/config.js";
import { loadState } from "../../core/state.js";
import { resolveEnabledTypes } from "../../core/document-types.js";
import { resolveRepos, getRepoChanges } from "../../repos/manager.js";
import { getCommitCount } from "../../git/history.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show current documentation state")
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();

      try {
        const configPath = resolveConfigPath(globalOpts.config);
        const config = await loadConfig(globalOpts.config);
        const configDir = getConfigDir(configPath);
        const state = await loadState(configDir);
        const types = resolveEnabledTypes(config);

        const modeLabel =
          config.mode === "current" ? "this repo" : "remote repo(s)";

        console.log();
        console.log(
          `  Project: ${chalk.bold(config.project.name)} (${modeLabel})`
        );

        if (state?.lastGeneration) {
          const date = new Date(state.lastGeneration.timestamp);
          console.log(
            `  Last generation: ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
          );
        } else {
          console.log(`  Last generation: ${chalk.dim("never")}`);
        }

        const generatedCount = state
          ? Object.keys(state.documents).length
          : 0;
        const pendingCount = types.length - generatedCount;
        console.log(
          `  Documents: ${generatedCount} generated, ${Math.max(0, pendingCount)} pending`
        );

        // Repo state
        try {
          const repos = await resolveRepos(config, configPath);
          const repoChanges = getRepoChanges(repos, state);

          if (config.mode === "remote") {
            console.log();
            console.log(`  Repository state:`);
            for (const rc of repoChanges) {
              let statusStr: string;
              if (!rc.fromSha) {
                statusStr = chalk.yellow("not yet analyzed");
              } else if (rc.hasChanges) {
                try {
                  const count = await getCommitCount(
                    rc.repo.localPath,
                    rc.fromSha,
                    rc.toSha
                  );
                  statusStr = `${rc.fromSha.slice(0, 7)} → ${rc.toSha.slice(0, 7)} ${chalk.yellow(`(${count} commits behind)`)}`;
                } catch {
                  statusStr = `${rc.fromSha.slice(0, 7)} → ${rc.toSha.slice(0, 7)} ${chalk.yellow("(changes detected)")}`;
                }
              } else {
                statusStr = chalk.green("up to date");
              }
              console.log(
                `    ${rc.repo.name.padEnd(20)} ${statusStr}`
              );
            }
          } else {
            const rc = repoChanges[0];
            if (rc) {
              let repoStatus: string;
              if (!rc.fromSha) {
                repoStatus = chalk.yellow("not yet analyzed");
              } else if (rc.hasChanges) {
                try {
                  const count = await getCommitCount(
                    rc.repo.localPath,
                    rc.fromSha,
                    rc.toSha
                  );
                  repoStatus = `${rc.fromSha.slice(0, 7)} → ${rc.toSha.slice(0, 7)} (${count} commits behind)`;
                } catch {
                  repoStatus = `${rc.fromSha.slice(0, 7)} → ${rc.toSha.slice(0, 7)} (changes detected)`;
                }
              } else {
                repoStatus = chalk.green("up to date");
              }
              console.log(`  Repository: ${repoStatus}`);
            }
          }
        } catch (err: unknown) {
          console.error(
            chalk.dim(`  (Could not resolve repository state: ${(err as Error).message})`)
          );
        }

        console.log();
        console.log(`  Run 'onpush generate' to update.`);
        console.log();
      } catch (err: unknown) {
        console.error(chalk.red(`  Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });
}
