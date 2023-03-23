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
  ) => Effect<never, GitError, A>
}
export const GitRepo = Tag<GitRepo>()

const make = ({ simpleGit: opts = {}, userName, userEmail }: GitConfig) => {
  const clone = (url: string, dir: string) =>
    Do(($): GitRepo => {
      $(
        Effect.attemptCatchPromise(
          () => SG.simpleGit(opts).clone(url, dir),
          error => new GitError(error as any),
        ),
      )

      const git = SG.simpleGit(dir, opts)

      const run = <A>(f: (git: SG.SimpleGit) => Promise<A>) =>
        Effect.attemptCatchPromise(
          () => f(git),
          error => new GitError(error as any),
        )

      $(
        run(_ =>
          _.addConfig("user.name", userName).addConfig("user.email", userEmail),
        ),
      )

      return { git, run, path: dir }
    })

  return { clone }
}

export interface Git extends ReturnType<typeof make> {}
export const Git = Tag<Git>()
export const makeLayer = (_: Config.Wrap<GitConfig>) =>
  Config.unwrap(_).config.map(make).toLayer(Git)
