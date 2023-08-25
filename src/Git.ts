import { Config, Context, Effect, Layer } from "effect"
import * as SG from "simple-git"

/**
 * A simple wrapper around simple-git.
 *
 * It exposes a `clone` method for working with git repositories.
 */

export class GitError {
  readonly _tag = "GitError"
  constructor(readonly error: SG.GitError) {}
}

export interface GitConfig extends Partial<SG.SimpleGitOptions> {
  simpleGit?: Partial<SG.SimpleGitOptions>
  userName: string
  userEmail: string
}

export interface GitRepo {
  readonly path: string
  readonly git: SG.SimpleGit
  readonly run: <A>(
    f: (git: SG.SimpleGit) => Promise<A>,
  ) => Effect.Effect<never, GitError, A>
}
export const GitRepo = Context.Tag<GitRepo>()

const make = ({ simpleGit: opts = {}, userName, userEmail }: GitConfig) => {
  const clone = (url: string, dir: string) =>
    Effect.gen(function* (_) {
      yield* _(
        Effect.tryPromise({
          try: () => SG.simpleGit(opts).clone(url, dir),
          catch: error => new GitError(error as any),
        }),
      )

      const git = SG.simpleGit(dir, opts)

      const run = <A>(f: (git: SG.SimpleGit) => Promise<A>) =>
        Effect.tryPromise({
          try: () => f(git),
          catch: error => new GitError(error as any),
        })

      yield* _(
        run(_ =>
          _.addConfig("user.name", userName).addConfig("user.email", userEmail),
        ),
      )

      return GitRepo.of({ git, run, path: dir })
    })

  return { clone } as const
}

export interface Git extends ReturnType<typeof make> {}
export const Git = Context.Tag<Git>()
export const layer = (_: Config.Config.Wrap<GitConfig>) =>
  Effect.config(Config.unwrap(_)).pipe(Effect.map(make), Layer.effect(Git))
