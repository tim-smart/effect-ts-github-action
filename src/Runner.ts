import * as OS from "node:os"
import * as Path from "node:path"
import { LiveNodeFs, NodeFs } from "@effect/node/Fs"
import { context } from "@actions/github"
import type { Option } from "@effect/data/Option"

export const make = Do($ => {
  const fs = $(NodeFs.access)
  const runnerTemp = $(Config.string("RUNNER_TEMP").optional.config)
  const tmpDir = runnerTemp.getOrElse(OS.tmpdir)

  const mkTmpDir = (path: string) => {
    const dir = Path.join(tmpDir, path)
    return fs
      .rm(dir, { force: true, recursive: true })
      .zipRight(fs.mkdir(dir))
      .as(dir)
  }

  const issue = Option.fromNullable(context.issue.number).as(context.issue)

  return { tmpDir, mkTmpDir, issue }
})

export interface RunnerEnv extends Effect.Success<typeof make> {}
export const RunnerEnv = Tag<RunnerEnv>()
export const RunnerEnvLive = LiveNodeFs >> make.toLayer(RunnerEnv)
