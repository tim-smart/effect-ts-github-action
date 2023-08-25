import * as OS from "node:os"
import * as Path from "node:path"
import { context } from "@actions/github"
import { FileSystem } from "./_common"
import { Config, Context, Effect, Layer, Option } from "effect"

export const make = Effect.gen(function* (_) {
  const fs = yield* _(FileSystem.FileSystem)
  const tmpDir = yield* _(
    Config.string("RUNNER_TEMP"),
    Config.withDefault(OS.tmpdir()),
    Effect.config,
  )

  const mkTmpDir = (path: string) => {
    const dir = Path.join(tmpDir, path)
    return fs
      .remove(dir, { recursive: true })
      .pipe(
        Effect.ignore,
        Effect.zipRight(fs.makeDirectory(dir)),
        Effect.as(dir),
      )
  }

  const issue = Option.fromNullable(context.issue.number).pipe(
    Option.as(context.issue),
  )

  return { tmpDir, mkTmpDir, issue } as const
})

export interface RunnerEnv extends Effect.Effect.Success<typeof make> {}
export const RunnerEnv = Context.Tag<RunnerEnv>()
export const RunnerEnvLive = Layer.effect(RunnerEnv, make).pipe(
  Layer.use(FileSystem.layer),
)
