import * as Git from "./Git"
import * as Github from "./Github"
import * as Dotenv from "dotenv"

// Dotenv for testing in development
Dotenv.config()

// Setup the Git client layer
const GitLive = Git.makeLayer({
  userName: Config.string("github_actor"),
  userEmail: Config.string("github_actor").map(
    _ => `${_}@users.noreply.github.com`,
  ),
  simpleGit: Config.succeed({}),
})

// Setup the Github API
const GithubLive = Github.makeLayer(
  Config.struct({
    token: Config.secret("github_token"),
  }).nested("input"),
)

// Build the environment for your program
const EnvLive = GitLive + GithubLive

const program = Do($ => {
  // Extract input variables
  const { name } = $(
    Config.struct({
      name: Config.string("name"),
    }).nested("input").config,
  )

  // Implement program here
  $(Effect.logInfo(`Hello there ${name}!`))
})

program
  .catchAllCause(_ =>
    Effect.sync(() => {
      console.error(_.squash)
    }),
  )
  .provideLayer(EnvLive)
  .withConfigProvider(ConfigProvider.fromEnv().upperCase)
  .runMain()
