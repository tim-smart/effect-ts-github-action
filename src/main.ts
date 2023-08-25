import { runMain } from "@effect/platform-node/Runtime"
import * as Dotenv from "dotenv"
import { Config, Effect, Layer } from "effect"
import * as Git from "./Git"
import * as Github from "./Github"
import { input, inputSecret, nonEmptyString } from "./utils/config"

// Dotenv for testing in development
Dotenv.config()

// Setup the Git client layer
const GitLive = Git.layer({
  userName: nonEmptyString("github_actor"),
  userEmail: nonEmptyString("github_actor").pipe(
    Config.map(_ => `${_}@users.noreply.github.com`),
  ),
  simpleGit: Config.succeed({}),
})

// Setup the Github API
const GithubLive = Github.layer({
  token: inputSecret("github_token"),
})

// Build the environment for your program
const EnvLive = Layer.mergeAll(GitLive, GithubLive)

Effect.gen(function* (_) {
  const name = yield* _(Effect.config(input("name")))
  yield* _(Effect.logInfo(`Hello there ${name}!`))
}).pipe(
  Effect.tapErrorCause(Effect.logError),
  Effect.provideLayer(EnvLive),
  runMain,
)
